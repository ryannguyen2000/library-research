const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const { rangeDate } = require('@utils/date');
const { Services, PromotionType } = require('@utils/const');

const { Schema } = mongoose;

const tbPriceSchema = new Schema(
	{
		// listingId: { type: Schema.Types.ObjectId, ref: 'Listing' },
		roomTypeId: { type: Schema.Types.ObjectId, ref: 'RoomType' },
		ratePlanId: { type: Number, ref: 'RatePlan' },
		otaListingId: String,
		date: Date,
		available: Number,
		price: Number,
		promotionPrice: Number,
		promotionId: { type: Schema.Types.ObjectId, ref: 'tbPromotion' },
		// price for hours
		priceFirstHours: Number,
		hourlyPromotionId: { type: Schema.Types.ObjectId, ref: 'tbPromotion' },
		promotionPriceFirstHours: Number,
		priceAdditionalHours: Number,
		promotionPriceAdditionalHours: Number,
		unavailableHours: [{ fromHour: String, toHour: String }],
	},
	{
		timestamps: true,
		autoIndex: false,
	}
);

tbPriceSchema.index({ date: 1 });

tbPriceSchema.statics = {
	async calcPromotionPrice({ roomTypeId, ratePlanId, from, to }) {
		if (from) {
			from.zeroHours();
		}
		if (to) {
			to.zeroHours();
		}

		const startDay = moment().toDate().zeroHours();

		if (to && to < startDay) return;
		if (from) {
			if (from < startDay) {
				from = startDay;
			}
		} else {
			from = startDay;
		}

		const promotions = await this.model('tbPromotion').findRoomRatePromotions(roomTypeId, ratePlanId);

		if (!promotions.length) {
			return await this.updateMany(
				{
					roomTypeId,
					ratePlanId,
					date: { $gte: from },
				},
				{
					$unset: {
						promotionPrice: 1,
						promotionId: 1,
					},
				}
			);
		}

		const pfilter = {
			roomTypeId,
			ratePlanId,
			$or: [
				{
					price: { $gt: 0 },
				},
				{
					priceFirstHours: { $gt: 0 },
				},
			],
		};
		if (from) {
			_.set(pfilter, ['date', '$gte'], from);
		}
		if (to) {
			_.set(pfilter, ['date', '$lte'], to);
		}

		const docs = await this.find(pfilter).select('price priceFirstHours priceAdditionalHours date').lean();
		if (!docs.length) return;

		const bulks = docs.map(doc => {
			const matchPromotions = promotions.filter(p => p.isMatchDate(doc.date));

			const hourlyPromotions = matchPromotions.filter(p => p.type === PromotionType.HourlySale);
			const dailyPromotions = matchPromotions.filter(p => p.type !== PromotionType.HourlySale);

			const update = {};

			if (hourlyPromotions.length && doc.priceFirstHours) {
				const promotion = _.maxBy(hourlyPromotions, 'discount');

				update.hourlyPromotionId = promotion._id;

				update.promotionPriceFirstHours = promotion.calcDiscountPrice(doc.priceFirstHours);
				update.promotionPriceAdditionalHours = promotion.calcDiscountPrice(
					doc.priceAdditionalHours,
					'additional_discount'
				);
			} else {
				update.hourlyPromotionId = null;
				update.promotionPriceFirstHours = null;
				update.promotionPriceAdditionalHours = null;
			}

			if (dailyPromotions.length && doc.price) {
				const promotion = _.maxBy(dailyPromotions, 'discount');

				update.promotionId = promotion._id;
				update.promotionPrice = promotion.calcDiscountPrice(doc.price);
			} else {
				update.promotionId = null;
				update.promotionPrice = null;
			}

			return {
				updateOne: {
					filter: {
						_id: doc._id,
					},
					update,
				},
			};
		});

		await this.bulkWrite(bulks);
	},

	async findPrices({ roomTypeId, ratePlanId, checkIn, checkOut, fromHour, toHour }) {
		const ratePlan = await this.model('RatePlan').findById(ratePlanId).populate('ref.ratePlanId', 'roomBasePrice');
		if (!ratePlan) return null;

		const filter = {
			roomTypeId: mongoose.Types.ObjectId(roomTypeId),
			ratePlanId: ratePlan._id,
		};
		const isHour = ratePlan.serviceType === Services.Hour;

		const roomBasePrice = ratePlan.getBasePrice();

		if (isHour) {
			const firstHours = ratePlan.minimumHours || 1;

			const totalMinutes = moment(toHour, 'HH:mm').diff(moment(fromHour, 'HH:mm'), 'minute');
			const minPerHour = 60;
			const step = minPerHour / 2;
			const rangeAmount = Math.ceil(totalMinutes / step);
			const extRange = rangeAmount - (minPerHour * firstHours) / step;
			const additionalHours = extRange > 0 ? extRange / (minPerHour / step) : 0;

			const data = await this.findOne({ ...filter, date: new Date(checkIn).zeroHours() });

			const priceFirstHours = _.get(data, ['priceFirstHours']) || roomBasePrice;
			const promoPriceFirstHours = _.get(data, ['promotionPriceFirstHours']);

			const priceAdditionalHours = _.get(data, ['priceAdditionalHours']) || ratePlan.basePriceAdditionalHours;
			const promoPriceAdditionalHours = _.get(data, ['promotionPriceAdditionalHours']);

			const price =
				(promoPriceFirstHours || priceFirstHours) +
				additionalHours * (promoPriceAdditionalHours || priceAdditionalHours);

			const priceOrigin = priceFirstHours + additionalHours * priceAdditionalHours;

			return {
				price,
				priceOrigin,
				additionalHours,
				priceAdditionalHours,
				firstHours,
				roomTypeId,
				ratePlanId,
			};
		}

		const from = new Date(checkIn).zeroHours();
		const to = new Date(checkOut).zeroHours();

		const daily = await this.aggregate()
			.match({
				...filter,
				date: {
					$gte: from,
					$lt: to,
				},
			})
			.group({
				_id: { roomTypeId: '$roomTypeId', ratePlanId: '$ratePlanId', date: '$date' },
				promotionPrice: { $max: '$promotionPrice' },
				price: { $max: '$price' },
			});

		const priceObjs = _.keyBy(daily, d => d._id.date.toDateMysqlFormat());

		const dates = rangeDate(from, to, false)
			.toArray()
			.map(d => priceObjs[d.toDateMysqlFormat()] || { price: roomBasePrice });

		const result = {
			price: _.sumBy(dates, d => d.promotionPrice || d.price || roomBasePrice),
			priceOrigin: _.sumBy(dates, d => d.price || roomBasePrice),
			nights: dates.length,
			roomTypeId,
			ratePlanId,
		};

		return result;
	},

	async syncPriceRefRatePlans(ratePlan) {
		await ratePlan.roomTypeIds.asyncForEach(async roomTypeId => {
			const prices = await this.find({
				roomTypeId,
				ratePlanId: ratePlan.ref.ratePlanId,
				date: { $gte: moment().toDate().zeroHours() },
			})
				.select('date roomTypeId price available')
				.lean();

			const bulks = prices.map(pdoc => {
				return {
					updateOne: {
						filter: {
							date: pdoc.date,
							roomTypeId: pdoc.roomTypeId,
							ratePlanId: ratePlan._id,
						},
						update: {
							$set: {
								price: ratePlan.calcRefPrice(pdoc.price),
								available: pdoc.available,
							},
						},
						upsert: true,
					},
				};
			});

			await this.bulkWrite(bulks);

			await this.calcPromotionPrice({ roomTypeId, ratePlanId: ratePlan._id });
		});
	},
};

module.exports = mongoose.model('tbPrice', tbPriceSchema, 'tb_price');

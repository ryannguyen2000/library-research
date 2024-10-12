const mongoose = require('mongoose');
const _ = require('lodash');
const { getDayOfRange } = require('@utils/date');
const { Services, DaysOfWeek } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const PriceHistorySchema = new Schema(
	{
		from: { type: Date, required: true },
		to: { type: Date, required: true },
		timeStart: Date,
		daysOfWeek: [{ type: String, enum: Object.values(DaysOfWeek) }], // 1,2,3,4,5,6,7 => cn,2,3,4,5,6,7
		price: { type: Number, min: 0 },
		// for hour service
		priceFirstHours: { type: Number, min: 0 },
		// promotionPriceFirstHours: { type: Number, min: 0 },
		priceAdditionalHours: { type: Number, min: 0 },
		// promotionPriceAdditionalHours: { type: Number, min: 0 },
		serviceType: { type: Number, enum: Object.values(Services), default: Services.Day },
		roomType: { type: String },
		blockId: { type: ObjectId, ref: 'Block', required: true },
		roomTypeId: { type: ObjectId, ref: 'RoomType', required: true },
		ratePlanId: { type: Number, ref: 'RatePlan', required: true },
		otas: [String],
		prices: Mixed,
		isBasicPrice: { type: Boolean, default: true },
		createdBy: { type: ObjectId, ref: 'User' },
		autoId: { type: ObjectId, ref: 'PriceAuto' },
	},
	{ timestamps: true }
);

function rounded(price) {
	return price ? _.round(price, price < 1000 ? 2 : 0) : price;
}

PriceHistorySchema.pre('save', function (next) {
	// _.forEach(this.prices, roomTypes => {
	// 	_.forEach(roomTypes, otas => {
	// 		_.forEach(otas, item => {
	// 			item.price = rounded(item.price);
	// 		});
	// 	});
	// });

	this.price = rounded(this.price);
	this.priceFirstHours = rounded(this.priceFirstHours);
	// this.promotionPriceFirstHours = rounded(this.promotionPriceFirstHours);
	this.priceAdditionalHours = rounded(this.priceAdditionalHours);
	// this.promotionPriceAdditionalHours = rounded(this.promotionPriceAdditionalHours);
	this.otas = _.uniq(this.otas);

	if (this.serviceType === Services.Day && !this.price) {
		throw new ThrowReturn('`price` is required!');
	}

	if (this.serviceType === Services.Hour && !this.priceFirstHours) {
		throw new ThrowReturn('`priceFirstHours` is required!');
	}

	next();
});

PriceHistorySchema.statics = {
	async getPrices(params) {
		let {
			blockId,
			roomTypeId,
			ratePlanId,
			from,
			to,
			ota,
			existsDaysOfWeek = [],
			initDayOfWeek,
			serviceType,
			recursiveCount = 0,
			isBasicPrice,
			autoId,
			// forceNull,
		} = params;

		if (recursiveCount > 20) {
			return [];
		}

		from = new Date(from).maxTimes();
		to = new Date(to).minTimes();
		serviceType = serviceType || Services.Day;

		if (!initDayOfWeek) {
			initDayOfWeek = getDayOfRange(from, to).map(d => String(d + 1));
		}

		const query = _.pickBy({
			blockId,
			roomTypeId,
			ratePlanId,
			from: { $lte: from },
			to: { $gte: to },
			otas: ota,
			serviceType,
			isBasicPrice,
			$or: [
				{ daysOfWeek: { $in: initDayOfWeek, $nin: existsDaysOfWeek } }, //
				{ 'daysOfWeek.0': { $exists: false } },
			],
			// [`prices.${roomType}.${ota}`]: { $ne: null },
		});

		if (autoId) {
			query.autoId = autoId;
		}

		const pre = await this.findOne(query).sort({ createdAt: -1 }).lean();
		// if (!pre) {
		// 	if (forceNull) {
		// 		delete query[`prices.${roomType}.${ota}`];
		// 		pre = await this.findOne(query).sort({ createdAt: -1 }).lean();
		// 	}
		// }

		if (!pre) return [];

		pre.daysOfWeek = pre.daysOfWeek.filter(d => initDayOfWeek.includes(d));

		const newDayOfWeek = pre.daysOfWeek.length ? pre.daysOfWeek : Object.values(DaysOfWeek);
		const newDOW = _.uniq([...existsDaysOfWeek, ...newDayOfWeek]).sort();

		if (newDOW.length < initDayOfWeek.length) {
			return [
				pre,
				...(await this.getPrices({ ...params, existsDaysOfWeek: newDOW, recursiveCount: recursiveCount + 1 })),
			];
		}

		return [pre];
	},
};

module.exports = mongoose.model('PriceHistory', PriceHistorySchema, 'price_history');

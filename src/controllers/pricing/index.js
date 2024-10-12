// const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const { OTAs, Services, RatePlanPricingTypes } = require('@utils/const');
const { Settings } = require('@utils/setting');
const { logger } = require('@utils/logger');
const { getDayOfRange, rangeDate } = require('@utils/date');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const crawler = require('@controllers/ota_api/crawler_reservations');
// const { roomTypeRates } = require('@controllers/rate/rate.controller');

async function getBookingPrice(blockId, roomId, from, to) {
	const listing = await models.Listing.findOne({
		roomIds: roomId,
		blockId,
		OTAs: {
			$elemMatch: {
				active: true,
				otaName: OTAs.Booking,
			},
		},
	});

	if (!listing) throw new ThrowReturn('Not found listing');
	const ota = listing.getOTA(OTAs.Booking);
	const propertyId = await models.Block.getPropertyIdOfABlock(blockId, ota.otaName, ota.account);
	if (!propertyId) throw new ThrowReturn('Not found propertyId');

	const [otaInfo] = await models.OTAManager.findByName(ota.otaName, ota.account);
	const prices = crawler.booking ? await crawler.booking.priceCrawler(otaInfo, propertyId, ota, from, to) : [];

	const pricesObj = prices.reduce((obj, datePrice) => {
		const price = Number(datePrice.price);
		if (!Number.isNaN(price)) {
			obj[price] = obj[price] ? obj[price] + 1 : 1;
		}
		return obj;
	}, {});

	return { prices: Object.keys(pricesObj).map(num => Number(num)) };
}

function parseRange(from, to) {
	from = (from ? new Date(from) : new Date()).zeroHours();
	if (to) {
		to = new Date(to);
	} else {
		to = moment().add(Settings.DaysForSyncPrice.value, 'day').toDate();
	}
	to = to.zeroHours();

	if (from > to) throw new ThrowReturn('Time is invalid!');

	return [from, to];
}

async function setRoomsPrice(
	{ from, to, otas, blockId, roomTypeId, ratePlanId, daysOfWeek, isBasicPrice, timeStart, ...pricingData },
	user
) {
	[from, to] = parseRange(from, to);

	if (!daysOfWeek || !daysOfWeek.length) {
		daysOfWeek = getDayOfRange(from, to).map(day => String(day + 1));
	}

	const ratePlan = await models.RatePlan.findOne({
		_id: ratePlanId,
		pricingType: RatePlanPricingTypes.New,
		active: true,
		blockId,
		roomTypeIds: roomTypeId,
	});
	if (!ratePlan) {
		throw new ThrowReturn('Không tìm thấy rate plan!');
	}

	const rateOTAs = await ratePlan.getActiveOTAs({ roomTypeId });
	const rateOTANames = _.uniq(_.map(rateOTAs, 'otaName'));

	if (otas && otas.length) {
		const diffOTAs = _.difference(otas, rateOTANames);
		if (diffOTAs.length) {
			throw new ThrowReturn(`${diffOTAs.join(', ')} không thuộc rate plan này!`);
		}
	} else {
		otas = rateOTANames;
	}

	if (!otas.length) {
		throw new ThrowReturn('Không tìm thấy OTA phù hợp với rate plan này!');
	}

	const priceHistory = await models.PriceHistory.create({
		from,
		to,
		createdBy: user ? user._id : undefined,
		otas,
		blockId,
		roomTypeId,
		ratePlanId,
		timeStart,
		isBasicPrice,
		serviceType: ratePlan.serviceType,
		daysOfWeek,
		...pricingData,
	});

	await models.JobPricing.createJob({
		priceId: priceHistory._id,
		otas,
		timeStart,
	});

	if (!priceHistory.timeStart && priceHistory.isBasicPrice) {
		await models.BlockCalendar.syncPriceCalendar(priceHistory);
	}

	return priceHistory;
}

async function history({ start, limit, date, minimize, ...query }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;
	// query.serviceType = parseInt(query.serviceType) || Services.Day;

	if (date) {
		date = new Date(date).zeroHours();
		query.daysOfWeek = _.toString(date.getDay() + 1);
		query.from = { $lte: date };
		query.to = { $gte: date };
	}
	if (query.serviceType) {
		query.serviceType = parseInt(query.serviceType);
	}

	const cursor = models.PriceHistory.find(query)
		.sort({ createdAt: -1 })
		.skip(start)
		.limit(limit)
		.populate('createdBy', 'username name')
		.populate('roomTypeId', 'name')
		.populate('ratePlanId', 'name');

	if (minimize === 'true') {
		cursor.select('-prices');
	}

	const [histories, total] = await Promise.all([cursor.lean(), models.PriceHistory.countDocuments(query)]);

	return { histories, total };
}

function getPriceSet({ prevPrice, price, ratio, minPrice, maxPrice }) {
	if ((minPrice && minPrice === prevPrice) || (maxPrice && maxPrice === prevPrice)) {
		return;
	}

	let newPrice = 0;

	if (ratio) newPrice = prevPrice * ratio;
	else newPrice = price + prevPrice;

	if (_.isNumber(minPrice)) {
		newPrice = Math.max(newPrice, minPrice);
	}
	if (_.isNumber(maxPrice)) {
		newPrice = Math.min(newPrice, maxPrice);
	}

	return newPrice;
}

async function bulkUpdatePrice(body, user) {
	let {
		from,
		to,
		priceSet,
		ratio,
		blockId,
		roomTypeId,
		ratePlanId,
		otas,
		daysOfWeek,
		isBasicPrice,
		changeType,
		autoId,
		minPrice,
		maxPrice,
		priceFirstHours,
		priceAdditionalHours,
		price,
	} = body;

	[from, to] = parseRange(from, to);

	const ranges = rangeDate(from, to).toArray();

	const ratePlan = await models.RatePlan.findOne({
		_id: ratePlanId,
		blockId,
		pricingType: RatePlanPricingTypes.New,
		roomTypeIds: roomTypeId,
		active: true,
	});
	if (!ratePlan) {
		throw new ThrowReturn('Không tìm thấy rate plan!');
	}

	const isHour = ratePlan.serviceType === Services.Hour;

	const priceKeys = _.filter(
		isHour ? ['priceFirstHours', 'priceAdditionalHours'] : ['price'],
		k => _.isNumber(body[k]) || !!ratio
	);

	if (!priceKeys.length && !ratio) {
		throw new ThrowReturn('Params Invalid');
	}

	const rateOTAs = await ratePlan.getActiveOTAs({ roomTypeId });
	const rateOTANames = _.uniq(_.map(rateOTAs, 'otaName'));

	if (otas && otas.length) {
		// const diffOTAs = _.difference(otas, rateOTANames);
		// if (diffOTAs.length) {
		// 	throw new ThrowReturn(`${diffOTAs.join(', ')} không thuộc rate plan này!`);
		// }
		otas = otas.filter(otaName => rateOTANames.includes(otaName));
	} else {
		otas = rateOTANames;
	}

	if (!otas.length) {
		throw new ThrowReturn('Không tìm thấy OTA phù hợp với rate plan này!');
	}

	const data = [];

	if (priceSet) {
		data.push({
			daysOfWeek,
			from,
			to,
			blockId,
			roomTypeId,
			ratePlanId,
			otas,
			price: parseInt(priceSet) || price || 0,
			priceFirstHours,
			priceAdditionalHours,
			isBasicPrice,
		});
	} else {
		const calendars = await models.BlockCalendar.find({
			blockId,
			roomTypeId,
			ratePlanId,
			date: { $gte: moment(from).format('Y-MM-DD'), $lte: moment(to).format('Y-MM-DD') },
		})
			.sort({ date: 1 })
			.lean();

		const temps = [];
		const lastDaysPrice = {};

		_.reverse([...calendars]).forEach(c => {
			const day = String(new Date(c.date).getDay() + 1);

			priceKeys.forEach(priceKey => {
				if (!c[priceKey] || _.get(lastDaysPrice, [day, priceKey])) return;
				_.set(lastDaysPrice, [day, priceKey], c[priceKey]);
			});
		});

		const calendarsObj = _.keyBy(calendars, c => new Date(c.date).toDateMysqlFormat());

		_.forEach(ranges, date => {
			const day = String(date.getDay() + 1);
			if (daysOfWeek && daysOfWeek.length && !_.includes(daysOfWeek, day)) return;

			const calendar = calendarsObj[date.toDateMysqlFormat()];
			const oldData = {};

			priceKeys.forEach(priceKey => {
				const oldPrice = _.get(calendar, priceKey) || _.get(lastDaysPrice[day], priceKey);
				if (oldPrice) {
					oldData[priceKey] = oldPrice;
				}
			});

			if (_.isEmpty(oldData)) {
				console.log('not found prev oldData', date);
				return;
			}

			let temp = temps.find(t => _.entries(t.oldData).every(a => oldData[a[0]] === a[1]));
			if (!temp) {
				temp = { days: {}, oldData };
				temps.push(temp);
			} else {
				_.assign(temp.oldData, oldData);
			}

			temp.days[day] = temp.days[day] || [];
			temp.days[day].push(date);
		});

		temps.forEach(temp => {
			const dates = _.flatten(_.values(temp.days));
			const days = _.keys(temp.days);

			if (!days.length) return;

			const taskData = {
				daysOfWeek: days,
				from: _.min(dates),
				to: _.max(dates),
				ratePlanId,
				roomTypeId,
				blockId,
				isBasicPrice,
				serviceType: ratePlan.serviceType,
				otas,
			};

			const prices = {};

			_.forEach(temp.oldData, (oldPrice, priceKey) => {
				const rat = ratio || (changeType === 'percent' ? 1 + body[priceKey] / 100 : null);

				const newPrice = getPriceSet({
					prevPrice: oldPrice,
					price: body[priceKey],
					ratio: rat,
					minPrice,
					maxPrice,
				});

				if (newPrice) {
					prices[priceKey] = newPrice;
				}
			});

			if (!_.isEmpty(prices)) {
				data.push({ ...taskData, ...prices });
			}
		});
	}

	await data.asyncForEach(task => setRoomsPrice({ ...task, autoId }, user));

	return data;
}

async function getOccupancyPrice(query, user) {
	const occupancyPrice = await models.PriceOccupancy.findOne({
		blockId: query.blockId,
		roomTypeId: query.roomTypeId,
		ratePlanId: query.ratePlanId,
		// baseOccupancies: [
		// 	{
		// 		type: { type: Number, enum: Object.values(PolicyRuleDiscountTypes) },
		// 		amount: { type: Number },
		// 		otas: [String],
		// 	},
		// ],
		// createdBy: { type: ObjectId, ref: 'User' },
	});

	return {
		occupancyPrice,
	};
}

async function setOccupancyPrice(body, user) {
	const occupancyPrice = await models.PriceOccupancy.findOneAndUpdate(
		{
			blockId: body.blockId,
			roomTypeId: body.roomTypeId,
			ratePlanId: body.ratePlanId,
		},
		{
			$set: {
				baseOccupancies: _.uniqBy(body.baseOccupancies, 'occupancy'),
			},
			$setOnInsert: {
				createdBy: user._id,
			},
		},
		{
			upsert: true,
			new: true,
			runValidators: true,
		}
	);

	return {
		occupancyPrice,
	};
}

async function syncLocalPromotionPrice({ page, from, to }) {
	try {
		const DAY_TO_RESYNC = 60;
		const LIMIT_PER_RUN = 10;

		page = parseInt(page) || 1;

		const ratePlans = await models.RatePlan.find({
			active: true,
		})
			.select('_id roomTypeIds')
			.skip((page - 1) * LIMIT_PER_RUN)
			.limit(LIMIT_PER_RUN)
			.lean();

		if (!ratePlans.length) return;

		from = from || new Date();
		to = to || moment().add(DAY_TO_RESYNC, 'day').toDate();

		await ratePlans.asyncForEach(ratePlan => {
			return ratePlan.roomTypeIds.asyncMap(roomTypeId =>
				models.tbPrice.calcPromotionPrice({
					roomTypeId,
					ratePlanId: ratePlan._id,
					from,
					to,
				}).catch(e => {
					logger.error('calcPromotionPrice', ratePlan._id, roomTypeId, e);
				})
			);
		});

		if (ratePlans.length === LIMIT_PER_RUN) {
			await syncLocalPromotionPrice({ from, to, page: page + 1 });
		}
	} catch (e) {
		logger.error('syncLocalPrice error', e);
	}
}

module.exports = {
	setRoomsPrice,
	history,
	getBookingPrice,
	bulkUpdatePrice,
	getOccupancyPrice,
	setOccupancyPrice,
	syncLocalPromotionPrice,
};

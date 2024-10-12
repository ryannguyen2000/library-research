const _ = require('lodash');
// const moment = require('moment');
const mongoose = require('mongoose');

const { rangeDate } = require('@utils/date');
const { createCache } = require('@utils/cache');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

async function synchronizePrice({ roomTypeId, from, to, ratePlanId, daysOfWeek, ...otherData }) {
	const ranges = rangeDate(from, to)
		.toArray()
		.filter(date => !daysOfWeek || daysOfWeek.includes((date.getDay() + 1).toString()));

	const update = {};

	const priceKeys = [
		'price',
		'priceFirstHours',
		// 'promotionPriceFirstHours',
		'priceAdditionalHours',
		// 'promotionPriceAdditionalHours',
	];
	priceKeys.forEach(key => {
		if (_.isNumber(otherData[key])) {
			update[key] = otherData[key];
		}
	});

	const bulks = [];

	ranges.forEach(date => {
		bulks.push({
			updateOne: {
				filter: {
					date,
					roomTypeId,
					ratePlanId,
				},
				update: {
					...update,
				},
				upsert: true,
			},
		});
	});

	const Model = mongoose.model('CozrumPrice');
	await Model.bulkWrite(bulks);

	const refPlans = await mongoose.model('RatePlan').findChildRates({
		'ref.ratePlanId': ratePlanId,
		roomTypeIds: roomTypeId,
	});

	const refBulks = [];

	refPlans.forEach(refPlan => {
		const refUpdate = {};

		_.forEach(update, (price, key) => {
			refUpdate[key] = refPlan.calcRefPrice(price);
		});

		ranges.forEach(date => {
			refBulks.push({
				updateOne: {
					filter: {
						roomTypeId,
						ratePlanId: refPlan._id,
						date,
					},
					update: {
						...refUpdate,
					},
					upsert: true,
				},
			});
		});
	});

	if (refBulks.length) {
		await Model.bulkWrite(refBulks);
	}

	if (update.price) {
		await Model.calcPromotionPrice({
			roomTypeId,
			ratePlanId,
			from,
			to,
		});

		await refPlans.asyncMap(refPlan =>
			Model.calcPromotionPrice({
				roomTypeId,
				ratePlanId: refPlan._id,
				from,
				to,
			})
		);
	}
}

function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaConfig, syncId, listing) {
	const calendars = addCalendar(syncId);
	const { roomTypeId } = listing;
	const { rates } = otaListing;

	calendars.data = calendars.data || {};
	calendars.data[roomTypeId] = calendars.data[roomTypeId] || {};

	rates.forEach(rate => {
		calendars.data[roomTypeId][rate.ratePlanId] = calendars.data[roomTypeId][rate.ratePlanId] || [];
		calendars.data[roomTypeId][rate.ratePlanId].push({
			date: new Date(from).zeroHours(),
			available,
		});
	});
}

async function syncDone(syncId) {
	const calendars = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	const bulks = [];

	_.forEach(calendars.data, (rateData, roomTypeId) => {
		_.forEach(rateData, (items, ratePlanId) => {
			_.forEach(items, item => {
				bulks.push({
					updateOne: {
						filter: {
							roomTypeId: mongoose.Types.ObjectId(roomTypeId),
							ratePlanId: Number(ratePlanId),
							date: item.date,
						},
						update: { available: item.available },
						upsert: true,
					},
				});
			});
		});
	});

	if (bulks.length) {
		await mongoose.model('CozrumPrice').bulkWrite(bulks);
	}
}

// async function fetchRoomsToSell({ otaListingInfo, from, to }) {
// 	const list = await mongoose
// 		.model('CozrumPrice')
// 		.aggregate()
// 		.match({
// 			otaListingId: otaListingInfo.otaListingId,
// 			date: {
// 				$gte: moment(from).startOf('date').toDate(),
// 				$lte: moment(to).endOf('date').toDate(),
// 			},
// 		})
// 		.project({
// 			date: 1,
// 			available: 1,
// 		});

// 	const rs = {};
// 	const obj = _.keyBy(list, l => l.date.toDateMysqlFormat());

// 	rangeDate(from, to)
// 		.toArray()
// 		.forEach(date => {
// 			date = date.toDateMysqlFormat();
// 			rs[date] = _.get(obj, [date, 'available']) || 0;
// 		});

// 	return rs;
// }

module.exports = {
	synchronizePrice,
	synchronizeSchedule,
	// fetchRoomsToSell,
	syncDone,
};

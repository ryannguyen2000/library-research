// /* eslint-disable guard-for-in */
// const moment = require('moment');
// const _ = require('lodash');
// const { createCache } = require('@utils/cache');
// const fetchRetry = require('@utils/fetchRetry');
// const { logger } = require('@utils/logger');
// const { rangeDate } = require('@utils/date');

// const { addCalendar, deleteCalendar, getCalendar } = createCache();

// const TIMEOUT = 3000;

// function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaInfo, syncId) {
// 	const schedules = addCalendar(syncId);

// 	const listingId = otaListing.otaListingId.toString();
// 	const hotelId = parseInt(otaPropertyId);
// 	if (!schedules[hotelId]) schedules[hotelId] = {};
// 	if (!schedules[hotelId][listingId]) schedules[hotelId][listingId] = { otaInfo, ranges: [] };

// 	schedules[hotelId][listingId].ranges.push({
// 		autoTopup: 0,
// 		closeRegular: false,
// 		noCheckIn: false,
// 		noCheckOut: false,
// 		regular: available,
// 		timeFrom: moment(from).format('DD-MM-Y'),
// 		timeTo: moment(to).format('DD-MM-Y'),
// 		updatedAt: Date.now(),
// 	});
// }

// async function synchronizeRoomToSell(otaPropertyId, otaListing, from, to, rooms, otaInfo) {
// 	await updateSchedule(parseInt(otaPropertyId), otaListing.otaListingId.toString(), {
// 		otaInfo,
// 		ranges: [
// 			{
// 				autoTopup: 0,
// 				closeRegular: false,
// 				noCheckIn: false,
// 				noCheckOut: false,
// 				regular: rooms,
// 				timeFrom: moment(from).format('DD-MM-Y'),
// 				timeTo: moment(to).format('DD-MM-Y'),
// 				updatedAt: Date.now(),
// 			},
// 		],
// 	});
// }

// async function syncDone(syncId) {
// 	const schedules = _.cloneDeep(getCalendar(syncId));
// 	deleteCalendar(syncId);

// 	for (const hotelId in schedules) {
// 		if (hotelId === 'createdAt') continue;
// 		for (const listingId in schedules[hotelId]) {
// 			await updateSchedule(hotelId, listingId, schedules[hotelId][listingId]);
// 		}
// 	}
// }

// async function updateSchedule(hotelId, roomTypeId, data) {
// 	const body = {
// 		hotelId,
// 		providerId: data.otaInfo.other.uid,
// 		roomTypeId,
// 		rateTypeId: 1,
// 		ranges: data.ranges,
// 	};

// 	const res = await fetchRetry(
// 		'https://hms-api.tripi.vn/api/hotels/room-control/update',
// 		{
// 			method: 'POST',
// 			body: JSON.stringify(body),
// 			timeout: TIMEOUT,
// 		},
// 		data.otaInfo
// 	);

// 	if (!res.ok) {
// 		throw new Error(`Tripi synchronizeSchedule error ${roomTypeId} ${await res.text()}`);
// 	}

// 	const result = await res.json();
// 	if (!result || result.code !== 200) {
// 		throw new Error(`Tripi synchronizeSchedule error ${roomTypeId} ${JSON.stringify(result)}`);
// 	}
// }

// async function synchronizePrice(otaPropertyId, otaListing, from, to, rateId, price, otaInfo, smartPrice, daysOfWeek) {
// 	const dates = rangeDate(from, to).toArray();
// 	let firstDate = null;
// 	let preDate = null;
// 	const ranges = [];
// 	dates
// 		.filter(date => !daysOfWeek || daysOfWeek.includes((date.getDay() + 1).toString()))
// 		.forEach(date => {
// 			if (firstDate) {
// 				if (preDate.diffDays(date) > 1 || preDate.diffDays(firstDate) > 30) {
// 					ranges.push({
// 						timeFrom: moment(firstDate).format('DD-MM-Y'),
// 						timeTo: moment(preDate).format('DD-MM-Y'),
// 					});
// 					firstDate = date;
// 					preDate = date;
// 				} else {
// 					preDate = date;
// 				}
// 			} else {
// 				firstDate = date;
// 				preDate = date;
// 			}
// 		});
// 	if (firstDate) {
// 		ranges.push({
// 			timeFrom: moment(firstDate).format('DD-MM-Y'),
// 			timeTo: moment(preDate).format('DD-MM-Y'),
// 		});
// 	}
// 	await _.chunk(ranges, 5).asyncForEach(async items => {
// 		const body = JSON.stringify({
// 			hotelId: parseInt(otaPropertyId),
// 			providerId: otaInfo.other.uid,
// 			roomTypeId: otaListing.otaListingId,
// 			rateTypeId: 1,
// 			ranges: items.map(r => ({ ...r, singleBedPrice: price, surchargePrice: 0, includeBreakfast: false })),
// 		});
// 		const response = await fetchRetry(
// 			'https://hms-api.tripi.vn/api/hotels/rate-control/update',
// 			{
// 				method: 'POST',
// 				body,
// 				timeout: TIMEOUT,
// 			},
// 			otaInfo
// 		);
// 		const result = await response.json();
// 		if (!result || result.code !== 200) {
// 			throw new Error(`Tripi synchronizePrice error ${otaListing.otaListingId} ${JSON.stringify(result)}`);
// 		}
// 	});
// }

// async function fetchRoomsToSell({ propertyId, otaListingInfo, from, to, otaInfo }) {
// 	if (!otaInfo) return;

// 	const uri = 'https://hms-api.tripi.vn/api/hotels/room-control/list';
// 	const body = {
// 		hotelId: propertyId,
// 		providerId: otaInfo.other.uid,
// 		rateTypeId: 1,
// 		roomTypeId: otaListingInfo.otaListingId,
// 		timeFrom: moment(from).format('DD-MM-Y'),
// 		timeTo: moment(to).format('DD-MM-Y'),
// 	};

// 	try {
// 		const response = await fetchRetry(
// 			uri,
// 			{
// 				method: 'POST',
// 				body: JSON.stringify(body),
// 				timeout: TIMEOUT,
// 			},
// 			otaInfo
// 		);
// 		const rs = {};
// 		if (!response.ok) {
// 			logger.error('Tripi fetchRoomsToSell -> error', propertyId, otaListingInfo.otaListingId, response);
// 			return rs;
// 		}

// 		const result = await response.json();
// 		if (Array.isArray(result)) {
// 			result.forEach(item => {
// 				const timeFrom = moment(item.timeFrom, 'DD-MM-Y');
// 				const timeTo = moment(item.timeTo, 'DD-MM-Y');
// 				while (timeFrom.isSameOrBefore(timeTo, 'day')) {
// 					rs[timeFrom.format('Y-MM-DD')] = item.regular;
// 					timeFrom.add(1, 'day');
// 				}
// 			});
// 		}
// 		return rs;
// 	} catch (e) {
// 		logger.error('Tripi fetchRoomsToSell -> error', propertyId, otaListingInfo.otaListingId, e);
// 		return {};
// 	}
// }

// module.exports = {
// 	synchronizeSchedule,
// 	synchronizePrice,
// 	synchronizeRoomToSell,
// 	syncDone,
// 	fetchRoomsToSell,
// };

// const _ = require('lodash');
// const moment = require('moment');

// const { createCache } = require('@utils/cache');
// const fetchRetry = require('@utils/fetchRetry');
// const { CurrencyConvert } = require('@utils/const');
// const { logger } = require('@utils/logger');

// const { addCalendar, deleteCalendar, getCalendar } = createCache();

// const TIMEOUT = 3000;

// function getListingId(otaListing) {
// 	return Number(otaListing.secondaryId || otaListing.otaListingId);
// }

// async function updateSchedule(otaConfig, otaListingId, from, to, available) {
// 	const uri = `https://host.luxstay.net/api/calendar/${available ? 'unblock' : 'block'}`;
// 	const now = moment();
// 	to = moment(to);
// 	from = moment(from);

// 	if (now.isAfter(to, 'day')) return;
// 	if (now.isAfter(from, 'day')) from = now;

// 	const fromDate = from.format('Y-MM-DD');
// 	const toDate = to.add(1, 'day').format('Y-MM-DD');

// 	const requestBody = {
// 		accommodation_id: otaListingId,
// 		check_in: fromDate,
// 		check_out: toDate,
// 		quantity: 1,
// 	};

// 	const result = await fetchRetry(
// 		uri,
// 		{
// 			method: 'PUT',
// 			body: JSON.stringify(requestBody),
// 			timeout: TIMEOUT,
// 		},
// 		otaConfig
// 	).catch(e => {
// 		logger.error(e);
// 	});
// 	// if (result && result.status !== 200) {
// 	// 	const data = await result.text();
// 	// 	throw new Error(`Luxstay synchronizeSchedule error ${otaListingId} ${data}`);
// 	// }
// }

// function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaConfig, syncId) {
// 	const calendars = addCalendar(syncId);

// 	const listingId = getListingId(otaListing);
// 	if (!calendars[listingId]) calendars[listingId] = { on: [], off: [] };
// 	if (available > 0) {
// 		calendars[listingId].on.push(from);
// 	} else {
// 		calendars[listingId].off.push(to);
// 	}

// 	calendars[listingId].otaConfig = otaConfig;
// }

// async function updateDates(id, available, calendars, otaConfig) {
// 	const queue = [];
// 	let firstDate = null;
// 	let preDate = null;

// 	calendars.forEach(date => {
// 		if (firstDate) {
// 			if (preDate.diffDays(date) > 1) {
// 				queue.push({ firstDate, preDate });
// 				firstDate = date;
// 				preDate = date;
// 			} else {
// 				preDate = date;
// 			}
// 		} else {
// 			firstDate = date;
// 			preDate = date;
// 		}
// 	});
// 	if (firstDate) {
// 		queue.push({ firstDate, preDate });
// 	}
// 	await queue.asyncMap(q => updateSchedule(otaConfig, id, q.firstDate, q.preDate, available));
// }

// async function syncDone(syncId) {
// 	const calendars = _.cloneDeep(getCalendar(syncId));
// 	deleteCalendar(syncId);

// 	await Object.keys(calendars)
// 		.filter(k => k !== 'createdAt')
// 		.asyncForEach(async id => {
// 			calendars[id].on.sort((d1, d2) => d1.getTime() - d2.getTime());
// 			calendars[id].off.sort((d1, d2) => d1.getTime() - d2.getTime());

// 			await updateDates(id, true, calendars[id].on, calendars[id].otaConfig);
// 			await updateDates(id, false, calendars[id].off, calendars[id].otaConfig);
// 		});
// }

// function getDaysOfWeek(daysOfWeek) {
// 	if (!daysOfWeek) return [0, 1, 2, 3, 4, 5, 6];
// 	return daysOfWeek.map(d => d - 1);
// }

// async function synchronizePrice(otaPropertyId, otaListing, from, to, rateId, price, otaConfig, smartPrice, daysOfWeek) {
// 	const today = new Date();
// 	if (moment(to).isBefore(today, 'day')) return;

// 	if (otaListing.currency === 'USD') {
// 		price /= CurrencyConvert[otaListing.currency] || 1;
// 		price = Number(price.toFixed(2));
// 	}

// 	const requestBody = {
// 		accommodation_id: getListingId(otaListing),
// 		start_date: (today >= from ? today : from).toDateMysqlFormat(),
// 		end_date: to.toDateMysqlFormat(),
// 		weekdays: getDaysOfWeek(daysOfWeek),
// 		price,
// 	};
// 	const result = await fetchRetry(
// 		'https://host.luxstay.net/api/prices/customize',
// 		{
// 			method: 'PUT',
// 			body: JSON.stringify(requestBody),
// 			timeout: TIMEOUT,
// 		},
// 		otaConfig
// 	);

// 	if (result && result.status !== 200) {
// 		const data = await result.text();
// 		logger.error(`Luxstay synchronizeSchedule error ${data}`);
// 		// return Promise.reject(`Luxstay synchronizeSchedule error ${JSON.stringify(data)}`);
// 	}
// }

// // async function fetchRoomsToSell({ otaListingInfo, to, otaInfo }) {
// // 	const uri = `https://host.luxstay.net/api/calendars?object_id=${otaListingInfo.otaListingId}&object_type=accommodations&capacity=1`;

// // 	const headers = headerHepler.getLuxstayHeader(otaInfo);

// // 	const rs = {};

// // 	const response = await fetch(uri, {
// // 		headers,
// // 	});

// // 	if (response && response.status !== 200) {
// // 		const result = await response.text();
// // 		logger.error('Luxstay fetchRoomsToSell error', otaListingInfo.otaListingId, result, uri);
// // 		return rs;
// // 	}

// // 	const result = await response.json();

// // 	if (result && Array.isArray(result.data)) {
// // 		const toDate = to.toDateMysqlFormat();
// // 		const index = result.data.findIndex(d => d.date === toDate);
// // 		result.data.slice(0, index + 1).forEach(item => {
// // 			rs[item.date] = item.available;
// // 		});
// // 	} else {
// // 		logger.error('Luxstay fetchRoomsToSell Error', result);
// // 	}

// // 	return rs;
// // }

// module.exports = {
// 	synchronizeSchedule,
// 	synchronizePrice,
// 	syncDone,
// 	// fetchRoomsToSell,
// };

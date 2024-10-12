const { URLSearchParams } = require('url');
const _ = require('lodash');
const moment = require('moment');

const fetchRetry = require('@utils/fetchRetry');
const Uri = require('@utils/uri');
const { rangeDate } = require('@utils/date');
const { createCache } = require('@utils/cache');
const { getBookingHeader } = require('@controllers/ota_api/header_helper');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const SYNC_URI = 'https://admin.booking.com/fresa/extranet/inventory/update';
const CHUNK_SIZE = 10; // 10 update per request
const DELAY_NEXT_CHUNK = 100;
const MAX_DAY = 365;

async function request(uri, body, otaConfig) {
	const headers = getBookingHeader(otaConfig, {
		'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
	});

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: body && body.toString(),
			headers,
			redirect: 'manual',
		},
		otaConfig
	);
	if (result && !result.ok) {
		const data = await result.text();
		throw new Error(`Booking request error ${uri} ${body} ${result.status} ${data}`);
	}
	const json = await result.json();
	if (!json || !json.success) {
		throw new Error(`Booking request error ${uri} ${body} ${JSON.stringify(json)}`);
	}
	return json;
}

function getUri(otaPropertyId, otaInfo, uri = SYNC_URI) {
	return Uri(uri, {
		ses: otaInfo.other.ses,
		lang: 'en',
		hotel_account_id: otaInfo.other.accountId,
		hotel_id: otaPropertyId,
	});
}

/**
 * Synchronize schedule
 * @param {string} otaListingId
 * @param {Date} from
 * @param {Date} to
 * @param {Object} otaInfo
 * @param {Number} available
 * @param {otaInfo} otaInfo
 * @param {Number} price
 */
function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaInfo, syncId) {
	if (moment().add(MAX_DAY, 'day').toDate().zeroHours() < from) return;

	const calendars = addCalendar(syncId);

	calendars.properties = calendars.properties || {};
	if (!calendars.properties[otaPropertyId]) {
		calendars.properties[otaPropertyId] = { data: [] };
	}

	const data = [];
	if (from.getTime() === to.getTime()) {
		data.push({
			room_id: otaListing.otaListingId,
			available,
			otaPropertyId,
			date: from,
		});
	} else {
		for (const date of rangeDate(from, to, true)) {
			data.push({
				room_id: otaListing.otaListingId,
				available,
				date,
				otaPropertyId,
			});
		}
	}

	calendars.properties[otaPropertyId].data = [...calendars.properties[otaPropertyId].data, ...data];
	calendars.properties[otaPropertyId].otaPropertyId = otaPropertyId;
	calendars.properties[otaPropertyId].otaInfo = otaInfo;
}

const limit_to_weekdays = [0, 1, 2, 3, 4, 5, 6];

function synchronizePrice({ propertyId, otaListing, from, to, rateIds, price, otaConfig, daysOfWeek, syncId }) {
	if (!otaConfig) return;

	const schedules = addCalendar(syncId);
	const weekdays = daysOfWeek ? daysOfWeek.map(d => parseInt(d) - 1) : limit_to_weekdays;
	const { account } = otaConfig;

	if (!schedules[account]) {
		schedules[account] = { otaInfo: otaConfig, properties: {} };
	}
	if (!schedules[account].properties[propertyId]) {
		schedules[account].properties[propertyId] = [];
	}

	rateIds.forEach(rateId => {
		schedules[account].properties[propertyId].push({
			room_id: otaListing.otaListingId,
			rate_id: rateId,
			field_name: 'price',
			field_value: price,
			from_date: from.toDateMysqlFormat(),
			until_date: to.toDateMysqlFormat(),
			limit_to_weekdays: weekdays,
		});
	});
}

async function updatePrices(otaPropertyId, otaInfo, update) {
	const uri = getUri(otaPropertyId, otaInfo);
	const params = new URLSearchParams();
	params.append('request', JSON.stringify({ update }));
	await request(uri, params, otaInfo);
}

async function synchronizePriceDone(syncId) {
	const schedules = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	await Object.keys(schedules)
		.filter(k => k !== 'createdAt')
		.asyncForEach(async account => {
			const { otaInfo, properties } = schedules[account];
			await Object.keys(properties).asyncForEach(async otaPropertyId => {
				await _.chunk(properties[otaPropertyId], CHUNK_SIZE).asyncForEach(async up => {
					await updatePrices(otaPropertyId, otaInfo, up);
				});
			});
		});
}

async function updatePropertyCalendar(propertyData) {
	const group = _.groupBy(propertyData.data, t => `${t.room_id}|${t.available}`);
	const roomsCount = [];
	const restrictions = [];

	_.keys(group).forEach(k => {
		const [{ room_id, available }] = group[k];
		let prevTo;

		group[k]
			.sort((a, b) => a.date.getTime() - b.date.getTime())
			.reduce((arr, t) => {
				if (prevTo && moment(t.date).diff(moment(prevTo), 'days') === 1) {
					arr[arr.length - 1].to = t.date;
				} else {
					arr.push({ from: t.date, to: t.date });
				}
				prevTo = t.date;
				return arr;
			}, [])
			.forEach(({ from, to }) => {
				const from_date = from.toDateMysqlFormat();
				const until_date = to.toDateMysqlFormat();

				roomsCount.push({
					room_id,
					field_name: 'rooms_to_sell',
					field_value: available,
					from_date,
					until_date,
					limit_to_weekdays,
					additional_check: -1,
				});

				restrictions.push({
					room_id,
					field_name: 'hidden',
					field_value: available <= 0,
					from_date,
					until_date,
					limit_to_weekdays,
				});
			});
	});

	const { otaPropertyId, otaInfo } = propertyData;
	const uri = getUri(otaPropertyId, otaInfo);

	await updateCalendars(roomsCount, uri, otaInfo);
	await updateCalendars(restrictions, uri, otaInfo);
}

async function updateCalendars(items, uri, otaInfo) {
	const requestsData = _.chunk(_.sortBy(items, 'from_date'), CHUNK_SIZE);

	await requestsData.asyncForEach(async arr => {
		const requestBody = { update: arr };
		const params = new URLSearchParams();
		params.append('request', JSON.stringify(requestBody));

		await request(uri, params, otaInfo);
		await Promise.delay(DELAY_NEXT_CHUNK);
	});
}

async function syncDone(syncId) {
	const calendars = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	await _.values(calendars.properties).asyncMap(updatePropertyCalendar);
}

async function fetchRoomsToSell({ propertyId, otaListingInfo, from, to, otaInfo }) {
	if (!otaInfo) return;

	const uri = getUri(propertyId, otaInfo, 'https://admin.booking.com/fresa/extranet/inventory/fetch');
	const params = new URLSearchParams();
	const req = {
		include_weekends: true,
		dates: {
			range: true,
			dates: [from.toDateMysqlFormat(), to.toDateMysqlFormat()],
		},
		hotel: {
			fields: ['rooms', 'status'],
			rooms: {
				id: [otaListingInfo.otaListingId],
				fields: ['rooms_to_sell', 'status'],
			},
		},
	};

	params.append('request', JSON.stringify(req));
	const response = await request(uri, params, otaInfo);

	if (response.success) {
		const dates = _.get(response.data, `hotel.${propertyId}.rooms.${otaListingInfo.otaListingId}.dates`);
		if (!dates) {
			return {};
		}

		const _dates = {};

		_.keys(dates).forEach(key => {
			if (dates[key].status === 'bookable') {
				_dates[key] = Number(dates[key].rooms_to_sell);
			}
		});

		return _dates;
	}

	return {};
}

async function markNoShow({ otaConfig, propertyId, otaBookingId, rresIds }) {
	if (!rresIds) {
		return Promise.reject('not found rresIds');
	}

	const uri = `https://admin.booking.com/fresa/extranet/reservations/details/mark_no_show`;
	const queries = [
		`hres_id=${otaBookingId}`,
		`hotel_account_id=${otaConfig.other.accountId}`,
		`hotel_id=${propertyId}`,
		`lang=xu`,
		`ses=${otaConfig.other.ses}`,
		...rresIds.map(rresId => `rres_ids_affected[]=${rresId}`),
		...rresIds.map(rresId => `rres_ids_waive_fee[]=${rresId}`),
	];

	const res = await fetchRetry(
		`${uri}?${queries.join('&')}`,
		{
			method: 'POST',
			redirect: 'manual',
		},
		otaConfig
	);

	const json = await res.json();
	if (!json.success) {
		return Promise.reject(json);
	}
}

async function requestToCancelReservation({ otaConfig, propertyId, otaBookingId }) {
	const uri = `https://admin.booking.com/fresa/extranet/reservations/details/request_reservation_cancellation`;
	const queries = [
		`hres_id=${otaBookingId}`,
		'request_cancellation_reason=2',
		`hotel_account_id=${otaConfig.other.accountId}`,
		`hotel_id=${propertyId}`,
		`lang=xu`,
		`ses=${otaConfig.other.ses}`,
	];

	const res = await fetchRetry(
		`${uri}?${queries.join('&')}`,
		{
			method: 'POST',
			redirect: 'manual',
		},
		otaConfig
	);

	const json = await res.json();
	if (!json.success) {
		return Promise.reject(JSON.stringify(json));
	}
}

async function cancelReservation({ otaConfig, propertyId, otaBookingId }) {
	const uri = `https://admin.booking.com/fresa/extranet/reservations/details/cancel_reservation`;
	const queries = [
		`hres_id=${otaBookingId}`,
		`unblock_cancellation=false`,
		`ses=${otaConfig.other.ses}`,
		`hotel_account_id=${otaConfig.other.accountId}`,
		`lang=xu`,
		`hotel_id=${propertyId}`,
	];

	const res = await fetchRetry(
		`${uri}?${queries.join('&')}`,
		{
			method: 'POST',
			redirect: 'manual',
		},
		otaConfig
	);

	const json = await res.json();
	if (!json.success) {
		return Promise.reject(JSON.stringify(json));
	}
}

module.exports = {
	synchronizeSchedule,
	synchronizePrice,
	synchronizePriceDone,
	fetchRoomsToSell,
	syncDone,
	markNoShow,
	requestToCancelReservation,
	cancelReservation,
};

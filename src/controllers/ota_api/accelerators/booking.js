const _ = require('lodash');
// require('isomorphic-fetch');

const { logger } = require('@utils/logger');
const fetchRetry = require('@utils/fetchRetry');
// const { getBookingHeader } = require('@controllers/ota_api/header_helper');
// const { sendExtRequest } = require('@controllers/ota_helper');

// async function request(uri, body, otaConfig) {
// 	const headers = getBookingHeader(otaConfig, {
// 		'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
// 	});

// 	const res = await fetchRetry(
// 		uri,
// 		{
// 			method: 'POST',
// 			headers,
// 			body,
// 			redirect: 'manual',
// 		},
// 		otaConfig
// 	);

// 	if (res.status !== 200) {
// 		const raw = await res.text();
// 		logger.error('Booking syncAccelerator', uri, body, res.status, raw);
// 		return Promise.reject(raw);
// 	}

// 	const json = await res.json();

// 	if (json.status !== 1) {
// 		logger.error('Booking syncAccelerator', uri, body, json);
// 		return Promise.reject(json.message);
// 	}

// 	return json;
// }

const DEFAULT_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36';

async function request(uri, body, otaConfig, hotelId) {
	// const headers = getBookingHeader(otaConfig, {
	// 	'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
	// });

	const fetchOpts = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			// 'X-Booking-Csrf': otaConfig.token,
			Cookie: otaConfig.cookie,
			Origin: 'https://admin.booking.com',
			Referer: `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/co_add.html?hotel_id=${hotelId}&ses=${otaConfig.other.ses}&lang=en`,
			'User-Agent': DEFAULT_AGENT,
		},
		body,
	};

	const res = await fetchRetry(uri, fetchOpts, otaConfig);

	// const extRes = await sendExtRequest(otaConfig, uri, fetchOpts);

	// if (extRes.error) {
	// 	logger.error('Booking syncAccelerator', uri, body, extRes.rawData);
	// 	return Promise.reject(extRes.rawData);
	// }

	// const json = JSON.parse(extRes.rawData);

	if (res.status !== 200) {
		const raw = await res.text();
		logger.error('Booking syncAccelerator', uri, body, res.status, raw);
		return Promise.reject(raw);
	}

	const json = await res.json();

	if (json.status !== 1) {
		logger.error('Booking syncAccelerator', uri, body, json);
		return Promise.reject(json.message);
	}

	return json;
}

async function set(otaConfig, hotelId, accelerator, dates, comm) {
	const uri = `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/json/co_set.json?hotel_id=${hotelId}&ses=${otaConfig.other.ses}&lang=en`;

	const countries =
		accelerator.countries && accelerator.countries.length
			? encodeURIComponent(accelerator.countries.join(',').toLowerCase())
			: '';
	const days = encodeURIComponent(dates.join(','));

	const body = `version=${countries ? '2' : '1'}&days=${days}&types=${countries}&commission=${comm}`;

	await request(uri, body, otaConfig, hotelId);
}

async function del(otaConfig, hotelId, dates) {
	const uri = `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/json/co_reset.json?hotel_id=${hotelId}&ses=${otaConfig.other.ses}&lang=en`;
	const days = encodeURIComponent(dates.join(','));
	const body = `days=${days}`;

	await request(uri, body, otaConfig, hotelId);
}

async function syncAccelerator({ otaConfig, property, commByDates, accelerator, relComm }) {
	const objs = {};

	_.forEach(commByDates, (comVal, date) => {
		objs[comVal] = objs[comVal] || [];
		objs[comVal].push(date);
	});

	await _.entries(objs).asyncForEach(([val, dates]) => {
		val = Number(val);
		if (val) {
			return set(otaConfig, property.propertyId, accelerator, dates, relComm + val);
		}
		return del(otaConfig, property.propertyId, dates);
	});
}

module.exports = {
	syncAccelerator,
};

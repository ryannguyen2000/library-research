const _ = require('lodash');

const { logger } = require('@utils/logger');
const fetch = require('@utils/fetch');
// const { setCookie } = require('@utils/cookie');
const { generateAppHash } = require('@utils/header/mytour');

function getAirbnbHeader(ota, options = null) {
	return {
		accept: 'application/json',
		cookie: ota.cookie,
		'content-type': 'application/json',
		user_id: ota.other.revieweeId,
		'x-csrf-token': ota.token,
		'x-csrf-without-token': 1,
		'x-airbnb-api-key': ota.other.key,
		'x-airbnb-graphql-platform': 'web',
		'x-airbnb-graphql-platform-client': 'minimalist-niobe',
		'x-requested-with': 'XMLHttpRequest',
		'user-agent': 'PostmanRuntime/7.37.3',
		...options,
	};
}

function getLuxstayHeader(ota, options = null) {
	return {
		'X-XSRF-TOKEN': ota.token,
		cookie: ota.cookie,
		authorization: ota.other.authorization,
		host: 'host.luxstay.net',
		'content-type': 'application/json;charset=UTF-8',
		...options,
	};
}

function getBookingHeader(ota, options = null) {
	return {
		hotel_account_id: ota.other.accountId,
		ses: ota.other.ses,
		cookie: ota.cookie,
		'x-booking-csrf': ota.token,
		...options,
	};
}

function getAgodaHeader(ota, options = null) {
	return {
		accept: 'application/json, text/javascript, */*; q=0.01',
		'accept-language': 'en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7',
		connection: 'keep-alive',
		'content-type': 'application/json; charset=UTF-8',
		cookie: ota.cookie,
		// host: 'ycs.agoda.com',
		origin: 'https://ycs.agoda.com',
		// 'x-requested-with': 'XMLHttpRequest',
		...options,
	};
}

function getTravelokaHeader(otaInfo) {
	return {
		'content-type': 'application/json',
		origin: 'https://tera.traveloka.com',
		authorization: `Bearer ${otaInfo.token}`,
		'x-hnet': otaInfo.other.context.hnetSession,
		'x-hnet-lifetime': otaInfo.other.context.hnetLifetime,
		'x-hnet-session': otaInfo.other.context.hnetSession,
	};
}

function getExpediaHeader(ota, options = null, uri) {
	const headers = {
		'content-type': 'application/json',
		cookie: ota.cookie,
		'client-name': 'pc-reservations-web',
		...options,
	};
	if (uri && uri.includes('apps.expediapartnercentral')) {
		headers.cookie = ota.other.appCookie || headers.cookie;
		headers['csrf-token'] = ota.other.csrfToken;
	}

	return { ...headers, ...options };
}

async function getNewCtripCookie(ota, hotelId, retry = 0) {
	// const newCookie = await fetch('https://ebooking.trip.com/ebkovsassembly/ajax/authorHotelWithSubHotel', {
	// 	method: 'POST',
	// 	body: hotelId,
	// 	headers: { 'content-type': 'application/json;charset=UTF-8', cookie },
	// 	redirect: 'manual',
	// })
	// 	.then(async res => {
	// 		const temp = res.headers.raw()['set-cookie'];
	// 		if (!temp) {
	// 			const json = await res.json();
	// 			const newId = json.data && json.data[0] && json.data[0].masterHotelId;
	// 			if (retry === 0 && newId) {
	// 				return await getNewCtripCookie(cookie, newId, retry + 1);
	// 			}

	// 			logger.error('getNewCtripCookie null', hotelId, res.headers, json);

	// 			return [];
	// 		}
	// 		return temp;
	// 	})
	// 	.catch(e => {
	// 		logger.error('getNewCtripCookie', hotelId, e);
	// 		return [];
	// 	});

	try {
		const { reqHead, soa2 = 23270 } = ota.other;

		const clientId = _.get(reqHead, 'client.clientId');
		const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;

		const res = await fetch(
			`https://ebooking.trip.com/restapi/soa2/${soa2}/changeHotel?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`,
			{
				method: 'POST',
				body: JSON.stringify({
					reqHead,
					hotelId,
				}),
				headers: { 'content-type': 'application/json;charset=UTF-8', cookie: ota.cookie },
				redirect: 'manual',
			}
		);

		const json = await res.json();

		if (json.success && json.resStatus.rcode === 200) {
			// success
			// const rawCookies = res.headers.raw()['set-cookie'];
			return true;
		}

		throw json;
	} catch (e) {
		logger.error('getNewCtripCookie', hotelId, e);
	}
}

async function getCtripHeader(ota, options = {}) {
	const { hotelId, ...opts } = options;

	if (hotelId && _.toString(hotelId) !== ota.other.currentHotel) {
		const success = await getNewCtripCookie(ota, hotelId);
		if (success) {
			// ota.cookie = setCookie(ota.cookie, newCookie.join(';'));
			ota.set('other.currentHotel', _.toString(hotelId));
			await ota.save();
		}
	}

	return { cookie: ota.cookie, 'content-type': 'application/json; charset=UTF-8', ...opts };
}

function getTripiHeader(ota, options = null) {
	return {
		'content-type': 'application/json;charset=UTF-8',
		uid: ota.other.uid,
		login_token: ota.token,
		...options,
	};
}

function getGrabhotelHeader(ota, options = null) {
	return {
		authorization: `Bearer ${ota.token}`,
		'content-type': 'application/json;charset=UTF-8',
		...options,
	};
}

function getGo2joyHeader(ota, options = null) {
	return {
		accept: 'application/json',
		'Content-Type': 'application/json',
		authorization: `Bearer ${ota.token}`,
		Version: (ota.other && ota.other.version) || '0.16.3',
		Requester: (ota.other && ota.other.requester) || 'ha',
		Origin: 'https://ha.go2joy.vn',
		Referer: 'https://ha.go2joy.vn/',
		...options,
	};
}

function getMytourHeader(ota, options = null) {
	const timestamp = Date.now();
	return {
		accept: '*/*',
		'content-type': 'application/json',
		timestamp,
		apphash: generateAppHash(timestamp),
		'login-token': ota.token,
		origin: 'https://hms.mytour.vn',
		referer: 'https://hms.mytour.vn/',
		appid: ota.appid || 'hms-premium',
		version: ota.other.version || '1.0',
		...options,
	};
}

function getQuickstayHeader(ota, options = null) {
	return {
		accept: 'application/json, text/plain, */*',
		cookie: ota.cookie,
		'X-Requested-With': 'XMLHttpRequest',
		'content-type': 'application/json;charset=UTF-8',
		...ota.other,
		...options,
	};
}

function getTiketHeader(ota, options = null) {
	return {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		'User-Agent': 'PostmanRuntime/7.41.2',
		Authorization: `Basic ${Buffer.from(
			`${ota.other.connectivityUsername || ota.username}:${ota.other.connectivityPassword || ota.password}`
		).toString('base64')}`,
		...options,
	};
}

const AIRBNB_HOST = 'https://www.airbnb.com.sg';

module.exports = {
	getAgodaHeader,
	getAirbnbHeader,
	getLuxstayHeader,
	getBookingHeader,
	getTravelokaHeader,
	getExpediaHeader,
	getCtripHeader,
	getTripiHeader,
	getGrabhotelHeader,
	getGo2joyHeader,
	getMytourHeader,
	getQuickstayHeader,
	getTiketHeader,
	AIRBNB_HOST,
};

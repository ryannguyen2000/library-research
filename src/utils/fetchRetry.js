const _ = require('lodash');
const mongoose = require('mongoose');
const AsyncLock = require('async-lock');

const { OTAs } = require('@utils/const');
const isoFetch = require('@utils/isoFetch');
const { logger } = require('@utils/logger');
const { stringifyCookies, parseCookies } = require('@utils/cookie');
const headerHelper = require('@controllers/ota_api/header_helper');
const { updateOTAConfig, sendExtRequest } = require('@controllers/ota_helper');

const MAX_RETRY = 1;
const DELAY = 500;
const OTAS_IGNORE_UPDATE_COOKIE = [OTAs.Booking, OTAs.Airbnb, OTAs.Quickstay];

const Lock = new AsyncLock();

function checkRetry(count, response, uri) {
	if (count >= MAX_RETRY || _.get(response, 'type') === 'request-timeout') {
		logger.error('Max retry', response);
		throw new Error(`Max retry ${_.get(response, 'type')} ${_.get(response, 'status')} ${uri}`);
	}
}

async function bookingRetry(uri, option, otaConfig, count) {
	await updateOTAConfig(otaConfig);
	uri = uri.replace(/ses=(\w+)/, `ses=${otaConfig.other.ses}`);

	return fetchRetry(
		uri,
		{
			...option,
			headers: {
				...option.headers,
				...headerHelper.getBookingHeader(otaConfig),
			},
		},
		otaConfig,
		count + 1
	);
}

async function expediaRetry(uri, option, otaConfig, count) {
	await updateOTAConfig(otaConfig);

	return fetchRetry(
		uri,
		{
			...option,
			headers: {
				...option.headers,
				cookie: otaConfig.cookie,
			},
		},
		otaConfig,
		count + 1
	);
}

async function agodaRetry(uri, option, otaConfig, count) {
	await updateOTAConfig(otaConfig);

	return fetchRetry(
		uri,
		{
			...option,
			headers: {
				...option.headers,
				cookie: otaConfig.cookie,
			},
		},
		otaConfig,
		count + 1
	);
}

function getDefaultHeader(otaConfig, uri) {
	const func = headerHelper[`get${_.capitalize(otaConfig.name.split('.')[0])}Header`];
	if (typeof func !== 'function') return;

	return func(otaConfig, null, uri);
}

async function updateCookie(uri, otaConfig, responseCookie) {
	return await Lock.acquire(`${otaConfig.name}_${otaConfig.username}`, async () => {
		const updatedData = {};

		if (uri.includes('apps.expediapartnercentral') && otaConfig.other.appCookie) {
			const newCookies = _.assign(parseCookies(otaConfig.other.appCookie), parseCookies(responseCookie));
			otaConfig.other.appCookie = stringifyCookies(newCookies);
			updatedData['other.appCookie'] = otaConfig.other.appCookie;
		} else {
			const newCookies = _.assign(parseCookies(otaConfig.cookie), parseCookies(responseCookie));
			otaConfig.cookie = stringifyCookies(newCookies);
			updatedData.cookie = otaConfig.cookie;
		}

		await mongoose
			.model('OTAManager')
			.updateMany({ name: otaConfig.name, username: otaConfig.username }, updatedData)
			.catch(err => {
				logger.error(err);
			});
	});
}

async function fetchThrowExt(uri, options, otaConfig) {
	const data = await sendExtRequest(otaConfig, uri, options);

	if (data.error) {
		return Promise.reject(new Error(data.error));
	}

	return {
		...data,
		text: () => new Promise(rs => rs(data.rawData)),
		json: () =>
			new Promise((rs, rj) => {
				try {
					rs(JSON.parse(data.rawData));
				} catch (e) {
					rj(e);
				}
			}),
	};
}

async function fetchRetry(uri, options, otaConfig, count = 0) {
	otaConfig = otaConfig || {};
	options = options || {};
	const { name: otaName } = otaConfig;

	if (_.isEmpty(options.headers)) options.headers = getDefaultHeader(otaConfig, uri);

	try {
		const response =
			otaName === OTAs.Booking ? await fetchThrowExt(uri, options, otaConfig) : await isoFetch(uri, options);

		if (otaName === OTAs.Booking && response.status === 401) {
			checkRetry(count, response, uri);
			return bookingRetry(uri, options, otaConfig, count);
		}

		// if (otaName === OTAs.Booking && response.status === 403) {
		// 	checkRetry(count, response, uri);
		// 	return fetchRetry(uri, options, otaConfig, count + 1);
		// }

		if (
			otaName === OTAs.Expedia &&
			(response.status === 401 || response.url.includes('expediapartnercentral.com/Account/Logon'))
		) {
			checkRetry(count, response, uri);
			return expediaRetry(uri, options, otaConfig, count);
		}

		if (otaName === OTAs.Airbnb && response.status === 403 && !count) {
			return fetchThrowExt(uri, options, otaConfig);
		}

		if (!OTAS_IGNORE_UPDATE_COOKIE.includes(otaName)) {
			// const cookies = response.headers.raw()['set-cookie'];
			const cookies = response.headers && response.headers.getSetCookie && response.headers.getSetCookie();

			if (cookies && cookies.length) {
				await updateCookie(uri, otaConfig, cookies);
			}
		}

		return response;
	} catch (error) {
		checkRetry(count, error, uri);

		if (otaName === OTAs.Agoda && error.code === 'HPE_HEADER_OVERFLOW') {
			return agodaRetry(uri, options, otaConfig, count);
		}

		await Promise.delay(DELAY);
		return fetchRetry(uri, options, otaConfig, count + 1);
	}
}

module.exports = fetchRetry;

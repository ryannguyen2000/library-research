const jwt = require('jsonwebtoken');
const _ = require('lodash');
const puppeteer = require('puppeteer');

const isoFetch = require('@utils/isoFetch');
const { logger } = require('@utils/logger');
// const { generateCookie } = require('@utils/cookie');

async function createBrowser(username) {
	const USER_DATA_DIR = `puppeteer/data/ota/tiket/${username}`;
	const PUPPETEER_MINIMAL_ARGS = [
		'--no-sandbox', //
		'--disable-site-isolation-trials',
		'--disable-web-security',
	];

	const browser = await puppeteer.launch({
		headless: true,
		devtools: false,
		args: PUPPETEER_MINIMAL_ARGS,
		ignoreHTTPSErrors: true,
		userDataDir: USER_DATA_DIR,
	});

	const USER_AGENT =
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.0 Safari/537.36';

	const page = await browser.newPage();

	await page.setUserAgent(USER_AGENT);

	await page.goto('https://tix.tiket.com/app/login', {
		waitUntil: 'networkidle0',
	});

	return { page, browser };
}

async function login(accountData) {
	let json;
	let cookie;

	const { browser, page } = await createBrowser(accountData.username);

	try {
		json = await page.evaluate(
			async body => {
				const res = await fetch('https://tix.tiket.com/app/api/member/login', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body,
				});

				return await res.json();
			},
			JSON.stringify({
				username: accountData.username,
				password: accountData.password,
			})
		);

		await page.reload({ waitUntil: 'networkidle0' });

		// eslint-disable-next-line no-undef
		cookie = await page.evaluate(() => document.cookie);
	} finally {
		await page.close();
		await browser.close();
	}

	return {
		json,
		cookie,
	};
}

async function browserRequest(accountData, uri, options) {
	const { browser, page } = await createBrowser(accountData.username);

	try {
		options = options || {};

		if (!options.headers) {
			options.headers = getTiketHeaders(accountData);
		}

		const result = await page.evaluate(
			(url, opts) => {
				return fetch(url, opts)
					.then(res => res.json())
					.catch(err => ({ error: err.toString() }));
			},
			uri,
			options
		);

		if (result.error) {
			return Promise.reject(result.error);
		}

		return result;
	} finally {
		await page.close();
		await browser.close();
	}
}

async function checkAuth(accountData) {
	if (accountData.token) {
		const decoded = jwt.decode(accountData.token, { complete: true });
		const expireMinutes = 5;

		if (decoded.payload.exp > Date.now() / 1000 + expireMinutes * 60) {
			return accountData;
		}
	}

	const { json, cookie } = await login(accountData);

	accountData.token = json.data.accessToken;
	accountData.other.accountData = json.data;
	accountData.cookie = cookie;

	await accountData.save();

	return accountData;
}

function getTiketHeaders(ota, options = null) {
	return {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		Authorization: `Bearer ${ota.token}`,
		cookie: ota.cookie,
		...options,
	};
}

async function changeHotelSession(otaInfo, propertyId) {
	await checkAuth(otaInfo);

	if (otaInfo.other.currentHotelId === propertyId) {
		return otaInfo;
	}

	const uri = `https://gql.tiket.com/v1/hotel-native/graphql`;
	const body = JSON.stringify([
		{
			operationName: 'changeHotelSession',
			variables: { hotelId: Number(propertyId) },
			query: 'query changeHotelSession($hotelId: ID) {\n  changeHotelSession(hotelId: $hotelId) {\n    code\n    message\n    errors\n  }\n}\n',
		},
	]);

	const headers = getTiketHeaders(otaInfo);

	const results = await isoFetch(uri, {
		method: 'POST',
		headers,
		body,
	});
	if (!results.ok) {
		logger.error('changeHotelSession', body, headers, await results.text());
		throw new Error(`Tiket change hotel sessison error`);
	}

	const json = await results.json();
	if (_.get(json, '[0].data.changeHotelSession.code') !== 'SUCCESS') {
		logger.error('changeHotelSession', body, headers, JSON.stringify(json));
		throw new Error(`Tiket change hotel sessison error`);
	}

	otaInfo.set('other.currentHotelId', propertyId.toString());
	await otaInfo.save();
}

module.exports = {
	checkAuth,
	changeHotelSession,
	getTiketHeaders,
	browserRequest,
};

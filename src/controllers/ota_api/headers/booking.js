/* eslint-disable no-return-assign */
/* eslint-disable no-inner-declarations */
const _ = require('lodash');
const { v4: uuid } = require('uuid');
// const mongoose = require('mongoose');

// const puppeteer = require('puppeteer');
// const puppeteer = require('puppeteer-extra');
// const pluginStealth = require('puppeteer-extra-plugin-stealth');
// const originPuppeteer = require('puppeteer');
// const cherrio = require('cheerio');

// const fetch = require('@utils/fetch');
const { logger } = require('../../../utils/logger');
// const { stringifyCookies, parseCookies } = require('@utils/cookie');

const { SERVICES_EVENTS, SERVICES_EVENT_TYPES, serviceEventEmitter } = require('../../../utils/events');

// const URI = 'https://admin.booking.com';
// const URI_API = 'https://account.booking.com/account/sign-in';

function getAuthFromHtml(html) {
	let [token] = html.match(/var token\s*=\s*.*/gi) || [];
	[token] = (token && token.match(/[A-Z0-9_\-=}]{20,200}/gi)) || [];

	const match = html.match(/window.__GOLEM__ = "(.*)"/);
	const dataStr = match[1].replace(/\\"/g, '"').replace(/\\\\"/g, "'");
	const data = JSON.parse(dataStr);

	return {
		token,
		ses: data.initialState.context.ses,
		accountId: data.initialState.context.hotel_account_id,
		json: encodeURIComponent(JSON.stringify(data.initialState.intercomParameters)),
	};
}

function getAuthMessage(otaConfig) {
	const authJson = JSON.parse(decodeURIComponent(otaConfig.other.json));
	return _.get(authJson, 'auth[0].auth') || authJson.intercom_auth || authJson.auth;
}

// const PUPPETEER_MINIMAL_ARGS = [
// 	// '--disable-site-isolation-trials', //
// 	// '--disable-web-security', //
// 	// '--no-sandbox', //
// 	// '--disable-setuid-sandbox',
// 	// '--disable-gpu',
// 	// '--no-zygote',
// 	// '--disable-background-timer-throttling',
// 	// '--disable-backgrounding-occluded-windows',
// 	// '--disable-renderer-backgrounding',
// ];

// const USER_DATA_DIR = 'puppeteer/data/ota/booking';
// const USER_AGENT =
// 	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.0 Safari/537.36';

// const puppeteerOptions = {
// 	headless: !global.isDev,
// 	// devtools: false,
// 	args: PUPPETEER_MINIMAL_ARGS,
// 	// executablePath: originPuppeteer.executablePath(),
// 	// ignoreDefaultArgs: ['--disable-extensions'],
// };

// puppeteer.use(pluginStealth());

// function delay(ms) {
// 	return new Promise(rs => setTimeout(rs, ms));
// }

// async function setByPassCapchaAgent(page) {
// 	await page.setViewport({ width: 1920, height: 1080 });
// 	await page.setUserAgent(USER_AGENT);
// 	await page.setJavaScriptEnabled(true);
// 	await page.setDefaultNavigationTimeout(0);

// 	// Skip images/styles/fonts loading for performance
// 	// await page.setRequestInterception(true);

// 	// page.on('request', req => {
// 	// 	if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
// 	// 		req.abort();
// 	// 	} else {
// 	// 		req.continue();
// 	// 	}
// 	// });

// 	await page.evaluateOnNewDocument(() => {
// 		// Pass chrome check
// 		// eslint-disable-next-line no-undef
// 		window.chrome = {
// 			runtime: {},
// 			// etc.
// 		};
// 	});

// 	await page.evaluateOnNewDocument(() => {
// 		// Pass notifications check
// 		// eslint-disable-next-line no-undef
// 		const originalQuery = window.navigator.permissions.query;

// 		// eslint-disable-next-line no-undef
// 		return (window.navigator.permissions.query = parameters =>
// 			parameters.name === 'notifications'
// 				? // eslint-disable-next-line no-undef
// 				  Promise.resolve({ state: Notification.permission })
// 				: originalQuery(parameters));
// 	});

// 	await page.evaluateOnNewDocument(() => {
// 		// Overwrite the `plugins` property to use a custom getter.
// 		// eslint-disable-next-line no-undef
// 		Object.defineProperty(navigator, 'plugins', {
// 			// This just needs to have `length > 0` for the current test,
// 			// but we could mock the plugins too if necessary.
// 			get: () => [1, 2, 3, 4, 5],
// 		});

// 		// Overwrite the `languages` property to use a custom getter.
// 		// eslint-disable-next-line no-undef
// 		Object.defineProperty(navigator, 'languages', {
// 			get: () => ['en-US', 'en'],
// 		});

// 		// Pass webdriver check
// 		// eslint-disable-next-line no-undef
// 		Object.defineProperty(navigator, 'webdriver', {
// 			get: () => false,
// 		});
// 	});
// }

// async function login({ page, username, password, loginData }) {
// 	await page.waitForSelector('#loginname');
// 	await page.type('#loginname', username);

// 	await page.click('button[type="submit"]');

// 	await page.waitForSelector('#password');
// 	await delay(565);
// 	await page.type('#password', password);

// 	if (await page.$('#confirmed_password')) {
// 		await delay(467);
// 		await page.type('#confirmed_password', password);
// 	}

// 	await page.evaluate(() => {
// 		// eslint-disable-next-line no-undef
// 		window.shadows = new WeakMap();

// 		// eslint-disable-next-line no-undef
// 		const original = Element.prototype.attachShadow;

// 		// eslint-disable-next-line no-undef
// 		Element.prototype.attachShadow = function () {
// 			// arguments[0].mode = 'open';

// 			// eslint-disable-next-line prefer-rest-params
// 			const shadow = original.apply(this, arguments);
// 			// eslint-disable-next-line no-undef
// 			window.shadows.set(this, shadow);
// 			return shadow;
// 		};
// 	});

// 	await delay(467);
// 	await page.click('button[type="submit"]');

// 	// await page.waitForNavigation({ waitUntil: 'networkidle0' });
// 	const signinData = await waitForVarible(loginData);

// 	logger.info('booking signinData', signinData);

// 	// capcha
// 	if (signinData.px_captcha_id) {
// 		await page.screenshot({ path: `tmp/${Date.now()}_login_before_capcha_loaded.png` });

// 		await page.waitForFunction(() => {
// 			// eslint-disable-next-line no-undef
// 			const el = document.querySelector('#px-captcha');
// 			// eslint-disable-next-line no-undef
// 			const s = window.shadows.get(el);

// 			if (s) {
// 				return s.querySelectorAll('iframe').length;
// 			}

// 			return null;
// 		});

// 		await page.screenshot({ path: `tmp/${Date.now()}_login_after_capcha_loaded.png` });

// 		const rect = await page.evaluate(() => {
// 			// eslint-disable-next-line no-undef
// 			const el = document.querySelector('#px-captcha');
// 			const { x, y } = el.getBoundingClientRect();
// 			return { x, y };
// 		});

// 		const offset = { x: 180, y: 24 };

// 		logger.info('rect offset', rect, offset);

// 		delay(10000)
// 			.then(() => page.screenshot({ path: `tmp/${Date.now()}_login_after_capcha_loaded_${10000}.png` }))
// 			.catch(() => {});
// 		delay(20000)
// 			.then(() => page.screenshot({ path: `tmp/${Date.now()}_login_after_capcha_loaded_${20000}.png` }))
// 			.catch(() => {});
// 		delay(30000)
// 			.then(() => page.screenshot({ path: `tmp/${Date.now()}_login_after_capcha_loaded_${30000}.png` }))
// 			.catch(() => {});

// 		await Promise.race([
// 			page.mouse.click(rect.x + offset.x, rect.y + offset.y, {
// 				delay: 30000,
// 			}),
// 			page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}),
// 		]);
// 	}

// 	if (page.url().includes('/auth-assurance')) {
// 		logger.warn('booking login need sms validation', username);

// 		await page.screenshot({ path: `tmp/${Date.now()}_login_sms.png` });

// 		await page.waitForSelector('.nw-sms-verification-link');
// 		await page.click('.nw-sms-verification-link');

// 		await delay(434);

// 		await page.waitForSelector('.nw-request-tfa');
// 		await page.click('.nw-request-tfa');

// 		const code = await mongoose.model('Passcode').findOTP({
// 			otaName: 'booking',
// 		});

// 		await page.waitForSelector('#sms_code');
// 		await page.type('#sms_code', code);

// 		await page.waitForSelector('button[type="submit"]');
// 		await page.click('button[type="submit"]');
// 	}
// }

// function waitForVarible(vars, timeout) {
// 	return new Promise((rs, rj) => {
// 		timeout = timeout || 100 * 1000;

// 		const interval = setInterval(() => {
// 			if (!_.isEmpty(vars)) {
// 				clearInterval(interval);
// 				clearTimeout(stimeout);
// 				rs(vars);
// 			}
// 		}, 300);

// 		const stimeout = setTimeout(() => {
// 			clearInterval(interval);
// 			clearTimeout(stimeout);
// 			rj('waitForVarible timeout');
// 		}, timeout);
// 	});
// }

// async function getHeaders(otaConfig) {
// 	let browser;
// 	let page;

// 	try {
// 		browser = await puppeteer.launch({
// 			...puppeteerOptions,
// 			ignoreHTTPSErrors: true,
// 			userDataDir: `${USER_DATA_DIR}/${otaConfig.username}`,
// 		});

// 		page = await browser.newPage();

// 		await setByPassCapchaAgent(page);

// 		const authData = {};
// 		const loginData = {};

// 		async function onResponse(response) {
// 			const url = response.url();
// 			const method = response.request().method();

// 			if (method === 'POST' && url.includes('/account/sign-in/password')) {
// 				const rs = await response.json().catch(() => null);

// 				Object.assign(loginData, rs);
// 			}

// 			if (url.includes('/dml/graphql.json')) {
// 				const rs = await response.json().catch(() => null);

// 				if (rs) {
// 					const params = new URLSearchParams(url.split('?')[1]);
// 					const headers = response.headers();

// 					Object.assign(authData, {
// 						ses: params.get('ses'),
// 						headers,
// 					});
// 				}
// 			}
// 		}

// 		page.on('response', onResponse);

// 		await page.goto(`https://admin.booking.com`, {
// 			waitUntil: 'networkidle2',
// 		});

// 		const { username, password } = otaConfig;

// 		if (page.url().includes('/sign-in')) {
// 			login({
// 				page,
// 				username,
// 				password,
// 				loginData,
// 			}).catch(e => {
// 				logger.error('booking login', e);
// 			});
// 		}

// 		const headers = await waitForVarible(authData);
// 		const cookie = await page.cookies();

// 		await page.close();
// 		await browser.close();

// 		return {
// 			data: {
// 				cookie: cookie.map(c => `${c.name}=${c.value}`).join('; '),
// 				other: {
// 					ses: headers.ses,
// 				},
// 			},
// 		};
// 	} catch (e) {
// 		logger.error(e);

// 		if (page) {
// 			await page.close();
// 		}
// 		if (browser) {
// 			await browser.close();
// 		}

// 		return {
// 			error_code: 1,
// 			error_msg: _.toString(e),
// 		};
// 	}
// }

// function parseCardInfoFromHtml(html) {
// 	const $ = cherrio.load(html);
// 	const table = $('.table-condensed table');

// 	const cardInfo = {};

// 	// Iterate over each row of the table using the find and each methods
// 	table.find('tr').each((i, row) => {
// 		// Initialize an empty object to store the row data
// 		const rowData = [];

// 		// Iterate over each cell of the row using the find and each methods
// 		$(row)
// 			.find('td, th')
// 			.each((j, cell) => {
// 				// Add the cell data to the row data object
// 				rowData.push($(cell).text());
// 			});

// 		const key = _.lowerCase(rowData[0]);
// 		const value = _.trim(rowData[1]);

// 		if (key.includes('card type')) {
// 			cardInfo.cardType = value;
// 		}
// 		if (key.includes('card number')) {
// 			cardInfo.cardNumber = value;
// 		}
// 		if (key.includes(`card holder`)) {
// 			cardInfo.cardName = value;
// 		}
// 		if (key.includes(`expiration date`)) {
// 			cardInfo.expirationDate = value.replace(/\s/g, '');
// 		}
// 		if (key.includes(`cvc code`)) {
// 			cardInfo.cvc = _.trim(value);
// 		}
// 	});

// 	return cardInfo;
// }

// async function getCardInfo({ otaConfig, url }) {
// 	let page;
// 	let browser;

// 	try {
// 		browser = await puppeteer.launch({
// 			...puppeteerOptions,
// 			ignoreHTTPSErrors: true,
// 			userDataDir: `${USER_DATA_DIR}/${otaConfig.username}`,
// 		});
// 		await browser.userAgent(USER_AGENT);

// 		page = await browser.newPage();

// 		await setByPassCapchaAgent(page);

// 		const data = {};
// 		const loginData = {};

// 		async function onResponse(response) {
// 			const resUrl = response.url();
// 			const method = response.request().method();

// 			if (method === 'POST' && resUrl.includes('/account/sign-in/password')) {
// 				const rs = await response.json().catch(() => null);

// 				Object.assign(loginData, rs);
// 			}

// 			if (response.status() === 200 && resUrl.includes('booking_cc_details.html')) {
// 				const rs = await response.text().catch(() => null);

// 				if (rs) {
// 					Object.assign(data, {
// 						html: rs,
// 					});
// 				}
// 			}
// 		}

// 		page.on('response', onResponse);

// 		await page.goto(url, {
// 			waitUntil: 'networkidle2',
// 		});

// 		if (page.url().includes('/sign-in')) {
// 			const { username, password } = otaConfig;

// 			login({
// 				page,
// 				username,
// 				password,
// 				loginData,
// 			}).catch(e => {
// 				logger.error('booking login', e);
// 			});
// 		}

// 		await waitForVarible(data);

// 		await page.close();
// 		await browser.close();

// 		if (!data.html) {
// 			return Promise.reject('Not found html data');
// 		}

// 		const cardInfo = parseCardInfoFromHtml(data.html);

// 		if (_.isEmpty(cardInfo)) {
// 			return Promise.reject('Card info not found!');
// 		}

// 		return {
// 			html: data.html,
// 			cardInfo,
// 		};
// 	} catch (e) {
// 		logger.error(e);

// 		if (page) await page.close();
// 		if (browser) await browser.close();

// 		return Promise.reject(e);
// 	}

// 	// require('fs').writeFileSync('test-card.html', data);
// }

// getHeaders({
// 	password: 'Cozrum2023!',
// 	username: 'vacationrentalcozrum@gmail.com',
// }).catch(e => {
// 	console.error(e);
// });

// getCard({
// 	otaConfig: {
// 		password: 'Cozrum2023!',
// 		username: 'vacationrentalcozrum@gmail.com',
// 	},
// 	url: 'https://account.booking.com/oauth2/authorize?client_id=7j60e3SrMdKhbyGR1Rgl;redirect_uri=https%3A%2F%2Fsecure-admin.booking.com%2Fauthenticate.html;response_type=code;state=eyJleHRyYW5ldF9sYW5nIjoieHUiLCJsYW5nIjoieHUiLCJoYXNfYnZjIjowLCJob3RlbF9pZCI6MTE3OTYwMzEsImJuIjo0OTU4NTEwNjE0fQ',
// }).catch(e => {
// 	console.error(e);
// });

// function getHeaders(otaConfig) {
// 	return sendRequest(SERVICES_EVENT_TYPES.BOOKING_GET_HEADERS, {
// 		username: otaConfig.username,
// 		password: otaConfig.password,
// 		otaName: otaConfig.name,
// 	});
// }

function getCardInfo({ otaConfig, url }) {
	return sendRequest(
		SERVICES_EVENT_TYPES.BOOKING_GET_CARD,
		{
			username: otaConfig.username,
			password: otaConfig.password,
			otaName: otaConfig.name,
			url,
		},
		{ timeout: 60 * 1000 * 1.5 }
	);
}

const reqQueue = [];

const REQUEST_TIMEOUT = 60 * 1000;

function sendRequest(event, data, options) {
	const timeout = _.get(options, 'timeout') || REQUEST_TIMEOUT;
	_.unset(options, 'timeout');

	const newCommand = {
		id: uuid(),
		event,
		data,
	};

	reqQueue.push(newCommand);

	newCommand.response = new Promise((res, rej) => {
		const timer = setTimeout(() => {
			newCommand.doing = false;
			const idx = reqQueue.findIndex(c => c === newCommand);
			if (idx >= 0) reqQueue.splice(idx, 1);

			rej(new Error(`sendRequest timeout ${event} ${timeout}`));
		}, timeout);

		newCommand.responseFunc = rs => {
			clearTimeout(timer);
			res(rs);
		};

		newCommand.rejectFunc = e => {
			clearTimeout(timer);
			rej(e);
		};
	});

	serviceEventEmitter.emit(SERVICES_EVENTS.REQUEST, newCommand);

	return newCommand.response;
}

function onServiceResponse(data) {
	if (!data.id || data.event === SERVICES_EVENT_TYPES.REQUEST_OTP) {
		return;
	}

	const reqIdx = reqQueue.findIndex(q => q.id === data.id);

	if (reqIdx === -1) {
		logger.warn(`onServiceResponse Not found command for ${data.id} ${data.event}`, data);
		return;
	}

	const command = reqQueue[reqIdx];

	command.responseFunc(data.result);

	reqQueue.splice(reqIdx, 1);
}

serviceEventEmitter.on(SERVICES_EVENTS.RESPONSE, onServiceResponse);

module.exports = {
	// getHeaders,
	getCardInfo,
	getAuthMessage,
	getAuthFromHtml,
	// parseCardInfoFromHtml,
};

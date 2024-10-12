const _ = require('lodash');
const qs = require('qs');

const { createBrowser, autoRegister, setTextInputValue, setByPassCapchaAgent } = require('./sharedAutoProcess');
const { ACTION } = require('./const');
const { logger } = require('../../utils/logger');

// const CHOOSE_LOGIN_PAGE = 'https://dichvucong.dancuquocgia.gov.vn/portal/choose_login.jsp';
const PAGE = 'https://dichvucong.dancuquocgia.gov.vn';

let browser;
let page;
let [, , username, password, requestId, defaultData, isExtCheckout] = process.argv;

defaultData = defaultData && JSON.parse(defaultData);

async function onResponse(response) {
	const url = response.url();
	const method = response.request().method();
	const ok = response.status() === 200;

	try {
		if (url.includes('register/captcha/verify') && method === 'GET') {
			const { type } = qs.parse(url.split('?')[1]);
			const rs = ok ? await response.json() : null;

			if (type === 'create') {
				process.send({
					type: ACTION.GET_CAPCHA_DONE,
					payload: {
						capcha: rs && rs.data,
						requireOTP: true,
					},
				});
			} else if (type === 'verify') {
				const isError = !ok || (ok && rs && rs.status === 'ERROR');

				process.send({
					type: ACTION.SEND_CAPCHA_DONE,
					payload: {
						errorCode: isError ? 1 : 0,
						errorMsg: isError ? 'Sai capcha' : rs.message,
						requireOTP: true,
					},
				});
			}
		}

		if (url.includes('/authenticationendpoint/vnconnect-authenticator.jsp') && method === 'GET') {
			const params = qs.parse(url.split('?')[1]);
			// OTPRequestFailure OTPRequest
			if (params.typeRequestFailure === 'OTPRequestFailure' || params.finalCode) {
				let errorCode = params.typeRequestFailure ? 1 : 0;
				let errorMsg = errorCode ? params.authFailureMsg : '';
				let sendEvent = true;

				if (!errorCode) {
					sendEvent = false;
					await autoRegister({
						currentProcess: process,
						page,
						browser,
						defaultData,
						isExtCheckout,
					}).catch(err => {
						sendEvent = true;
						errorCode = 1;
						errorMsg = _.toString(err);
					});
				}

				if (sendEvent) {
					process.send({
						type: ACTION.SEND_OTP_DONE,
						payload: {
							errorCode,
							errorMsg,
						},
					});
				}
			}
		}
	} catch (e) {
		logger.error('onResponse error', url, e);
	}
}

(async function run() {
	try {
		browser = await createBrowser(requestId);
		page = await browser.newPage();

		await setByPassCapchaAgent(page);

		page.on('response', onResponse);

		process.send({
			type: ACTION.READY,
			payload: {
				capcha: true,
			},
		});
	} catch (e) {
		logger.error(e);
		process.send({ type: ACTION.ERROR, payload: _.toString(e) });
	}
})();

async function sendCapcha(capcha) {
	await setTextInputValue(page, '#username', username);
	await setTextInputValue(page, '#password', password);
	await setTextInputValue(page, '#captcha', capcha);

	await page.click('#BtnLoginAccount');
}

async function requestCapcha() {
	await page.goto(PAGE, {
		waitUntil: 'networkidle2',
	});

	await page.waitForSelector('#userLogin');
	const loginNode = await page.$('#userLogin');
	const userName = await loginNode.evaluate(node => node.innerText);

	logger.info('autoProcess3 userName', userName);

	if (!_.trim(userName)) {
		await page.click('#btnLogin');

		await page.waitForSelector('.box-openID > div:nth-child(2) > a');
		await page.click('.box-openID > div:nth-child(2) > a');

		await page.waitForSelector('#icon-1');
		await page.click('#icon-1');
	} else {
		await autoRegister({
			currentProcess: process,
			page,
			browser,
			defaultData,
			isExtCheckout,
		});
	}
}

async function sendOTP(otp) {
	await page.waitForSelector('#authenticate');

	for (let i = 0; i < 6; i++) {
		await setTextInputValue(page, `#codeBox${i + 1}`, otp[i]);
	}

	await page.click('#authenticate');
}

async function requestOTP() {
	await page.waitForSelector('#resendOTP');
	await page.click('#resendOTP');

	process.send({
		type: ACTION.GET_OTP_DONE,
	});
}

process.on('message', async ({ type, payload }) => {
	try {
		if (type === ACTION.GET_CAPCHA) {
			await requestCapcha(payload);
		} else if (type === ACTION.SEND_CAPCHA) {
			await sendCapcha(payload).catch(e => {
				logger.error('DVC sendCapcha', e);
			});
		} else if (type === ACTION.GET_OTP) {
			await requestOTP(payload);
		} else if (type === ACTION.SEND_OTP) {
			await sendOTP(payload).catch(e => {
				logger.error('DVC sendOTP', e);
			});
		}
	} catch (err) {
		logger.error(err);
		process.send({
			type: `${type}_DONE`,
			payload: {
				errorCode: 1,
				errorMsg: _.toString(err),
			},
		});
	}
});

process.on('exit', () => {
	if (browser) browser.close();
});

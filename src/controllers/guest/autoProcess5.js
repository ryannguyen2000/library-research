const _ = require('lodash');
const moment = require('moment');

const { createBrowser, autoRegister, delay, setByPassCapchaAgent } = require('./sharedAutoProcess');
const { ACTION } = require('./const');
const { logger } = require('../../utils/logger');

const PAGE = 'https://dichvucong.dancuquocgia.gov.vn';

let browser;
let page;
let [, , username, password, requestId, defaultData, isExtCheckout] = process.argv;
let requestedOTP = false;
let state = {};

defaultData = defaultData && JSON.parse(defaultData);

function checkOTP() {
	if (!state.otp || state.otp.mode !== 'expiredDate' || !state.otp.expiredDate) return false;

	return moment(state.otp.expiredDate, 'DD/MM/YYYY HH:mm:ss').isAfter(new Date());
}

async function onResponse(response) {
	const url = response.url();
	const method = response.request().method();
	// const ok = response.status() === 200;

	try {
		if (method === 'POST' && url.includes('/idp/sso/login-actions/change-mode')) {
			const rs = await response.json().catch(() => null);

			logger.warn('onResponse DVC change-mode', rs);

			if (rs && rs.otp) {
				state.otp = rs;
				process.send({ type: ACTION.GET_OTP_DONE });
			}
		}

		if (method === 'POST' && url.includes('/idp/sso/login-actions/authenticate')) {
			const rs = await response.json().catch(() => null);

			logger.warn('onResponse DVC', rs);

			// {"otp":true,"expiredDate":"11/08/2023 10:37:45","phoneNumber":"090****289"}
			if (rs && rs.otp) {
				state.otp = rs;
				process.send({ type: ACTION.GET_OTP_DONE });
			}

			// {"error":"invalid_grant_vneid","error_description":"Mã OTP đã hết hiệu lực."}
			if (rs && rs.error === 'invalid_grant_vneid') {
				if (requestedOTP) {
					process.send({
						type: ACTION.SEND_OTP_DONE,
						payload: {
							errorCode: 1,
							errorMsg: rs.error_description,
							requireOTP: true,
						},
					});
				} else {
					process.send({
						type: ACTION.ERROR,
						payload: rs.error_description,
					});
				}
			}

			// const headers = response.headers();

			// if (headers.Location && headers.Location.includes('/commonauth')) {
			// 	//
			// }
		}
	} catch (e) {
		logger.error('onResponse error', url, e);
	}
}

(async function run() {
	try {
		browser = await createBrowser(requestId);
		page = await browser.newPage();

		page.on('response', onResponse);

		await setByPassCapchaAgent(page);

		await page.goto(PAGE, {
			waitUntil: 'networkidle2',
		});

		await page.waitForSelector('#userLogin');
		const loginNode = await page.$('#userLogin');
		const userName = await loginNode.evaluate(node => node.innerText);

		logger.info('autoProcess5 userName', userName);

		if (!_.trim(userName)) {
			await page.click('#btnLogin');

			await page.waitForSelector('.box-openID > div:nth-child(2) > a');
			await page.click('.box-openID > div:nth-child(2) > a');

			await page.waitForSelector('#icon-2');
			await page.click('#icon-2');

			await page.waitForNavigation({ waitUntil: 'networkidle2' });

			await page.waitForSelector('#username');

			await page.focus('#username');
			await page.keyboard.type(username);

			await delay(100);

			await page.focus('#password');
			await page.keyboard.type(password);

			await page.click('.ant-form-item button');
			await page.waitForSelector('#otp-input');

			await delay(500);

			await requestOTP().catch(e => {
				logger.error('run requestOTP', e);
			});

			process.send({
				type: ACTION.READY,
				payload: {
					otp: true,
					noRefresh: true,
				},
			});
		}

		while (true) {
			let useTxt;

			try {
				const ln = await page.$('#userLogin');
				useTxt = ln && _.trim(await ln.evaluate(node => node.innerText));
			} catch (e) {
				//
			}

			if (useTxt) {
				await autoRegister({
					currentProcess: process,
					page,
					browser,
					defaultData,
					isExtCheckout,
				});
				return;
			}

			await delay(1000);
		}
	} catch (e) {
		logger.error(e);
		process.send({ type: ACTION.ERROR, payload: _.toString(e) });
	}
})();

async function sendOTP(otp) {
	await page.waitForSelector('#otp-input');

	requestedOTP = true;

	for (let i = 0; i < 6; i++) {
		await page.focus(`#otp-input:nth-child(${i + 1})`);
		await page.keyboard.type(otp[i]);
		await delay(100);
	}

	// await page.click('.custom-modal-otp .custom-btn-resolve');
	await page.click(`.ant-modal-body button.custom-btn-resolve`);
}

async function requestOTP() {
	// await page.waitForSelector('.flex.cursor-pointer.items-center.space-x-2');
	// await page.click('.flex.cursor-pointer.items-center.space-x-2');

	if (checkOTP()) {
		process.send({ type: ACTION.GET_OTP_DONE });
		return;
	}

	await page.click(`.mt-6.flex.justify-between > div:nth-child(2)`);

	await delay(500);

	await page.evaluate(() => {
		// eslint-disable-next-line no-undef
		const nodes = document.querySelectorAll('.ant-modal-body button.custom-btn-resolve');
		nodes[nodes.length - 1].click();
	});

	requestedOTP = true;

	// await request(`https://vneid.gov.vn/api/idp/sso/login-actions/authenticate`, {
	// 	method: 'POST',
	// 	headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	// 	body: `resendOtp=true`,
	// });
}

function getCapcha() {
	process.send({
		type: ACTION.GET_CAPCHA_DONE,
		payload: {
			errorCode: 0,
			requireOTP: true,
		},
	});
}

function sendCapcha() {
	process.send({
		type: ACTION.SEND_CAPCHA_DONE,
		payload: {
			errorCode: 0,
			requireOTP: true,
		},
	});
}

process.on('message', async ({ type, payload }) => {
	try {
		if (type === ACTION.GET_CAPCHA) {
			await getCapcha(payload);
		} else if (type === ACTION.SEND_CAPCHA) {
			await sendCapcha(payload);
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

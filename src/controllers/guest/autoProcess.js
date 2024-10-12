const _ = require('lodash');

const { logger } = require('../../utils/logger');
const {
	createBrowser,
	autoRegister,
	clearBrowserCookie,
	setTextInputValue,
	setByPassCapchaAgent,
} = require('./sharedAutoProcess');
const { ACTION } = require('./const');

// const LOGIN_PAGE = 'https://dichvucong.dancuquocgia.gov.vn/portal/login.jsp';
// const CHOOSE_LOGIN_PAGE = 'https://dichvucong.dancuquocgia.gov.vn/portal/choose_login.jsp';
const PAGE = 'https://dichvucong.dancuquocgia.gov.vn';

let browser;
let page;
let [, , username, password, requestId, defaultData, isExtCheckout] = process.argv;

const sendCapchaResponse = _.debounce(capcha => {
	process.send({
		type: ACTION.GET_CAPCHA_DONE,
		payload: {
			capcha,
		},
	});
}, 1000);

async function onResponse(response) {
	const url = response.url();

	try {
		if (url.includes('capcha/CaptchaServlet')) {
			const buffer = await response.buffer().catch(() => null);
			sendCapchaResponse(buffer && buffer.toString('base64'));
		}
		if (url.includes('capcha/CaptchaVerification')) {
			const rs = await response.json().catch(() => null);

			let errorCode = rs && rs.MSG_CODE === 'ERROR' ? 1 : 0;
			let errorMsg = errorCode ? rs.MSG_ERROR : '';
			let sendEvent = true;

			if (!errorCode) {
				sendEvent = false;
				await autoRegister({
					currentProcess: process,
					page,
					browser,
					isExtCheckout,
				}).catch(err => {
					sendEvent = true;
					errorCode = 1;
					errorMsg = _.toString(err);
				});
			}

			if (sendEvent) {
				process.send({
					type: ACTION.SEND_CAPCHA_DONE,
					payload: {
						errorCode,
						errorMsg,
					},
				});
			}
		}
		if (url.includes('portal/oidc-login')) {
			const html = await response.text().catch(() => '');
			const errorTxt = 'Error 500--Internal Server Error';
			if (html.includes(errorTxt)) {
				await clearBrowserCookie(page);
				process.send({
					type: ACTION.SEND_CAPCHA_DONE,
					payload: {
						errorCode: 1,
						errorMsg: errorTxt,
					},
				});
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
		// await page.setRequestInterception(true);
		// page.on('request', onRequest);
		page.on('response', onResponse);
		// await page._client.send('Network.clearBrowserCookies');

		await setByPassCapchaAgent(page);

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

	// const capchaElement = await page.waitForSelector('#img_captcha');
	// await page.screenshot({ path: `${TMP}/${requestId}_login.png` });
	// await page.screenshot({
	// 	path: `${TMP}/${requestId}_capcha.png`,
	// 	clip: await capchaElement.boundingBox(),
	// });
	// const capcha = await waitForInput('Nhập capcha: ');
})();

async function sendCapcha(capcha) {
	await setTextInputValue(page, '#username', username);
	await setTextInputValue(page, '#password', password);
	await setTextInputValue(page, '#captchaTextBox', capcha);

	await page.click('#btn_dangnhap');
}

async function getCapcha() {
	await page.goto(PAGE, {
		waitUntil: 'networkidle2',
	});

	await page.waitForSelector('#userLogin');
	const loginNode = await page.$('#userLogin');
	const userName = await loginNode.evaluate(node => node.innerText);

	logger.info('autoProcess userName', userName);

	if (!_.trim(userName)) {
		await page.click('#btnLogin');

		await page.waitForSelector('.box-openID > div:nth-child(1) > a');
		await page.click('.box-openID > div:nth-child(1) > a');

		// await page.waitForSelector('#btn_dangnhap');
	} else {
		await autoRegister({
			currentProcess: process,
			page,
			browser,
			isExtCheckout,
		});
	}
}

process.on('message', async ({ type, payload }) => {
	try {
		if (type === ACTION.GET_CAPCHA) {
			await getCapcha(payload);
		} else if (type === ACTION.SEND_CAPCHA) {
			await sendCapcha(payload);
		}
	} catch (e) {
		logger.error(e);
		process.send({
			type: `${type}_DONE`,
			payload: {
				errorCode: 1,
				errorMsg: _.toString(e),
			},
		});
	}
});

process.on('exit', () => {
	if (browser) browser.close();
});

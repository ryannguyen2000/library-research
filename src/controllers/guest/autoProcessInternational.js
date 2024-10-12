const _ = require('lodash');

const { logger } = require('../../utils/logger');
const { createBrowser, setTextInputValue, getFile, delay, USER_AGENT } = require('./sharedAutoProcess');
const { ACTION } = require('./const');

const PAGE = 'https://hochiminh.xuatnhapcanh.gov.vn';

let browser;
let page;
let [, , username, password, requestId, defaultData, isExtCheckout] = process.argv;
let currentType;

async function onResponse(response) {
	const url = response.url();

	try {
		if (url.includes('/faces/import_xml.jsf') && response.request().method() === 'POST') {
			const txt = await response.text();
			if (txt.includes('pt1:aot21')) {
				const isSuccess = txt.includes('đã thêm thành công');
				if (isSuccess) {
					process.send({
						type: ACTION.SUCCESS,
					});
				} else {
					const resultNode = await page.waitForSelector('#pt1\\:aot21');
					const resultText = await resultNode.evaluate(node => node.textContent);
					process.send({
						type: currentType,
						payload: {
							errorCode: 1,
							errorMsg: resultText,
							requireCapcha: false,
						},
					});
				}
			}
		}
		if (url.includes('/kaptchaimage') && response.status() === 200) {
			const buffer = await response.buffer().catch(() => null);
			process.send({
				type: ACTION.GET_CAPCHA_DONE,
				payload: {
					capcha: buffer && buffer.toString('base64'),
				},
			});
		}
	} catch (e) {
		logger.error('onResponse error', url, e);
	}
}

(async function run() {
	try {
		browser = await createBrowser();

		page = await browser.newPage();
		page.on('response', onResponse);
		await page.setUserAgent(USER_AGENT);

		await page.evaluateOnNewDocument(() => {
			delete navigator.__proto__.webdriver;
			navigator.webdriver = false;
		});

		process.send({ type: ACTION.READY, payload: { capcha: true } });
	} catch (e) {
		logger.error(e);
		process.send({ type: ACTION.ERROR, payload: _.toString(e) });
	}
})();

async function login() {
	try {
		await page.goto(`${PAGE}/faces/login.jsf`, { waitUntil: 'networkidle2' });

		const usernameNode = await page.waitForSelector('.tileUserName');
		const userName = await usernameNode.evaluate(node => node.textContent);
		if (userName && userName.trim()) {
			await page.click('pt1\\:pt_l1');
			await page.waitForNavigation();
		}

		// await setTextInputValue(page, '#pt1\\:s1\\:it1\\:\\:content', username);
		// await setTextInputValue(page, '#pt1\\:s1\\:it2\\:\\:content', password);

		const capchaNode = await page.evaluate(() => {
			// eslint-disable-next-line no-undef
			return document.querySelector('#pt1\\:s1\\:ig1');
		});
		if (!capchaNode) {
			await submit(ACTION.GET_CAPCHA_DONE);
		}
	} catch (e) {
		logger.error(e);
		process.send({
			type: ACTION.GET_CAPCHA_DONE,
			payload: {
				errorCode: 1,
				errorMsg: _.toString(e),
				requireCapcha: false,
			},
		});
	}
}

async function submit(type, capcha) {
	try {
		await setTextInputValue(page, '#pt1\\:s1\\:it1\\:\\:content', username);
		await setTextInputValue(page, '#pt1\\:s1\\:it2\\:\\:content', password);
		if (capcha) {
			await setTextInputValue(page, '#pt1\\:s1\\:i6\\:\\:content', capcha);
		}

		await page.click('#pt1\\:s1\\:b1 > a');
		await page.waitForNavigation();

		const resultText = await page.evaluate(() => {
			// eslint-disable-next-line no-undef
			const uiElem = document.querySelector('#pt1\\:s1\\:aot21');
			return uiElem ? uiElem.textContent : '';
		});

		if (resultText && resultText.trim()) {
			process.send({
				type,
				payload: {
					errorCode: 1,
					errorMsg: resultText,
					requireCapcha: false,
				},
			});
			return;
		}

		await register();
	} catch (e) {
		logger.error(e);
		process.send({
			type,
			payload: {
				errorCode: 1,
				errorMsg: _.toString(e),
				requireCapcha: false,
			},
		});
	}
}

async function register() {
	await page.goto(`${PAGE}/faces/import_xml.jsf`, {
		waitUntil: 'networkidle2',
	});

	const uploadElem = await page.waitForSelector('#pt1\\:inputFileUpload\\:\\:if');
	const filePath = await getFile(process, isExtCheckout);

	await uploadElem.uploadFile(filePath);
	await uploadElem.evaluate(upload => upload.dispatchEvent(new Event('change', { bubbles: true })));

	await page.waitForSelector('#pt1\\:inputFileUpload\\:\\:p\\:\\:t\\:\\:r0');
	await delay(800);

	const btnUpload = await page.waitForSelector('#pt1\\:cmommit');
	await btnUpload.evaluate(e => e.click());
}

process.on('message', ({ type, payload }) => {
	if (type === ACTION.GET_CAPCHA) {
		currentType = ACTION.GET_CAPCHA_DONE;
		login();
	}
	if (type === ACTION.SEND_CAPCHA) {
		currentType = ACTION.SEND_CAPCHA_DONE;
		submit(currentType, payload);
	}
});

process.on('exit', () => {
	if (browser) browser.close();
});

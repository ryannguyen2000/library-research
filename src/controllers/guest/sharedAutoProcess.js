/* eslint-disable no-undef */
const puppeteer = require('puppeteer');
const random = require('lodash/random');
// const puppeteer = require('puppeteer-extra');
// const pluginStealth = require('puppeteer-extra-plugin-stealth');
// const originPuppeteer = require('puppeteer');

const path = require('path');
const fs = require('fs');
const { ACTION } = require('./const');
// const { logger } = require('../../utils/logger');

const USER_DATA_DIR = 'puppeteer/data/guestAutoRegister';
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.0 Safari/537.36';
const REGISTER_PAGE = 'https://dichvucong.dancuquocgia.gov.vn/portal/p/home/thong-bao-luu-tru.html';

// puppeteer.use(pluginStealth());

async function createBrowser(requestId) {
	const options = {
		// headless: true,
		headless: 'new',
		args: [
			'--no-sandbox', //
			'--disable-web-security',
			'--disable-site-isolation-trials',
			'--disable-background-timer-throttling',
			'--disable-backgrounding-occluded-windows',
			'--disable-renderer-backgrounding',
		],
		ignoreHTTPSErrors: true,
		defaultViewport: { width: 1920, height: 1080 },
		// executablePath: originPuppeteer.executablePath(),
	};
	if (requestId) {
		const userDataDir = path.join(USER_DATA_DIR, requestId);
		if (
			await fs.promises
				.access(userDataDir, fs.constants.F_OK)
				.then(() => false)
				.catch(() => true)
		) {
			await fs.promises.mkdir(userDataDir, { recursive: true });
		}
		options.userDataDir = userDataDir;
	}

	const browser = await puppeteer.launch(options);
	await browser.userAgent(USER_AGENT);

	return browser;
}

function getFile(cProcess, isExtCheckout) {
	return new Promise(rs => {
		cProcess.send({
			type: ACTION.GET_FILE,
			payload: {
				isExtCheckout,
			},
		});
		const listener = ({ type, payload }) => {
			if (type === ACTION.GET_FILE_DONE) {
				cProcess.removeListener('message', listener);
				rs(payload);
			}
		};
		cProcess.on('message', listener);
	});
}

function delay(time) {
	return new Promise(rs => setTimeout(rs, time));
}

function randDelay(minTime = 100, maxTime = 1000) {
	const time = random(minTime, maxTime);
	return new Promise(rs => setTimeout(rs, time));
}

async function autoRegister({ currentProcess, page, browser, defaultData, isExtCheckout }) {
	await page.waitForSelector('#userLogin');
	// await page.waitForNavigation({ waitUntil: 'networkidle2' });

	await page.goto(REGISTER_PAGE, {
		waitUntil: 'networkidle2',
	});

	const modalHelper = await page.$('#frm_View_Huongdan');
	if (modalHelper) {
		await modalHelper.evaluate(el => {
			el.style.display = 'none';
		});
	}

	if (defaultData) {
		await randDelay();

		const code = `
			jQuery('#accomStay_cboPROVINCE_ID').val('${defaultData.province}');
			jQuery('#accomStay_cboPROVINCE_ID').change();
			jQuery('#accomStay_cboDISTRICT_ID').val('${defaultData.district}');
			jQuery('#accomStay_cboDISTRICT_ID').change();
			jQuery('#accomStay_cboADDRESS_ID').val('${defaultData.ward}');
			jQuery('#accomStay_cboADDRESS_ID').change();
			${
				defaultData.addressType
					? `jQuery("input[name='radADDRESS_TYPE'][value='${defaultData.addressType}']").click();`
					: ''
			}`;

		await page.evaluate(code);

		await randDelay();

		const code2 = `
			jQuery('#accomStay_cboACCOMMODATION_TYPE').val('${defaultData.accommodationType}');
			jQuery('#accomStay_cboACCOMMODATION_TYPE').change();
			jQuery('#accomStay_txtADDRESS').val('${defaultData.address}');`;
		await page.evaluate(code2);

		await randDelay();

		const code3 = defaultData.homeId
			? `jQuery('#accomStay_cboNAME').val('${defaultData.homeId}');jQuery('#accomStay_cboNAME').change();`
			: `jQuery('#accomStay_txtNAME_T').val('${defaultData.name}');`;

		await page.evaluate(code3);
	}

	const filePath = await getFile(currentProcess, isExtCheckout);

	const openModalUpload = await page.waitForSelector('#upload-file-excel > button');
	await openModalUpload.evaluate(e => e.click());

	const uploadElem = await page.waitForSelector('#FileUpload');
	await uploadElem.uploadFile(filePath);
	await uploadElem.evaluate(upload => upload.dispatchEvent(new Event('change', { bubbles: true })));

	const btnUpload = await page.waitForSelector('#btnUpload');
	await btnUpload.evaluate(e => e.click());

	const btnSaveExcelNLT = await page.waitForSelector('#btnSaveExcelNLT');
	await btnSaveExcelNLT.evaluate(e => e.click());

	const check = await page.waitForSelector('#chkCHECK_LIABILITY');
	await check.evaluate(e => {
		e.checked = true;
	});

	// const btnAdd = await page.waitForSelector('#btnAdd');

	const btnAdd = await page.waitForSelector('#btnSaveSend');
	await btnAdd.evaluate(e => e.click());

	await page.waitForNavigation();
	await randDelay(700, 1000);

	await browser.close();

	currentProcess.send({
		type: ACTION.SUCCESS,
	});
}

async function clearBrowserCookie(page) {
	// clear cookies
	const client = await page.target().createCDPSession();
	await client.send('Network.clearBrowserCookies');
}

async function setTextInputValue(page, selector, value) {
	await page.waitForSelector(selector);

	return page.evaluate(
		data => {
			document.querySelector(data.selector).value = data.value;
		},
		{ selector, value }
	);
}

async function setByPassCapchaAgent(page) {
	await page.setViewport({ width: 1920, height: 1080 });
	await page.setUserAgent(USER_AGENT);
	await page.setJavaScriptEnabled(true);
	await page.setDefaultNavigationTimeout(0);

	// Skip images/styles/fonts loading for performance
	// await page.setRequestInterception(true);

	// page.on('request', req => {
	// 	if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
	// 		req.abort();
	// 	} else {
	// 		req.continue();
	// 	}
	// });

	await page.evaluateOnNewDocument(() => {
		// Pass chrome check
		// eslint-disable-next-line no-undef
		window.chrome = {
			runtime: {},
			// etc.
		};
	});

	await page.evaluateOnNewDocument(() => {
		// Pass notifications check
		// eslint-disable-next-line no-undef
		const originalQuery = window.navigator.permissions.query;

		// eslint-disable-next-line no-undef, no-return-assign
		return (window.navigator.permissions.query = parameters =>
			parameters.name === 'notifications'
				? // eslint-disable-next-line no-undef
				  Promise.resolve({ state: Notification.permission })
				: originalQuery(parameters));
	});

	await page.evaluateOnNewDocument(() => {
		// Overwrite the `plugins` property to use a custom getter.
		// eslint-disable-next-line no-undef
		Object.defineProperty(navigator, 'plugins', {
			// This just needs to have `length > 0` for the current test,
			// but we could mock the plugins too if necessary.
			get: () => [1, 2, 3, 4, 5],
		});

		// Overwrite the `languages` property to use a custom getter.
		// eslint-disable-next-line no-undef
		Object.defineProperty(navigator, 'languages', {
			get: () => ['en-US', 'en'],
		});

		// Pass webdriver check
		// eslint-disable-next-line no-undef
		Object.defineProperty(navigator, 'webdriver', {
			get: () => false,
		});

		// eslint-disable-next-line no-proto
		delete navigator.__proto__.webdriver;
		navigator.webdriver = false;
	});
}

module.exports = {
	createBrowser,
	autoRegister,
	getFile,
	clearBrowserCookie,
	setTextInputValue,
	delay,
	randDelay,
	setByPassCapchaAgent,
	USER_AGENT,
};

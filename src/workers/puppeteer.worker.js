// const puppeteer = require('puppeteer');
const puppeteer = require('puppeteer-extra');
const pluginStealth = require('puppeteer-extra-plugin-stealth');
const originPuppeteer = require('puppeteer');

const _ = require('lodash');
const { v4: uuid } = require('uuid');
const { parentPort } = require('worker_threads');
const moment = require('moment');

const { logger } = require('../utils/logger');
const { UPLOAD_CONFIG } = require('../../config/setting');
const { checkFolder } = require('../utils/file');
const CONSTANT = require('./const');

const PUPPETEER_MINIMAL_ARGS = [
	'--disable-site-isolation-trials', //
	'--disable-web-security', //
	'--no-sandbox', //
	'--disable-gpu',
	'--disable-setuid-sandbox',
	'--no-zygote',
];

const DEFAULT_TIMEOUT_PRINT_PDF = 300000;

const userDataDir = 'puppeteer/data/worker';
const puppeteerOptions = {
	headless: true,
	devtools: false,
	args: PUPPETEER_MINIMAL_ARGS,
	userDataDir,
	executablePath: originPuppeteer.executablePath(),
	ignoreDefaultArgs: ['--disable-extensions'],
};

puppeteer.use(pluginStealth());

const browsers = {};
const timers = {};

const BROWSER = 'browser';
const EXCEL_BROWSER = 'excel_browser';

async function generateImagePath({ html, url, selector, selectorRoot, fileDir, fileName, viewPort, options = null }) {
	fileDir = fileDir || moment().format('YY/MM/DD');
	fileName = fileName || uuid();

	await checkFolder(`${UPLOAD_CONFIG.PATH}/${fileDir}`);

	const browser = await initBrowser(BROWSER);
	const page = await browser.newPage();

	if (html) {
		await page.setContent(html);
	} else if (url) {
		await page.goto(url, {
			waitUntil: 'networkidle2',
		});
	}

	if (viewPort) {
		await page.setViewport(viewPort);
	}

	if (selectorRoot) {
		let results = [];
		await page.waitForSelector(selectorRoot, { visible: true });
		const selectorIds = await page.$$eval(`${selectorRoot}`, children =>
			children.map(childrenSelector => `#${childrenSelector.id}`)
		);
		results = await Promise.all(
			selectorIds.map(async (selectorId, i) => {
				const selectNumber = i + 1;
				const $ = await page.$(selectorId);
				await $.screenshot({
					type: 'jpeg',
					path: `${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}-${selectNumber}.jpg`,
					captureBeyondViewport: true,
					...options,
				});
				return `${UPLOAD_CONFIG.FULL_URI_DOC}/${fileDir}/${fileName}-${selectNumber}.jpg`;
			})
		).catch(err => {
			logger.error(err);
			return results;
		});
		return results;
	}

	if (selector) {
		await page.waitForSelector(selector);
		const $ = await page.$(selector);
		await $.screenshot({
			type: 'jpeg',
			path: `${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}.jpg`,
			captureBeyondViewport: true,
			...options,
		});
	} else {
		await page.screenshot({
			type: 'jpeg',
			path: `${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}.jpg`,
			fullPage: true,
			...options,
		});
	}

	await page.close();

	return `${UPLOAD_CONFIG.FULL_URI_DOC}/${fileDir}/${fileName}.jpg`;
}

async function generatePdfPath({ html, fileDir, fileName, options = null }) {
	fileDir = fileDir || moment().format('YY/MM/DD');
	fileName = fileName || uuid();

	await checkFolder(`${UPLOAD_CONFIG.PATH}/${fileDir}`);

	const browser = await initBrowser(BROWSER);
	const page = await browser.newPage();

	await page.setContent(html, {
		waitUntil: 'networkidle0',
		timeout: DEFAULT_TIMEOUT_PRINT_PDF,
	});
	await page.pdf({
		path: options.path || `${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}`,
		format: 'letter',
		printBackground: true,
		timeout: DEFAULT_TIMEOUT_PRINT_PDF,
		...options,
	});

	await page.close();

	const url = `${UPLOAD_CONFIG.FULL_URI_DOC}/${fileDir}/${fileName}`;

	return url;
}

async function initBrowser(browserKey = BROWSER) {
	if (timers[browserKey]) {
		clearTimeout(timers[browserKey]);
	}
	if (!browsers[browserKey] || _.get(browsers[browserKey], '_defaultContext._connection._closed')) {
		browsers[browserKey] = await puppeteer.launch(puppeteerOptions);
	}

	return browsers[browserKey];
}

function closeBrowser(browserKey = BROWSER, force) {
	if (!browsers[browserKey]) return;
	if (force) {
		browsers[browserKey].close();
	} else {
		timers[browserKey] = setTimeout(() => {
			if (browsers[browserKey]) {
				browsers[browserKey]
					.close()
					.then(() => {
						logger.info('closed browser -> ', browserKey);
						browsers[browserKey] = null;
					})
					.catch(e => {
						logger.info('close browser error -> ', browserKey, e);
					});
			}
		}, 4000);
	}
}

function excelToImg({ url, folderPath, fileName }) {
	// eslint-disable-next-line no-async-promise-executor
	return new Promise(async (rs, rj) => {
		try {
			await checkFolder(folderPath);

			const excelBrowser = await initBrowser(EXCEL_BROWSER);

			let page = await excelBrowser.newPage();
			await page.setViewport({
				width: 1280,
				height: 720,
				deviceScaleFactor: 1,
			});

			const timeout = 30 * 1000;

			let timer = setTimeout(() => {
				page.close();
				rj('timeout');
			}, timeout);

			page.on('response', response => {
				const uri = response.url();

				if (uri.includes('EwaInternalWebService.json')) {
					const targetUrl = `${folderPath}/${fileName || uuid()}.jpg`;

					page.screenshot({
						type: 'jpeg',
						path: targetUrl,
						fullPage: true,
					})
						.then(() => {
							rs(targetUrl);
						})
						.catch(rj)
						.finally(() => {
							page.close();
							clearTimeout(timer);
						});
				}
			});

			await page.goto(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`);
		} catch (e) {
			rj(e);
		}
	});
}

async function onMessage({ type, data, id } = {}) {
	let result;
	let error;

	try {
		if (type === CONSTANT.GENERATE_IMAGE_PATH) {
			result = await generateImagePath(data);
		}
		if (type === CONSTANT.GENERATE_PDF_PATH) {
			result = await generatePdfPath(data);
		}
		if (type === CONSTANT.GENERATE_EXCEL_TO_IMG) {
			result = await excelToImg(data);
		}
		if (type === CONSTANT.EXIT) {
			closeBrowser(BROWSER, true);
			closeBrowser(EXCEL_BROWSER, true);
		}
	} catch (e) {
		logger.error(e);
		error = e;
	} finally {
		closeBrowser(type === CONSTANT.GENERATE_EXCEL_TO_IMG ? EXCEL_BROWSER : BROWSER);
	}

	if (result || error) {
		parentPort.postMessage({ id, type, result, error });
	}
}

parentPort.on('message', onMessage);

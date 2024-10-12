const moment = require('moment');
const path = require('path');
const puppeteer = require('puppeteer');

const { UPLOAD_CONFIG } = require('../../../../config/setting');
const { logger } = require('../../../utils/logger');
const { hasExists, checkFolder } = require('../../../utils/file');

const URI = `https://cskh.capnuoccholon.com.vn/`;

async function initBrowser() {
	const userDataDir = 'puppeteer/data/worker';

	const options = {
		headless: true,
		args: [
			'--no-sandbox', //
			'--disable-web-security',
			'--disable-site-isolation-trials',
		],
		ignoreHTTPSErrors: true,
		userDataDir,
	};

	const browser = await puppeteer.launch(options);

	const page = await browser.newPage();

	await page.goto(`${URI}/page/vdl/cskh/forms/TraCuuHoSo.aspx`, {
		waitUntil: 'networkidle2',
	});

	return { browser, page };
}

async function getData(page, code, date) {
	await page.evaluate(val => {
		// eslint-disable-next-line no-undef
		document.querySelector('#ContentPlaceHolder1_txtDanhBa').value = val;
	}, code);
	await page.type('#ContentPlaceHolder1_txtDanhBa', ' ');

	await Promise.all([
		page.click('#ContentPlaceHolder1_btnTimKiem'),
		page.waitForNavigation({ waitUntil: 'networkidle0' }),
	]);

	// await page.waitForNavigation({ waitUntil: 'networkidle2' });
	// await page.waitForSelector('#ContentPlaceHolder1_grvHoaDon');

	const period = moment(date).format('M/YYYY');

	const invoiceData = await page.evaluate(() => {
		// eslint-disable-next-line no-undef
		const elems = document.querySelectorAll('#ContentPlaceHolder1_grvHoaDon tbody > tr:nth-child(2) > td');
		const rs = {};
		if (elems) {
			elems.forEach((e, i) => {
				if (i === 0) {
					rs.period = e.outerText;
				}
				if (i === 8) {
					rs.amount = e.outerText;
				}
			});
		}

		return rs;
	});

	if (invoiceData.period !== period) return;

	const invoiceId = `${code}_${moment(date).format('MM.YYYY')}`;
	const fileDir = `${moment(date).format('YY/MM')}/water-invoice`;
	const fileName = `${invoiceId}.jpg`;
	const fullPath = path.resolve(`${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}`);

	if (!(await hasExists(fullPath))) {
		await checkFolder(`${UPLOAD_CONFIG.PATH}/${fileDir}`);

		const $ = await page.$('.main-panel .row:nth-child(2) .card');

		await $.screenshot({
			type: 'jpeg',
			path: fullPath,
			captureBeyondViewport: true,
		});
	}

	return {
		invoiceId,
		amount: Number(invoiceData.amount),
		invoiceUrl: `${UPLOAD_CONFIG.FULL_URI}/${fileDir}/${fileName}`,
		code,
	};
}

async function getInvoices({ codes, date = new Date() }) {
	const invoices = [];

	if (!codes || !codes.length) return invoices;

	const { page, browser } = await initBrowser();

	await codes.asyncForEach(async code => {
		const data = await getData(page, code, date).catch(e => {
			logger.error('choLon fetch invoice', code, date, e);
		});

		if (data) {
			invoices.push(data);
		}
	});

	await browser.close();

	return invoices;
}

module.exports = {
	getInvoices,
};

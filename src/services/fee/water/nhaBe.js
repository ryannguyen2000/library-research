const moment = require('moment');
const path = require('path');
const puppeteer = require('puppeteer');

const { UPLOAD_CONFIG } = require('../../../../config/setting');
const { logger } = require('../../../utils/logger');
const { hasExists, checkFolder } = require('../../../utils/file');

const URI = `https://cskh.capnuocnhabe.vn`;

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

	await page.goto(`${URI}/TraCuu/IndexTraCuuTienNuoc`, {
		waitUntil: 'networkidle2',
	});

	page.on('dialog', dialog => {
		dialog.accept();
	});

	return { browser, page };
}

async function getData(page, code, date) {
	// await page.type("form[ng-submit='fSeachtiennuoc()'] input", code);
	await page.evaluate(val => {
		// eslint-disable-next-line no-undef
		document.querySelector("form[ng-submit='fSeachtiennuoc()'] input").value = val;
	}, code);
	await page.type("form[ng-submit='fSeachtiennuoc()'] input", ' ');

	await page.click("form[ng-submit='fSeachtiennuoc()'] button");

	const [response] = await Promise.all([
		page.waitForResponse(`${URI}/api/tracuu/SeachTienNuocKH`),
		page.waitForNetworkIdle(),
	]);

	const json = await response.json();

	const period = moment(date).format('MM/YYYY');
	const invoice = json.find(i => i.KY_THANH_TOAN === period);

	if (!invoice) return;

	const fileDir = `${moment(date).format('YY/MM')}/water-invoice`;
	const fileName = `${invoice.DHOADONID}.jpg`;
	const fullPath = path.resolve(`${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}`);

	if (!(await hasExists(fullPath))) {
		await checkFolder(`${UPLOAD_CONFIG.PATH}/${fileDir}`);

		const $ = await page.$("div[ng-controller='tracuutiennuocCtrl']");

		await $.screenshot({
			type: 'jpeg',
			path: fullPath,
			captureBeyondViewport: true,
		});
	}

	return {
		invoiceId: invoice.DHOADONID,
		amount: invoice.TONG_THANH_TOAN,
		invoiceUrl: `${UPLOAD_CONFIG.FULL_URI}/${fileDir}/${fileName}`,
		code,
	};
}

async function getInvoices({ codes, date = new Date() }) {
	const invoices = [];

	if (!codes || !codes.length) return invoices;

	const { page, browser } = await initBrowser();

	date = moment(date).add(1, 'month').toDate();

	await codes.asyncForEach(async code => {
		const data = await getData(page, code, date).catch(e => {
			logger.error('nha_be fetch invoice', code, date, e);
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

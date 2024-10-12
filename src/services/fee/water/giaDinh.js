const moment = require('moment');
const cheerio = require('cheerio');

const { generateImagePath } = require('@utils/puppeteer');
const { UPLOAD_CONFIG } = require('@config/setting');
const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const { hasExists } = require('@utils/file');

const URI = `https://www.capnuocgiadinh.vn`;

// https://www.capnuocgiadinh.vn/api/external-api/generate-bill-async?Code=12031285555&Period=3&YearPeriod=2024

function parseData(xml) {
	try {
		const $ = cheerio.load(xml, {
			xmlMode: true,
		});

		const invoiceId = $('SHDon').text();
		const amount = parseInt($('TgTTTBSo').text());

		return {
			invoiceId,
			amount,
		};
	} catch (e) {
		logger.error('gia dinh parseData', e);
	}
}

async function getInvoices({ codes, date = new Date() }) {
	const invoices = [];

	const period = date.getMonth() + 1;
	const year = date.getFullYear();

	await codes.asyncForEach(async code => {
		const uri = `${URI}/api/external-api/generate-bill-async?Code=${code}&Period=${period}&YearPeriod=${year}`;

		const data = await fetch(uri).then(res => res.json());

		const invoiceData = parseData(data.xmlData);
		if (!invoiceData || !invoiceData.amount) {
			logger.warn('gia dinh getInvoices', data);
			return;
		}

		invoiceData.code = code;

		const timeTxt = moment(date).format('YY/MM');
		const fileDir = `${timeTxt}/water-invoice`;
		const fileName = `${invoiceData.invoiceId}`;
		const filePath = `${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}.jpg`;

		if (!(await hasExists(filePath))) {
			await generateImagePath({
				html: data.htmlResult,
				// selector: '#print-page',
				fileDir,
				fileName,
			})
				.then(invoiceUrl => {
					invoiceData.invoiceUrl = invoiceUrl;
					logger.info('ben_thanh saved invoice', invoiceUrl);
				})
				.catch(e => {
					logger.error('ben_thanh download invoice', invoiceData, e);
				});
		}

		invoices.push(invoiceData);
	});

	return invoices;
}

module.exports = {
	getInvoices,
};

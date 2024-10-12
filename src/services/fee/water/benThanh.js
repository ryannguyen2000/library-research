const _ = require('lodash');
const moment = require('moment');
const cheerio = require('cheerio');

const { generateImagePath } = require('@utils/puppeteer');
const { UPLOAD_CONFIG } = require('../../../../config/setting');
const fetch = require('../../../utils/fetch');
const { logger } = require('../../../utils/logger');
const { hasExists } = require('../../../utils/file');

const URI = `https://capnuocbenthanh.com`;

function parseData(html) {
	const $ = cheerio.load(html);

	// const tableSelector = `#content > div.vf_article.cnbt_lookup > div > table:nth-child(10)`;
	const tableSelector = `.vf_article.cnbt_lookup table > tbody`;
	const table = $(`${tableSelector}`).last();

	const items = [];

	table.children(`tr`).each(function (index, element) {
		const $$ = $(element);

		const item = {};

		let isValidRow = true;

		$$.children('td').each(function (i, tdEl) {
			let period;
			const text = _.trim($(tdEl).text());

			if (i === 0) {
				period = parseInt(text);
				isValidRow = !!period;
			}
			if (!isValidRow) return;

			if (i === 0) item.period = period;
			if (i === 1) item.year = parseInt(text);
			if (i === 5) item.amount = parseInt(text.replace(/\./g, ''));
		});

		if (item.period) items.push(item);
	});

	return items;
}

async function fetchData(code, retry = 0) {
	const res = await fetch(`${URI}/tra-cuu/?code=${code}`);

	const contentType = res.headers.get('content-type');
	if (retry > 1 && (!contentType || !contentType.includes('text/html'))) {
		await Promise.delay(500);
		return fetchData(code, retry + 1);
	}

	return res.text();
}

async function getInvoices({ codes, date = new Date() }) {
	const invoices = [];

	await codes.asyncForEach(async code => {
		const data = await fetchData(code);

		const items = parseData(data);

		const filtereditems = items.filter(i => i.year === date.getFullYear() && i.period === date.getMonth() + 1);

		if (filtereditems.length) {
			await filtereditems.asyncForEach(async item => {
				const rs = {
					invoiceId: `${item.period <= 9 ? `0${item.period}` : item.period}${item.year}${code}`,
					amount: item.amount,
					code,
				};
				const timeTxt = moment(date).format('YY/MM');
				const fileDir = `${timeTxt}/water-invoice`;
				const fileName = `${rs.invoiceId}`;
				const filePath = `${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}.jpg`;

				if (!(await hasExists(filePath))) {
					await generateImagePath({
						url: `${URI}/tra-cuu/?code=${code}&type=3&key=${rs.invoiceId}`,
						selector: '#print-page',
						fileDir,
						fileName,
					})
						.then(invoiceUrl => {
							rs.invoiceUrl = invoiceUrl;
							logger.info('ben_thanh saved invoice', invoiceUrl);
						})
						.catch(e => {
							logger.error('ben_thanh download invoice', rs, e);
						});
				}

				invoices.push(rs);
			});
		}
	});

	return invoices;
}

module.exports = {
	getInvoices,
};

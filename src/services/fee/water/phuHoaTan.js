const _ = require('lodash');
const moment = require('moment');
const cheerio = require('cheerio');
// const puppeteer = require('puppeteer');

const { generateImagePath } = require('@utils/puppeteer');
const { UPLOAD_CONFIG } = require('../../../../config/setting');
const fetch = require('../../../utils/fetch');
const { logger } = require('../../../utils/logger');
const { hasExists } = require('../../../utils/file');
// const { generateImagePath } = require('@utils/puppeteer');

const URI = `https://cskh.phuwaco.com.vn`;

function parseData(html) {
	const $ = cheerio.load(html);

	// const tableSelector = `#main > div > div.box > div > div:nth-child(4) > div.table-responsive > table`;
	const tableSelector = `#main .box table tbody`;
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
				const mPeriod = moment(text, 'M/YYYY', true);
				isValidRow = mPeriod.isValid();
				period = mPeriod.format('YYYY-MM');
			}
			if (!isValidRow) return;

			if (i === 0) item.period = period;
			if (i === 10) item.amount = parseInt(text.replace(/\./g, ''));
			// if (i === 12) {
			// 	const childs = $(tdEl).children('a');
			// 	const onclickTxt = _.get(childs, '[0].attribs.onclick');

			// 	if (onclickTxt) {
			// 		const v4 = new RegExp(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
			// 		[item.invoiceId] = onclickTxt.match(v4) || [];
			// 	}
			// }
		});

		if (item.period) items.push(item);
	});

	return items;
}

async function getInvoices({ codes, date = new Date() }) {
	const invoices = [];

	await codes.asyncForEach(async code => {
		const data = await fetch(`${URI}/tra-cuu-thong-tin/hoa-don?danhBa=${code}`).then(res => res.text());
		const items = parseData(data);

		console.log(items);

		const filtereditems = items.filter(i => i.period === moment(date).format('YYYY-MM'));

		if (filtereditems.length) {
			await filtereditems.asyncForEach(async item => {
				const rs = {
					...item,
					invoiceId: `${code}_${item.period}`,
					code,
				};

				const timeTxt = moment(date).format('YY/MM');
				const fileDir = `${timeTxt}/water-invoice`;
				const fileName = `${rs.invoiceId}`;
				const filePath = `${UPLOAD_CONFIG.PATH}/${fileDir}/${fileName}.pdf`;

				if (!(await hasExists(filePath))) {
					// const base64 = await fetch(
					// 	`${URI}/tra-cuu-thong-tin/tai-hoa-don-dien-tu/pdf/${rs.invoiceId}/false`
					// ).then(res => res.text());

					// await saveBase64File(base64, `${UPLOAD_CONFIG.PATH}/${fileDir}`, `${fileName}.pdf`)
					// 	.then(() => {
					// 		rs.invoiceUrl = `${UPLOAD_CONFIG.FULL_URI}/${fileDir}/${fileName}.pdf`;
					// 		logger.info('phuHoaTan saved invoice', rs.invoiceUrl);
					// 	})
					// 	.catch(e => {
					// 		logger.error('phuHoaTan download invoice', rs, e);
					// 	});

					await generateImagePath({
						url: `${URI}/tra-cuu-thong-tin/hoa-don?danhBa=${code}`,
						fileDir,
						fileName,
						selector: '.box-content',
						viewPort: {
							height: 2000,
							width: 1200,
						},
					})
						.then(invoiceUrlJpg => {
							rs.invoiceUrl = invoiceUrlJpg;

							logger.info('phuHoaTan saved invoice img', invoiceUrlJpg);
						})
						.catch(e => {
							logger.error('phuHoaTan download invoice img', rs, e);
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

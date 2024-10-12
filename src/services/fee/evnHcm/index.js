const _ = require('lodash');
const moment = require('moment');

const { UPLOAD_CONFIG } = require('../../../../config/setting');
const fetch = require('../../../utils/fetch');
const { logger } = require('../../../utils/logger');
const { setCookie, generateCookie } = require('../../../utils/cookie');
const { downloadContentFromUrl, hasExists } = require('../../../utils/file');

const URI = `https://cskh.evnhcmc.vn`;

async function getInvoices({ username, password, codes, date = new Date() }) {
	let cookie = await fetch(URI).then(res => generateCookie(res.headers.raw()['set-cookie']));

	let newCookie = await fetch(`${URI}/Dangnhap/checkLG`, {
		method: 'POST',
		headers: {
			Cookie: cookie,
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
		},
		body: `u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}&remember=1&token=`,
	}).then(res => generateCookie(res.headers.raw()['set-cookie']));

	cookie = setCookie(cookie, newCookie);

	const invoices = [];

	logger.info('getInvoices', username, password, codes);

	await codes.asyncForEach(async code => {
		const data = await fetch(`${URI}/Tracuu/ajax_ds_hoadon`, {
			method: 'POST',
			headers: {
				Cookie: cookie,
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			},
			body: `input_makh=${code}&input_thang=${new Date(date).getMonth() + 1}&input_nam=${new Date(
				date
			).getFullYear()}&token=&page=1`,
		}).then(res => res.json());

		const invoice = _.get(data, 'data.ds_hoadon[0]');

		if (!invoice) {
			logger.error('getInvoices not found invoice', code, data);
			return;
		}

		const timeTxt = moment(date).format('YY/MM');
		const folder = `${timeTxt}/evn-invoice/${invoice.ID_HOADON}_gb.pdf`;
		const filePath = `${UPLOAD_CONFIG.PATH}/${folder}`;
		let invoiceUrl;

		if (!(await hasExists(filePath))) {
			await downloadContentFromUrl({
				url: `${URI}/Tracuu/ajax_tai_giaybao`,
				filePath,
				options: {
					method: 'POST',
					headers: {
						Cookie: cookie,
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: `idhd=${invoice.ID_HOADON}&makh=${code}`,
				},
			})
				.then(() => {
					invoiceUrl = `${UPLOAD_CONFIG.FULL_URI}/${folder}`;
					logger.info('envHCM saved invoice', invoiceUrl);
				})
				.catch(e => {
					logger.error('envHCM download invoice', invoice, e);
				});
		} else {
			invoiceUrl = `${UPLOAD_CONFIG.FULL_URI}/${folder}`;
		}

		invoices.push({
			invoiceId: invoice.ID_HOADON,
			amount: invoice.TONG_TIEN_INT,
			isPaid: !invoice.TRANGTHAI,
			code,
			invoiceUrl,
		});
	});

	return _.compact(invoices);
}

// getInvoices({
// 	username: '0938878424',
// 	password: 'Cozrum2024#',
// 	codes: ['PE01000008094', 'PE03000197739'],
// 	date: new Date('2024-03-01'),
// }).catch(e => {
// 	console.error(e);
// });

module.exports = {
	getInvoices,
};

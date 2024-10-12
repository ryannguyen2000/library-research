const moment = require('moment');
const { v4: uuid } = require('uuid');
const _ = require('lodash');
const path = require('path');
const XLSX = require('xlsx');

const { UPLOAD_CONFIG } = require('@config/setting');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { ThirdPartyPayment, OTAs, PayoutStates, PayoutType } = require('@utils/const');
const { createPayoutExport, updatePayoutExport } = require('./payoutGroup');

async function importPayoutGroup(user, body, file) {
	if (!file) {
		throw new ThrowReturn('Không tìm thấy tệp tin nào!');
	}
	if (
		file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
		file.mimetype !== 'application/vnd.ms-excel' &&
		file.mimetype !== 'text/csv'
	) {
		throw new ThrowReturn('Tệp không đúng định dạng (.xlsx, .xls, .csv)!');
	}

	const lowerBank = _.toLower(body.bank);
	const xlsx = XLSX.read(file.data);
	const data = getData(lowerBank, xlsx);

	if (!data.data || !data.data.length) {
		throw new ThrowReturn('Không tìm thấy dữ liệu nào!');
	}

	const filters = {
		inReport: false,
		state: [PayoutStates.PROCESSING, PayoutStates.TRANSFERRED],
	};

	if (data.fromProduct) {
		_.assign(filters, {
			payoutType: PayoutType.RESERVATION,
			productId: { $in: data.data },
			collectorCustomName: lowerBank,
		});
	}
	if (data.fromBooking) {
		const bookings = await models.Booking.find({
			otaName: lowerBank,
			otaBookingId: { $in: data.data },
		}).select('_id');

		_.assign(filters, {
			payoutType: PayoutType.RESERVATION,
			bookingId: { $in: _.map(bookings, '_id') },
		});
	}
	if (data.fromSMS) {
		const smsMessages = await models.SMSMessage.find({
			phone: body.bank,
			hasPayout: true,
			'data.body': {
				$in: data.data.map(item => new RegExp(_.escapeRegExp(item), 'i')),
			},
		}).select('payoutId');

		_.assign(filters, {
			_id: { $in: _.flatten(_.map(smsMessages, 'payoutId')) },
		});
	}
	if (data.fromTransaction) {
		const transactions = await models.BankTransaction.find({ docNo: { $in: data.data } }).select('smsId');
		const smsMessages = await models.SMSMessage.find({
			_id: { $in: _.compact(_.map(transactions, 'smsId')) },
			hasPayout: true,
		}).select('payoutId');

		_.assign(filters, {
			_id: { $in: _.flatten(_.map(smsMessages, 'payoutId')) },
		});
	}

	if (data.fromDescription) {
		_.assign(filters, {
			payoutType: PayoutType.RESERVATION,
			description: { $in: data.data.map(item => new RegExp(_.escapeRegExp(item.body))) },
		});
	}

	const payouts = await models.Payout.find(filters);
	if (!payouts.length) {
		throw new ThrowReturn('Không tìm thấy dữ liệu nào, hãy đảm bảo các thanh toán đã được chọn sms!');
	}

	if (data.fromDescription && data.data.some(item => item.transactionFeeRate)) {
		await payouts.asyncMap(payout => {
			const matchItem = data.data.find(item => payout.description.match(new RegExp(_.escapeRegExp(item.body))));
			if (matchItem && matchItem.transactionFeeRate) {
				payout.transactionFee = _.round(matchItem.transactionFeeRate * payout.currencyAmount.exchangedAmount);
				return payout.save();
			}
		});
	}

	body.payouts = _.map(payouts, '_id');
	body.name = body.name || file.name;

	const payoutExport = body._id
		? await updatePayoutExport(body._id, body, user)
		: await createPayoutExport(body, user);

	const today = moment();

	const fileName = `${uuid()}${path.extname(file.name)}`;
	const filePath = `${today.format('YY/MM/DD')}/payout/${fileName}`;
	await file.mv(`${UPLOAD_CONFIG.PATH}/${filePath}`);

	payoutExport.attachments = payoutExport.attachments || [];
	payoutExport.attachments.push(`${UPLOAD_CONFIG.FULL_URI}/${filePath}`);
	await payoutExport.save();

	return payoutExport;
}

function getData(bank, xlsx) {
	if (bank === 'bidv') return getBIDVData(xlsx);
	if (bank === 'vietcombank') return getVietcombankData(xlsx);
	if (bank === 'vietinbank') return getVietinbankData(xlsx);
	if (bank === 'techcombank') return getTechcomData(xlsx);
	if (bank === 'mbbank') return getMBBankData(xlsx);
	if (bank === ThirdPartyPayment.APPOTAPAY) return getAppotapayData(xlsx);
	if (bank === OTAs.Expedia) return getExpedia(xlsx);
	if (bank === OTAs.Traveloka) return getTraveloka(xlsx);
}

function parseNumber(text) {
	if (_.isNumber(text)) return text;
	return (text && Number(text.replace(/,/g, ''))) || 0;
}

function getMBBankData(xlsx) {
	const sheet = xlsx.Sheets[xlsx.Props.SheetNames[0]];
	const data = [];
	let startRow = 9;

	while (true) {
		let body = _.get(sheet[`F${startRow}`], 'v') || '';
		body = _.head(body.split('\\'));

		if (!body) break;

		data.push(body);

		startRow++;
	}

	return { data, fromTransaction: true };
}

function getTechcomData(xlsx) {
	const sheet = xlsx.Sheets[xlsx.Props.SheetNames[0]];
	const data = [];
	let startRow = 18;

	while (true) {
		let body = _.get(sheet[`D${startRow}`], 'v') || '';
		body = body
			.split(' ')
			.filter(s => s)
			.join(' ')
			.replace(/-/g, '_');

		const date = _.get(sheet[`A${startRow}`], 'v');

		if (!body && !date) break;

		if (body && date) {
			data.push(body);
		}

		startRow++;
	}

	return { data, fromSMS: true };
}

function getBIDVData(xlsx) {
	const sheet = xlsx.Sheets[xlsx.Props.SheetNames[0]];
	const data = [];

	let startRow = 14;
	while (true) {
		const body = _.get(sheet[`G${startRow}`], 'v');
		const amount = parseNumber(_.get(sheet[`E${startRow}`], 'v'));

		if (!body && !amount) break;

		if (body && amount) {
			data.push(body);
		}

		startRow++;
	}

	return { data, fromSMS: true };
}

function getVietcombankData(xlsx) {
	const sheetName = xlsx.Props.SheetNames[0];
	const sheet = xlsx.Sheets[sheetName];
	const data = [];

	if (sheetName.endsWith('GDTHECOZRUM')) {
		let startRow = 4;

		while (true) {
			const body = _.get(sheet[`P${startRow}`], 'v');
			const amount = parseNumber(_.get(sheet[`D${startRow}`], 'v'));

			if (!body && !amount) break;

			if (body && amount) {
				data.push({ body, amount, transactionFeeRate: _.get(sheet[`G${startRow}`], 'v') });
			}

			startRow++;
		}

		return { data, fromDescription: true };
	}

	const maxBody = 75;
	let startRow = 14;

	while (true) {
		const body = _.get(sheet[`G${startRow}`], 'v');
		const amount = parseNumber(_.get(sheet[`E${startRow}`], 'v'));

		if (!body && !amount) break;

		if (body && amount) {
			data.push(body.substring(0, maxBody));
		}

		startRow++;
	}

	return { data, fromSMS: true };
}

function getVietinbankData(xlsx) {
	const sheet = xlsx.Sheets[xlsx.Props.SheetNames[0]];
	const data = [];

	let startRow = 26;
	while (true) {
		const body = _.get(sheet[`C${startRow}`], 'v');
		const amount = parseNumber(_.get(sheet[`E${startRow}`], 'v'));

		if (!body && !amount) break;

		if (body && amount) {
			data.push(body.slice(27));
		}

		startRow++;
	}

	return { data, fromSMS: true };
}

function getAppotapayData(xlsx) {
	const sheet = xlsx.Sheets.data;
	const data = [];
	let startRow = 2;

	while (true) {
		const body = _.get(sheet[`A${startRow}`], 'v');
		const amount = _.get(sheet[`G${startRow}`], 'v');

		if (!body && !amount) break;
		if (body && amount) {
			data.push(_.toString(body));
		}

		startRow++;
	}

	return { data, fromProduct: true };
}

function getExpedia(xlsx) {
	const sheet = xlsx.Sheets[xlsx.SheetNames[0]];
	const data = [];
	let startRow = 2;
	let missingRow = 0;

	while (true) {
		const body = _.get(sheet[`A${startRow}`], 'v');
		if (body) missingRow = 0;
		else missingRow++;

		if (missingRow > 4) break;
		if (body) data.push(body);

		startRow++;
	}

	return { data, fromBooking: true };
}

function getTraveloka(xlsx) {
	const sheet = xlsx.Sheets[xlsx.SheetNames[0]];
	const data = [];
	let startRow = 2;
	let missingRow = 0;

	while (true) {
		const body = _.trim(_.get(sheet[`B${startRow}`], 'v'));
		if (body) missingRow = 0;
		else missingRow++;
		if (missingRow > 4) break;
		if (body) data.push(body);

		startRow++;
	}

	return { data, fromBooking: true };
}

module.exports = {
	importPayoutGroup,
};

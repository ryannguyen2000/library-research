const moment = require('moment');
const _ = require('lodash');
const fs = require('fs');
const ExcelJS = require('exceljs');

const { PayoutType, PayoutStates } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');

async function recocileFile({ source, paymentCollector, resource }) {
	const filePath = resource.getRelativePath();
	const fileData = await fs.promises.readFile(filePath);

	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.load(fileData);

	const rowData = [];
	let startRow = 2;
	const worksheet = workbook.getWorksheet('data');

	while (true) {
		const row = worksheet.getRow(startRow);
		const currentRowData = [];
		row.eachCell(cell => {
			currentRowData.push(typeof cell.value === 'string' ? cell.value.trim() : cell.value);
		});

		if (!currentRowData[0]) break;

		rowData.push(currentRowData);
		startRow++;
	}

	const payouts = await models.Payout.find({
		otaId: _.map(rowData, 1),
	})
		.select('-logs')
		.lean();

	const result = { done: false };

	if (!payouts.length) {
		logger.warn('processAppotapay not found payouts', rowData);
		return result;
	}

	let report = await models.PayoutExport.findOne({
		payoutType: PayoutType.RESERVATION,
		state: { $ne: PayoutStates.DELETED },
		payouts: { $in: _.map(payouts, '_id') },
		createdBy: null,
	});

	const maxDate = _.maxBy(rowData, 15)[15];

	if (!report) {
		report = await models.PayoutExport.createExport({
			payoutType: PayoutType.RESERVATION,
			name: `${_.upperFirst(source)} ngày ${moment(payouts[0].createdAt).format('DD/MM/YYYY')}`,
			payouts: _.map(payouts, '_id'),
		});
	}

	report.source = source;

	if (!report.confirmationAttachments.includes(resource.url)) {
		report.confirmationAttachments.push(resource.url);
	}
	if (!report.attachments.includes(resource.url)) {
		report.attachments.push(resource.url);
	}

	if (!report.confirmedDate) {
		const amount = report.currencyAmount.VND - report.totalTransactionFee;

		const transFilter = {
			collector: paymentCollector,
			startTime: moment(maxDate).startOf('day').toDate(),
			amount,
		};

		const transactions = await models.BankTransaction.findTransactonsFromCollector(transFilter);

		if (transactions && transactions.length) {
			const { transactionIds } = transactions[0];
			_.assign(result, transactions[0]);
			report.transactionIds.push(...transactionIds);

			await report.confirm();
		}
	}
	if (!report.confirmedDate) {
		await report.save();
	}

	result.done = true;
	result.reports = [report];

	return result;
}

module.exports = {
	recocileFile,
};

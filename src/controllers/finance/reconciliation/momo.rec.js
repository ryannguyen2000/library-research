const moment = require('moment');
const _ = require('lodash');
// const fs = require('fs');
// const xlsx = require('xlsx');
// const unzipper = require('unzipper');

const { PayoutType, PayoutStates, ThirdPartyPayment, PayoutSources } = require('@utils/const');
// const { logger } = require('@utils/logger');
const models = require('@models');

// async function unZipAndParseExcel(filePath) {
// 	const zip = fs.createReadStream(filePath).pipe(unzipper.Parse({ forceStream: true }));

// 	let bufferData;

// 	for await (const entry of zip) {
// 		const fileName = entry.path;

// 		if (fileName.endsWith('_DATA.xlsx')) {
// 			bufferData = await entry.buffer();
// 		} else {
// 			entry.autodrain();
// 		}
// 	}

// 	return bufferData;
// }

// async function recocileFile({ source, paymentCollector, resource }) {
// 	const filePath = resource.getRelativePath();
// 	const fileData = await unZipAndParseExcel(filePath);
// 	const xlsxBank = xlsx.read(fileData);

// 	const dataSheet = xlsxBank.Sheets.data;
// 	const rowData = [];

// 	const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
// 	let currentRow = 8;

// 	while (true) {
// 		if (!dataSheet[`A${currentRow}`]) {
// 			break;
// 		}

// 		const arrData = [];
// 		// eslint-disable-next-line no-loop-func
// 		cols.forEach(col => {
// 			arrData.push(_.get(dataSheet[`${col}${currentRow}`], 'v'));
// 		});

// 		rowData.push(arrData);
// 		currentRow++;
// 	}

// 	const payouts = await models.Payout.find({
// 		otaId: _.map(rowData, 10),
// 		collectorCustomName: ThirdPartyPayment.MOMO,
// 	})
// 		.select('-logs')
// 		.lean();

// 	const result = { done: false };

// 	if (!payouts.length) {
// 		logger.warn('recocileFile not found payouts', source, rowData);
// 		return result;
// 	}

// 	let report = await models.PayoutExport.findOne({
// 		payoutType: PayoutType.RESERVATION,
// 		state: { $ne: PayoutStates.DELETED },
// 		payouts: { $in: _.map(payouts, '_id') },
// 	});

// 	if (!report) {
// 		report = await models.PayoutExport.createExport({
// 			payoutType: PayoutType.RESERVATION,
// 			name: `${_.upperFirst(source)} tháng ${moment(payouts[0].createdAt).format('MM/YYYY')}`,
// 			payouts: _.map(payouts, '_id'),
// 			source,
// 		});
// 	}

// 	if (!report.confirmedDate) {
// 		const amount = report.currencyAmount.VND - report.totalTransactionFee;

// 		const transactions = await models.BankTransaction.findTransactonsFromCollector({
// 			collector: paymentCollector,
// 			startTime: moment(payouts[0].createdAt).add(1, 'month').startOf('month').toDate(),
// 			amount,
// 		});

// 		if (transactions && transactions.length) {
// 			const { transactionIds } = transactions[0];

// 			_.assign(result, transactions[0]);

// 			report.transactionIds.push(...transactionIds);
// 			report.source = source;
// 			report.confirmationAttachments.push(resource.url);
// 			report.attachments.push(resource.url);

// 			await report.confirm();
// 		}
// 	}

// 	result.done = !!report.confirmedDate;

// 	return {
// 		done: false,
// 	};
// }

async function queryTransactions(date) {
	const stats = await models.Payout.aggregate([
		{
			$match: {
				// payoutType: PayoutType.RESERVATION,
				source: PayoutSources.ONLINE_WALLET,
				createdAt: {
					$gte: moment(date).startOf('month').toDate(),
					$lte: moment(date).endOf('month').toDate(),
				},
				collectorCustomName: ThirdPartyPayment.MOMO,
			},
		},
		{
			$group: {
				_id: null,
				totalTransactionFee: { $sum: '$transactionFee' },
				totalAmount: { $sum: '$currencyAmount.exchangedAmount' },
				total: { $sum: 1 },
				hasReports: { $addToSet: '$inReport' },
				payoutIds: { $push: '$_id' },
			},
		},
	]);

	return stats && stats[0];
}

async function createAutoReports({ date } = {}) {
	if (date && !moment().startOf('month').isSame(date, 'day')) return;

	date = date || moment().startOf('month').toDate();
	const recociDate = moment(date).subtract(1, 'month');

	const currentPeriod = await queryTransactions(recociDate);
	if (!currentPeriod) return;

	let report;

	if (currentPeriod.hasReports.includes(true)) {
		report = await models.PayoutExport.findOne({
			payoutType: PayoutType.RESERVATION,
			payouts: { $in: currentPeriod.payoutIds },
			state: { $ne: PayoutStates.DELETED },
			createdBy: null,
		});
	}

	const source = ThirdPartyPayment.MOMO;

	if (!report) {
		const prevPeriod = await queryTransactions(moment(recociDate).subtract(1, 'month'));

		report = await models.PayoutExport.createExport({
			payoutType: PayoutType.RESERVATION,
			name: `${_.upperFirst(source)} tháng ${moment(recociDate).format('MM/YYYY')}`,
			payouts: currentPeriod.payoutIds,
			payoutFees: _.get(prevPeriod, 'payoutIds'),
			source,
		});
	}

	const paymentCollector = await models.PaymentCollector.findOne({
		tag: source,
		bankingSearchRegex: { $ne: null },
	});
	if (!paymentCollector) return report;

	const realAmount = report.currencyAmount.VND - report.totalTransactionFee;

	const transactions = await models.BankTransaction.findTransactonsFromCollector({
		collector: paymentCollector,
		startTime: moment(date).startOf('month').toDate(),
		amount: realAmount,
	});
	if (transactions.length) {
		const { transactionIds } = transactions[0];
		report.transactionIds.push(...transactionIds);

		await report.confirm();
	}
}

module.exports = {
	// recocileFile,
	createAutoReports,
};

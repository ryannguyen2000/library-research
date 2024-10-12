const _ = require('lodash');
const moment = require('moment');
const xlsx = require('xlsx');

const { TransactionStatus, TransactionTypes, BANK_ACCOUNT } = require('@utils/const');

const models = require('@models');

async function getTransactions(user, query) {
	const accountFilter = {
		transType: TransactionTypes.DEBIT,
		type: BANK_ACCOUNT.PRIVATE,
		groupIds: { $in: user.groupIds },
	};
	if (query.accountId) {
		accountFilter._id = query.accountId;
	}

	const accounts = await models.BankAccount.find(accountFilter).select('_id').lean();

	const transactionFilter = {
		accountId: { $in: _.map(accounts, '_id') },
		isFee: true,
		status: TransactionStatus.SUCCESS,
	};
	if (query.from) {
		_.set(transactionFilter, ['tranTime', '$gte'], moment(query.from).startOf('day').toDate());
	}
	if (query.to) {
		_.set(transactionFilter, ['tranTime', '$lte'], moment(query.to).endOf('day').toDate());
	}

	const transactions = await models.BankTransaction.find(transactionFilter)
		.sort({ tranTime: -1 })
		.skip(query.start)
		.limit(query.limit)
		.lean();

	const total = await models.BankTransaction.countDocuments(transactionFilter);

	return {
		transactions,
		total,
	};
}

async function exportTransactions(user, query) {
	const accountFilter = {
		transType: TransactionTypes.DEBIT,
		type: BANK_ACCOUNT.PRIVATE,
		groupIds: { $in: user.groupIds },
	};
	if (query.accountId) {
		accountFilter._id = query.accountId;
	}

	const accounts = await models.BankAccount.find(accountFilter).select('_id').lean();

	const from = moment(query.from).startOf('day');
	const to = moment(query.to).endOf('day');

	const transactionFilter = {
		accountId: { $in: _.map(accounts, '_id') },
		isFee: true,
		status: TransactionStatus.SUCCESS,
		tranTime: {
			$gte: from.toDate(),
			$lte: to.toDate(),
		},
	};

	const transactions = await models.BankTransaction.find(transactionFilter)
		.sort({ tranTime: 1 })
		.select('meta docNo tranTime')
		.lean();

	const wb = xlsx.utils.book_new();

	const wsCols = ['STT', 'Mã giao dịch', 'FT', 'Số tiền', 'thời gian'];

	const wsData = transactions.map((transaction, index) => {
		return [
			index + 1,
			transaction.meta.transactionId,
			transaction.docNo,
			Math.abs(transaction.meta.amount),
			new Date(transaction.tranTime),
		];
	});

	const ws = xlsx.utils.aoa_to_sheet([wsCols, ...wsData]);
	xlsx.utils.book_append_sheet(wb, ws, 'Chứng từ thu tiền');

	const fileName = `mbbank_transactions_${from.format('Y-MM-DD')}_${to.format('Y-MM-DD')}.xlsx`;

	const fileData = await xlsx.write(wb, { type: 'buffer' });

	return {
		fileData,
		fileName,
		fileType: 'application/vnd.ms-excel',
	};
}

module.exports = {
	getTransactions,
	exportTransactions,
};

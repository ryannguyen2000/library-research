const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { TransactionStatus, TransactionTypes, SYS_BANK_ACCOUNT_TYPE } = require('@utils/const');

const models = require('@models');
const MBBankService = require('@services/bank/MBBank');
const { getReconcileData, sendReconcileData } = require('@services/bank/MBBank/reconciliation');

async function checkPayTransactionsResult({ transactionIds, from, to }) {
	from = from || moment().startOf('day').toDate();

	const filter = {
		status: TransactionStatus.PROCESSING,
		transType: TransactionTypes.DEBIT,
		createdAt: { $gte: from },
	};

	if (to) {
		filter.createdAt = { $lte: new Date(to) };
	}
	if (transactionIds) {
		filter._id = transactionIds;
	}

	const transactions = await models.BankTransaction.find(filter);
	if (!transactions.length) return [];

	const serviceAccount = await models.BankServiceAccount.findOne({
		active: true,
		bankCode: transactions[0].bankCode,
		accountType: SYS_BANK_ACCOUNT_TYPE.OUTBOUND_PAY,
	});
	if (!serviceAccount) {
		throw new ThrowReturn('Không tìm thấy tài khoản kết nối API!');
	}

	return transactions.asyncMap(async transaction => {
		try {
			const transResult = await MBBankService.checkTransaction({
				serviceAccount,
				transaction,
			});

			return {
				_id: transaction._id,
				...transResult,
			};
		} catch (e) {
			return {
				_id: transaction._id,
				error: e,
			};
		}
	});
}

async function reconcile({ date } = {}) {
	const serviceAccount = await models.BankServiceAccount.findOne({
		active: true,
		accountType: SYS_BANK_ACCOUNT_TYPE.OUTBOUND_PAY,
	});
	if (!serviceAccount) {
		throw new ThrowReturn('Không tìm thấy tài khoản kết nối API!');
	}

	date = date || moment().add(-1, 'day').toDate();
	const bankTrans = await getReconcileData({
		serviceAccount,
		date,
	});
	if (!bankTrans.length) {
		return;
	}

	const accountNos = _.uniq(_.map(bankTrans, 'debitAccountNo'));

	const localTrans = await models.BankTransaction.find({
		transType: TransactionTypes.DEBIT,
		status: TransactionStatus.SUCCESS,
		accountNo: { $in: accountNos },
		tranTime: {
			$gte: moment(date).startOf('day').toDate(),
			$lte: moment(date).endOf('day').toDate(),
		},
	}).lean();

	const localTransObj = _.keyBy(localTrans, 'meta.transactionId');
	const bankTransObj = _.keyBy(bankTrans, 'transactionId');

	const diffTransactions = [];
	const matchTransactions = [];
	const missingTransactions = [];

	bankTrans.forEach(bankTran => {
		const localTran = localTransObj[bankTran.transactionId];
		if (!localTran) {
			diffTransactions.push({
				bankTransaction: bankTran,
				diffKey: 'NOT_FOUND_LOCAL',
			});
		} else if (Math.abs(localTran.meta.amount) !== bankTran.amount) {
			diffTransactions.push({
				bankTransaction: bankTran,
				localTransaction: localTran,
				diffKey: 'AMOUNT',
			});
		} else if (!moment(localTran.tranTime).isSame(bankTran.time, 'day')) {
			diffTransactions.push({
				bankTransaction: bankTran,
				localTransaction: localTran,
				diffKey: 'TIME',
			});
		} else {
			matchTransactions.push({
				bankTransaction: bankTran,
				localTransaction: localTran,
			});
		}
	});

	localTrans.forEach(localTran => {
		const bankTran = bankTransObj[localTran.meta.transactionId];
		if (!bankTran) {
			missingTransactions.push(localTran);
		}
	});

	await sendReconcileData({
		serviceAccount,
		date,
		diffTransactions,
		missingTransactions,
		matchTransactions,
	});
}

module.exports = {
	checkPayTransactionsResult,
	reconcile,
};

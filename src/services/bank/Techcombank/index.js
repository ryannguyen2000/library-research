const moment = require('moment');
const _ = require('lodash');
const { Worker } = require('worker_threads');
const path = require('path');
const { v4: uuid } = require('uuid');

const ThrowReturn = require('@core/throwreturn');
const { TransactionStatus } = require('@utils/const');
const { logger } = require('@utils/logger');
const { TransactionLock } = require('@utils/lock');
const { ACTIONS } = require('./const');

const workers = {};
const queues = {};

function runWorker({ action, payload }) {
	let worker = workers[payload.username];

	if (!queues[payload.username]) queues[payload.username] = new Map();
	let queue = queues[payload.username];

	if (!worker) {
		workers[payload.username] = new Worker(path.join(__dirname, `./worker.js`));

		worker = workers[payload.username];

		worker.on('error', err => {
			logger.error('Techcombank worker', err);

			queue.forEach(v => {
				v.reject(err);
			});
			queue.clear();

			worker.terminate();

			delete workers[payload.username];
		});

		worker.on('message', message => {
			const request = queue.get(message.id);

			if (request) {
				if (message.error) {
					request.reject(new ThrowReturn(_.toString(message.error)));
				} else {
					request.resolve(message.result);
				}

				queue.delete(message.id);
			}
		});
	}

	return new Promise((resolve, reject) => {
		const id = uuid();

		queue.set(id, { resolve, reject });

		worker.postMessage({ id, action, payload });
	});
}

async function getTransactions(configs, query) {
	if (global.isDev) {
		return [];
	}

	const key = `${configs[0].shortName}_${configs[0].username}`;

	if (TransactionLock.isBusy(key)) {
		return [];
	}

	return TransactionLock.acquire(key, async () => {
		query = query || {};
		const from = (query.from ? moment(query.from) : moment().add(-5, 'day')).format('Y-MM-DD');
		const to = moment(query.to || undefined).format('Y-MM-DD');

		const transactions = await runWorker({
			action: ACTIONS.FETCH_TRANSACTIONS,
			payload: {
				username: configs[0].username,
				password: configs[0].decryptedPassword || configs[0].password,
				from,
				to,
				accountNos: _.map(configs, c => c.accountNos[0]),
				accountIds: _.map(configs, c => c.configs.accountId),
			},
		});

		return _.flattenDeep(transactions);
	});
}

function getTransactionDoc(accounts, transaction) {
	const account = accounts.find(c => c.configs.accountId === transaction.arrangementId) || accounts[0];

	return {
		_id: transaction.id,
		accountId: account._id,
		accountNo: account.accountNos[0],
		bankName: account.shortName,
		data: transaction,
		status: TransactionStatus.SUCCESS,
	};
}

function getDate(transaction) {
	return transaction.creationTime
		? new Date(transaction.creationTime)
		: transaction.bookingDate
		? moment(transaction.bookingDate).hour(new Date().getHours()).minute(new Date().getMinutes()).toDate()
		: new Date();
}

function getMeta(transaction) {
	const amount = Number(transaction.transactionAmountCurrency.amount);

	return {
		amount: amount && transaction.creditDebitIndicator === 'DBIT' ? -amount : amount,
		balance: Number(transaction.runningBalance),
		cardNumber: transaction.counterPartyAccountNumber,
		date: moment(getDate(transaction)).format('Y-MM-DD'),
		transactionFee: Number(_.get(transaction.additions, 'transactionFee')),
	};
}

function getFields(transaction) {
	return {
		tranTime: getDate(transaction),
		docNo: transaction.id,
	};
}

function formatMoney(value) {
	return value !== null && value !== undefined ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
}

function getSMSText(doc) {
	const arr = [
		`TK ${doc.accountNo}`,
		`So tien GD:${doc.meta.amount >= 0 ? '+' : '-'}${formatMoney(doc.meta.amount)}`,
		`So du:${formatMoney(doc.meta.balance)}`,
		`${doc.data.description}`,
	];
	return arr.join(' ');
}

async function makeTranserRequest(data) {
	if (global.isDev) return;

	const res = await runWorker({
		action: ACTIONS.MAKE_TRANSFER_REQUEST,
		payload: data,
	});

	return res;
}

async function makeBulkTranserRequest(data) {
	if (global.isDev) return;

	const res = await runWorker({
		action: ACTIONS.MAKE_BULK_TRANSFER_REQUEST,
		payload: data,
	});

	return res;
}

async function cancelTranserRequest(data) {
	if (global.isDev) return;

	const res = await runWorker({
		action: ACTIONS.CANCEL_TRANSFER_REQUEST,
		payload: data,
	});

	return res;
}

module.exports = {
	getTransactions,
	getTransactionDoc,
	getMeta,
	getFields,
	getSMSText,
	makeTranserRequest,
	makeBulkTranserRequest,
	cancelTranserRequest,
	requiredSameTransTypeForBulkPayments: true,
};

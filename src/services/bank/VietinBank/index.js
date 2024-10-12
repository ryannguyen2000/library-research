const crypto = require('crypto');
const moment = require('moment');
const _ = require('lodash');
const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const { TransactionLock } = require('@utils/lock');
const { TransactionStatus } = require('@utils/const');

const PAGE_SIZE = 100;
const MAX_PAGE = 10;
const SUCCESS_CODE = '1';

function getRequestId() {
	return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function encrypt(string, publicKey) {
	publicKey = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;
	const ciphertext = crypto.publicEncrypt(
		{
			key: publicKey,
			padding: crypto.constants.RSA_PKCS1_PADDING,
		},
		Buffer.from(string || '', 'utf8')
	);

	return ciphertext.toString('base64');
}

async function login(config) {
	const requestId = getRequestId();
	const username = encrypt(config.username, config.configs.publicKey);
	const password = encrypt(config.decryptedPassword || config.password, config.configs.publicKey);

	const data = await fetch('https://efast.vietinbank.vn/api/v1/account/login', {
		headers: {
			Origin: 'https://efast.vietinbank.vn',
			Referer: 'https://efast.vietinbank.vn/login',
			'Content-Type': 'application/json',
		},
		method: 'POST',
		body: JSON.stringify({
			requestId,
			language: 'vi',
			version: '1.0',
			username,
			channel: 'eFAST',
			newCore: 'Y',
			password,
			cifno: false,
		}),
	}).then(res => res.json());

	if (data.status.code === SUCCESS_CODE) {
		config.credentials = data;
		await config.save();
	} else {
		throw new Error(JSON.stringify(data));
	}
}

async function checkAuth(config) {
	const requestId = getRequestId();
	const username = encrypt(config.username, config.configs.publicKey);
	const cifno = encrypt(config.credentials.cifNo, config.configs.publicKey);

	const data = await fetch('https://efast.vietinbank.vn/api/v1/account/getUserInfo', {
		headers: {
			Origin: 'https://efast.vietinbank.vn',
			Referer: 'https://efast.vietinbank.vn/',
			'Content-Type': 'application/json',
		},
		method: 'POST',
		body: JSON.stringify({
			requestId,
			language: 'vi',
			version: '1.0',
			username,
			channel: 'eFAST',
			newCore: 'Y',
			cifno,
			roleId: '7',
			sessionId: config.credentials.sessionId,
		}),
	}).then(res => res.json());

	if (data.status.code === SUCCESS_CODE) return true;
	if (data.status.code === '-1') {
		await login(config);
	}
	return false;
}

async function getTransactionsByAccount(config, query) {
	const data = await fetch('https://efast.vietinbank.vn/api/v1/account/history', {
		headers: {
			Origin: 'https://efast.vietinbank.vn',
			Referer: 'https://efast.vietinbank.vn/account/detail',
			'Content-Type': 'application/json',
		},
		method: 'POST',
		body: JSON.stringify({
			requestId: getRequestId(),
			language: 'vi',
			version: '1.0',
			channel: 'eFAST',
			newCore: '',
			accountType: 'D',
			currency: 'VND',
			pageSize: PAGE_SIZE,
			lastRecord: '',
			cardNo: '',
			...config,
			...query,
		}),
	})
		.then(res => res.json())
		.catch(e => e);

	if (_.get(data, 'status.code') === SUCCESS_CODE) {
		_.forEach(data.transactions, trans => {
			trans.accountNo = config.accountNo;
		});
		if (+data.nextPage && +data.nextPage < MAX_PAGE) {
			return [
				...data.transactions,
				...(await getTransactionsByAccount(config, {
					...query,
					pageIndex: data.nextPage,
				})),
			];
		}
		return data.transactions;
	}

	logger.error('getTransactionsByAccount error', config.username, query, data);
	return [];
}

async function getTransactions(configs, query) {
	const key = `${configs[0].shortName}_${configs[0].username}`;

	if (TransactionLock.isBusy(key)) {
		return [];
	}

	return TransactionLock.acquire(key, async () => {
		await checkAuth(configs[0]);

		const username = encrypt(configs[0].username, configs[0].configs.publicKey);
		const cifno = encrypt(configs[0].credentials.cifNo, configs[0].configs.publicKey);

		query = query || {};
		const fromDate = (query.from ? moment(query.from) : moment().add(-1, 'day')).format('DD/MM/YYYY');
		const toDate = moment(query.to || undefined).format('DD/MM/YYYY');

		const transactions = await configs.asyncMap(config =>
			getTransactionsByAccount(
				{
					accountNo: config.accountNos[0],
					username,
					cifno,
					sessionId: configs[0].credentials.sessionId,
				},
				{
					fromDate,
					toDate,
				}
			)
		);

		// const transactions = await config.accountNos.asyncMap(accountNo =>
		// 	getTransactionsByAccount(
		// 		{
		// 			accountNo,
		// 			username,
		// 			cifno,
		// 			sessionId: config.credentials.sessionId,
		// 		},
		// 		{
		// 			fromDate,
		// 			toDate,
		// 		}
		// 	)
		// );

		return _.flattenDeep(transactions);
	});
}

function getTransactionDoc(configs, transaction) {
	const account = configs.find(c => transaction.remark && transaction.remark.includes(c.accountNos[0])) || configs[0];
	return {
		_id: transaction.trxId,
		accountId: account._id,
		accountNo: transaction.accountNo,
		bankName: account.shortName,
		data: transaction,
		status: TransactionStatus.SUCCESS,
	};
}

function getMeta(transaction) {
	const [, , cardNumber] = transaction.remark.match(/(THE=)([\d|*]*)/) || [];
	const mdate = moment(transaction.tranDate, 'DD-MM-YYYY HH:mm:ss');

	return _.pickBy({
		amount: Number(transaction.amount),
		balance: Number(transaction.balance),
		cardNumber,
		date: mdate.isValid() && mdate.format('YYYY-MM-DD'),
	});
}

function getFields(transaction) {
	const [, , docNo] = transaction.remark.match(/(DOCNO=)([\d]*)/) || [];

	return {
		tranTime: moment(transaction.tranDate, 'DD-MM-YYYY HH:mm:ss').toDate(),
		docNo,
	};
}

function formatMoney(value) {
	return value !== null && value !== undefined ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
}

function getSMSText(doc) {
	const date = moment(doc.tranTime);

	const arr = [
		`VietinBank:${date.format('DD/MM/YYYY HH:mm')}`,
		`TK:${doc.accountNo}`,
		`GD:${doc.meta.amount >= 0 ? '+' : ''}${formatMoney(doc.meta.amount)}VND`,
		`SDC:${formatMoney(doc.meta.balance)}VND`,
		`ND:${doc.data.remark}`,
	];
	return arr.join('|');
}

module.exports = {
	getTransactions,
	getTransactionDoc,
	getMeta,
	getFields,
	getSMSText,
};

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const _ = require('lodash');
const { v4: uuid } = require('uuid');
const { customAlphabet } = require('nanoid');
const crypto = require('crypto');
const xlsx = require('xlsx');
const path = require('path');

const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const fetch = require('@utils/fetch');
const { SYS_BANK_ACCOUNT_TYPE, TransactionStatus } = require('@utils/const');
// const { TransactionLock } = require('@utils/lock');
const createUriParams = require('@utils/uri');
const errorCode = require('./errorCode.json');

const BANK_CODE = 'MB';
const NANO_KEY = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const getClientId = customAlphabet(NANO_KEY, 24);
const getTransId = customAlphabet(NANO_KEY, 8);

const UNKNOWN_ERROR_CODE = ['002', '500'];

function getErrors(code) {
	return {
		error: true,
		errorReason: code,
		toastMessage: errorCode[code] || 'Internal Server Error!',
	};
}

function createJWT({ serectKey, partnerCode, expiresIn, apiKey }) {
	const payload = {
		iss: partnerCode,
		api_key: apiKey,
	};

	const header = {
		typ: 'JWT',
		alg: 'HS256',
		cty: 'tb-api;v=1',
	};

	return jwt.sign(payload, serectKey, { header, algorithm: 'HS256', expiresIn });
}

async function generaToken(req, res) {
	try {
		const auth = req.get('Authorization');
		if (!auth) {
			return res.json(getErrors('003'));
		}

		const key = auth.replace('Basic', '').trim();
		const decoded = Buffer.from(key, 'base64').toString('utf-8');

		const [user, pass] = decoded.split(':');

		const config = await mongoose.model('BankServiceAccount').findOne({
			username: user,
			password: pass,
			active: true,
		});

		if (!config) {
			return res.json(getErrors('004'));
		}

		config.configs.expiresIn = config.configs.expiresIn || 3600;
		const token = createJWT(config.configs);

		res.json({
			access_token: token,
			token_type: 'bearer',
			expires_in: config.configs.expiresIn,
		});
	} catch (e) {
		logger.error(e);
		res.json(getErrors('500'));
	}
}

function verifyToken(req, res, next) {
	try {
		logger.info('onReceivedTransaction unverifyToken', JSON.stringify(req.body, '', 4));

		mongoose
			.model('APIDebugger')
			.create({
				from: 'MBBank',
				data: req.body,
				headers: req.headers,
			})
			.catch(e => {
				logger.error('MBBank APIDebugger', e);
			});

		const auth = req.get('Authorization');
		if (!auth) {
			return res.json(getErrors('003'));
		}

		const token = auth.replace('Bearer', '').trim();
		const decoded = jwt.decode(token);
		if (!decoded) {
			return res.json(getErrors('004'));
		}

		mongoose
			.model('BankServiceAccount')
			.findOne({
				bankCode: BANK_CODE,
				active: true,
				accountType: SYS_BANK_ACCOUNT_TYPE.INBOUND,
				'configs.apiKey': decoded.api_key,
			})
			.then(doc => {
				if (!doc) {
					throw new Error(404);
				}

				const verified = jwt.verify(token, doc.configs.serectKey);
				if (verified) {
					req.account = doc;
					next();
				} else {
					throw new Error('decode fail');
				}
			})
			.catch(e => {
				logger.error(e);
				res.sendStatus(401);
			});
	} catch (e) {
		logger.error('MBBank verifyToken error', e);
		res.json(getErrors('500'));
	}
}

async function onReceivedTransaction(req, res) {
	try {
		const data = req.body;

		logger.info('onReceivedTransaction', JSON.stringify(data, '', 4));

		const account = await mongoose.model('BankAccount').findOne({
			bankCode: BANK_CODE,
			accountNos: data.bankaccount,
			active: true,
		});
		if (!account) {
			return res.json(getErrors('002'));
		}

		let transaction = await mongoose.model('BankTransaction').findOne({
			accountId: account._id,
			docNo: data.referencenumber,
		});

		if (!transaction) {
			transaction = await mongoose.model('BankTransaction').create({
				_id: uuid(),
				accountId: account._id,
				accountNo: data.bankaccount,
				bankCode: account.bankCode,
				bankName: account.shortName,
				data,
				meta: {
					amount: data.transType === 'D' ? -data.amount : data.amount,
					transactionId: data.transactionid,
				},
				docNo: data.referencenumber, // field group - Purchase and Mercht fee mush have same docNo
				tranTime: new Date(data.transactiontime),
				status: TransactionStatus.SUCCESS,
			});
		}

		res.json({
			error: false,
			errorReason: '000',
			toastMessage: '',
			object: {
				reftransactionid: transaction._id,
			},
		});
	} catch (e) {
		logger.error('onReceivedTransaction', e);
		res.json(getErrors('500'));
	}
}

async function onReceivedTransactionResult(req, res) {
	try {
		const data = req.body;

		logger.info('onReceivedTransactionResult', JSON.stringify(data, '', 4));

		const transaction = await mongoose.model('BankTransaction').findOne({
			'meta.transactionId': data.transactionId,
		});

		if (!transaction) {
			return res.json(getErrors('005'));
		}

		// TransactionStatus
		if (_.upperCase(data.transactionStatus) !== transaction.status) {
			transaction.status = _.upperCase(data.transactionStatus);
			if (data.transactionTime)
				transaction.tranTime = moment(data.transactionTime, 'YYYY-MM-DD HH:mm:ss').toDate();
			if (data.ft) transaction.docNo = data.ft;
			await transaction.save();
		}

		res.json({
			error: false,
			errorReason: '000',
			toastMessage: '',
			object: {
				refTransactionid: transaction._id,
			},
		});
	} catch (e) {
		logger.error(e);
		res.json(getErrors('500'));
	}
}

function formatMoney(value) {
	return value !== null && value !== undefined ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
}

function getSMSText(doc) {
	// "TK 223568899 GD: +500,000VND 26/05/23 10:41 SD:500,000VND ND: CTY CP DICH VU CONG NGHE tb chu yen tien vao tk MBbank Trace 090715 223568899"
	const arr = [
		`TK ${doc.accountNo}`,
		`GD: ${doc.meta.amount >= 0 ? '+' : '-'}${formatMoney(doc.meta.amount)} ${moment(doc.tranTime).format(
			'DD/MM/YY HH:mm'
		)}`,
		`ND: ${doc.data.content}`,
		`REF: ${doc.docNo}`,
	];
	return arr.join(' ');
}

async function getAuth(serviceAccount, { bId = 'CF', clientMessageId, transactionId } = {}) {
	const uri = `${serviceAccount.configs.endpoint}/private/oauth2/v1/token`;
	const basicToken = Buffer.from(`${serviceAccount.username}:${serviceAccount.password}`).toString('base64');
	const body = new URLSearchParams(`grant_type=client_credentials`);

	const res = await fetch(uri, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${basicToken}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body,
	});

	const json = await res.json();
	if (!json.access_token) {
		return Promise.reject(json);
	}

	const headers = {
		Authorization: `Bearer ${json.access_token}`,
		'Content-Type': 'application/json',
		clientMessageId: clientMessageId || getClientId(),
		transactionId: transactionId || `${serviceAccount.configs.channel || 'VU'}${bId}${getTransId()}`,
	};

	return {
		...json,
		headers,
	};
}

async function requestMB(serviceAccount, uri, options) {
	const { bId, signature, throwError = true, clientMessageId, transactionId, ...opts } = options || {};
	const { headers } = await getAuth(serviceAccount, { bId, clientMessageId, transactionId });

	if (signature) {
		headers.signature = signature;
	}

	logger.info('requestMB', uri);
	logger.info(JSON.stringify(headers, '', 4));
	if (opts.body) {
		logger.info(opts);
	}

	const res = await fetch(uri, {
		headers,
		...opts,
	});

	logger.info('requestMB res', res.status);

	const json = await res.json();

	logger.info(JSON.stringify(json, '', 4));

	const statusText = _.get(json, 'errorDesc[0]') || _.get(json, 'errorDesc') || _.get(json, 'soaErrorDesc');

	if (json.errorCode !== '000' && throwError) {
		return Promise.reject(statusText);
	}

	return {
		headers,
		statusText,
		...json,
	};
}

// async function fetchTransactions(account, serviceAccount, from, to) {
// 	const uri = createUriParams(`${serviceAccount.configs.endpoint}/ms/ewallet/v1.0/get-transaction-history`, {
// 		accountNumber: account.accountNos[0],
// 		accountType: _.get(account.configs, 'accountType') || 'ACCOUNT',
// 		fromDate: moment(from).startOf('day').format('Y-MM-DDTHH:mm:ss.SSS'),
// 		toDate: moment(to).endOf('day').format('Y-MM-DDTHH:mm:ss.SSS'),
// 	});

// 	const { data } = await requestMB(serviceAccount, uri);

// 	return data;
// }

// function parseTransaction(transaction, account) {
// 	return {
// 		_id: uuid(),
// 		accountId: account._id,
// 		accountNo: transaction.accountNumber,
// 		bankCode: account.bankCode,
// 		bankName: account.shortName,
// 		data: transaction,
// 		meta: {
// 			amount: transaction.amount,
// 			// transactionId: data.transactionid,
// 		},
// 		docNo: transaction.referenceNumber, // field group - Purchase and Mercht fee mush have same docNo
// 		tranTime: new Date(transaction.transactionDate),
// 		status: transaction.transactionStatus,
// 	};
// }

// async function getTransactions(configs, query, serviceAccount) {
// 	const [config] = configs;

// 	const key = `${config._id}`;

// 	if (TransactionLock.isBusy(key)) {
// 		return [];
// 	}

// 	return TransactionLock.acquire(key, async () => {
// 		query = query || {};
// 		const from = query.from ? _.max([new Date(query.from), moment().subtract(30, 'day').toDate()]) : new Date();
// 		const to = query.to ? _.max([new Date(query.to), from]) : new Date();

// 		const transactions = await fetchTransactions(config, serviceAccount, from, to);
// 		if (!transactions.length) return [];

// 		const docs = transactions.map(t => parseTransaction(t, config));

// 		const existsDocs = await mongoose
// 			.model('BankTransaction')
// 			.findOne({
// 				accountId: config._id,
// 				accountNo: config.accountNos[0],
// 				docNo: { $in: _.map(docs, 'docNo') },
// 			})
// 			.select('docNo');

// 		const docObjs = _.keyBy(existsDocs, 'docNo');

// 		return docs.filter(doc => !docObjs[doc.docNo]);
// 	});
// }

async function requestSubscribeNotification({ serviceAccount, account }) {
	const uri = `${serviceAccount.configs.endpoint}/private/ms/push-mesages-partner/v1.0/bdsd/subscribe/request`;
	const body = {
		accountName: account.accountName,
		accountNumber: account.accountNos[0],
		nationalId: account.nationalId,
		phoneNumber: account.phoneNumber,
		applicationType: serviceAccount.configs.applicationType, // 'WEB_APP'
		authenType: serviceAccount.configs.authenType, // 'SMS'
		transType: _.get(account.configs, 'transType') || serviceAccount.configs.transType || 'DC', // 'DC'
	};

	const { data } = await requestMB(serviceAccount, uri, {
		method: 'POST',
		body: JSON.stringify(body),
		clientMessageId: uuid(),
	});

	return {
		data,
	};
}

async function confirmSubscribeNotification({ serviceAccount, data }) {
	const uri = `${serviceAccount.configs.endpoint}/private/ms/push-mesages-partner/v1.0/bdsd/subscribe/confirm`;

	const body = {
		applicationType: serviceAccount.configs.applicationType, // 'WEB_APP'
		authenType: serviceAccount.configs.authenType, // 'SMS'
		// otpValue: '04111994',
		// requestId: 'IJ-1d8e53c5-dfe1-4999-8844-d407c10e0cc3',
		...data,
	};

	const res = await requestMB(serviceAccount, uri, {
		method: 'POST',
		body: JSON.stringify(body),
		clientMessageId: uuid(),
	});

	return {
		data: res.data,
	};
}

async function requestUnsubscribeNotification({ serviceAccount, account }) {
	const uri = `${serviceAccount.configs.endpoint}/private/ms/push-mesages-partner/v1.0/bdsd/unsubscribe/request`;

	const body = {
		accountNumber: account.accountNos[0],
		authenType: serviceAccount.configs.authenType, // 'SMS'
	};

	const res = await requestMB(serviceAccount, uri, {
		method: 'POST',
		body: JSON.stringify(body),
		clientMessageId: uuid(),
	});

	return {
		data: res.data,
	};
}

async function confirmUnsubscribeNotification({ serviceAccount, data }) {
	const uri = `${serviceAccount.configs.endpoint}/private/ms/push-mesages-partner/v1.0/bdsd/unsubscribe/confirm`;

	const res = await requestMB(serviceAccount, uri, {
		method: 'POST',
		body: JSON.stringify(data),
		clientMessageId: uuid(),
	});

	return {
		data: res.data,
	};
}

async function getAccountInfo({
	serviceAccount,
	accountNumber,
	accountType = 'ACCOUNT',
	// transferType = 'NAPAS',
	bin, // bin code of bank
	bankCode,
}) {
	const data = {
		accountNumber,
		accountType,
		transferType: bankCode === BANK_CODE ? 'INHOUSE' : 'NAPAS',
	};
	if (bankCode !== BANK_CODE) {
		data.bankCode = bin;
	}

	const uri = createUriParams(`${serviceAccount.configs.endpoint}/private/ms/bank-info/v1.0/account/info`, data);
	// const uri = `${serviceAccount.configs.endpoint}/private/ms/bank-info/v1.0/account/info`;

	logger.info('getAccountInfo', uri);
	logger.info(JSON.stringify(data, '', 4));

	const res = await requestMB(serviceAccount, uri);

	return res.data;
}

async function getCardInfo({ serviceAccount, accountNumber }) {
	const data = {
		cardNumber: accountNumber,
		requestID: getClientId(),
	};

	const uri = 'https://mbcardtest.mbbank.com.vn:8446/mbcardgw/internet/cardinfo/v1_0/generatetoken';
	const { headers } = await getAuth(serviceAccount);

	const { privateKey, partnerCode } = serviceAccount.configs;

	const dataToSign = JSON.stringify(data);
	headers.hmac = createSignature(dataToSign, privateKey);
	headers.user = partnerCode;

	logger.info('getCardInfo', uri);
	logger.info(JSON.stringify(data, '', 4));

	const res = await fetch(uri, {
		headers,
		method: 'POST',
		body: dataToSign,
	});

	logger.info(JSON.stringify(headers, '', 4));

	const json = await res.json();

	if (json.errorCode !== '000') {
		return Promise.reject(json);
	}

	return res.data;
}

function createSignature(data, serectKey) {
	const signature = crypto.createSign('sha256').update(data).sign(serectKey, 'base64');
	return signature;
}

async function makeTranser({
	serviceAccount,
	debitAccount,
	creditAccount,
	transferAmount,
	remark,
	throwError = false,
}) {
	const uri = `${serviceAccount.configs.endpoint}/private/canary/ms/funds-partner/transfer-fund/v1.0/make-transfer-partner-async`;

	const transactionId = `${serviceAccount.configs.channel || 'VU'}CH${getTransId()}`;

	const transferType =
		BANK_CODE === creditAccount.bankId.bankCode ? 'INHOUSE' : creditAccount.bankId.citadCode ? 'IBPS' : 'FAST';

	const body = {
		customerType: serviceAccount.configs.customerType || 'DOANH_NGHIEP',
		customerLevel: serviceAccount.configs.customerLevel || '1',
		serviceType: serviceAccount.configs.serviceType || 'CHI_HO',
		debitType: serviceAccount.configs.debitType || 'ACCOUNT',
		debitResourceNumber: debitAccount.accountNos[0],
		debitName: debitAccount.accountName,
		creditType: 'ACCOUNT',
		creditResourceNumber: creditAccount.accountNos[0],
		creditName: creditAccount.accountName,
		transferType,
		bankCode: transferType === 'IBPS' ? creditAccount.bankId.citadCode : creditAccount.bankId.bin,
		transferAmount,
		remark: `tb CHUYEN TIEN ${transactionId} ${remark}`,
	};

	const { privateKey } = serviceAccount.configs;
	const dataToSign = `${body.debitResourceNumber}${body.debitName}${body.creditResourceNumber}${body.creditName}${body.transferAmount}`;

	logger.info('makeTranser', uri);
	logger.info(JSON.stringify(body, '', 4));

	const res = await requestMB(serviceAccount, uri, {
		method: 'POST',
		body: JSON.stringify(body),
		bId: 'CH',
		signature: createSignature(dataToSign, privateKey),
		throwError,
		transactionId,
	});

	return {
		meta: {
			amount: -transferAmount,
			accountNo: body.creditResourceNumber,
			accountName: body.creditName,
			transactionType: body.transactionType,
			transferType: body.transferType,
			transactionFee: _.get(debitAccount.configs, ['fee', transferType]),
			transactionId: res.headers.transactionId,
			clientMessageId: res.headers.clientMessageId,
		},
		status:
			res.data && res.data.status
				? res.data.status
				: UNKNOWN_ERROR_CODE.includes(res.errorCode)
					? TransactionStatus.PROCESSING
					: TransactionStatus.ERROR,
		statusDescription: JSON.stringify({ ...res, headers: undefined }),
		statusText: res.statusText,
		reqData: body,
		resData: res.data,
	};
}

async function checkTransaction({ serviceAccount, transaction }) {
	const uri = `${serviceAccount.configs.endpoint}/private/canary/ms/funds-partner/transfer-fund/v1.0/query-transaction-status?transactionId=${transaction.meta.transactionId}`;

	logger.info('checkTransaction', uri);
	logger.info(uri);

	const { data, ...res } = await requestMB(serviceAccount, uri, { throwError: false });

	if (data && data.transStatus && data.transStatus !== transaction.status) {
		transaction.status = data.transStatus;
		if (data.ft) transaction.docNo = data.ft;
		await transaction.save();
	} else if (res.errorCode === '51173') {
		transaction.status = TransactionStatus.ERROR;
		await transaction.save();
	}

	return data;
}

function getBankList(bankListSheet) {
	let startRow = 2;
	let maxRow = 1000;
	let bankObjs = {};
	let bankList = [];

	while (startRow <= maxRow) {
		const bankName = _.get(bankListSheet, [`A${startRow}`, 'v']);
		if (bankName) {
			const matchedCode = bankName.match(/\(\D+\)/);
			if (matchedCode) {
				const bankCode = _.upperCase(matchedCode[0].replace(/\(|\)/g, ''));
				bankObjs[bankCode] = bankName;
			}
			bankList.push(bankName);
		}
		startRow++;
	}

	return { bankObjs, bankList };
}

async function exportFileBulkPayments({ items, payDescription, requestNo }) {
	const template = 'mb_bulkpayment.xlsx';

	const wb = await xlsx.readFile(path.join(__dirname, template));
	const ws = wb.Sheets.eMB_BulkPayment;

	const { bankObjs, bankList } = getBankList(wb.Sheets['Tên NH Gợi ý']);

	let i = 0;

	for (const item of items) {
		const { bankId } = item;
		const bankName =
			(bankId.bankCodeMB && bankList.find(bName => _.trim(bName) === _.trim(bankId.bankCodeMB))) ||
			bankObjs[_.upperCase(bankId.bankCode)] ||
			bankObjs[_.upperCase(bankId.shortName)];

		if (!bankName) {
			throw new ThrowReturn(
				`Không tìm thấy thông tin ngân hàng ${bankId.shortName} - ${item.accountName} - ${item.accountNo}!`
			);
		}

		const row = i + 3;

		_.set(ws, [`A${row}`, 'v'], i + 1);
		_.set(ws, [`B${row}`, 'v'], item.accountNo);
		_.set(ws, [`C${row}`, 'v'], item.accountName);
		_.set(ws, [`D${row}`, 'v'], bankName);
		_.set(ws, [`E${row}`, 'v'], item.amount);
		_.set(ws, [`F${row}`, 'v'], payDescription || item.payDescription);

		i++;
	}

	const fileName = `mb_bulkpayment_${requestNo}.xlsx`;

	const fileData = await xlsx.write(wb, { type: 'buffer' });

	return { fileData, fileName, fileType: 'application/vnd.ms-excel' };
}

module.exports = {
	verifyToken,
	generaToken,
	onReceivedTransaction,
	getSMSText,
	// getTransactions,
	requestSubscribeNotification,
	confirmSubscribeNotification,
	requestUnsubscribeNotification,
	confirmUnsubscribeNotification,
	//
	getAccountInfo,
	makeTranser,
	checkTransaction,
	onReceivedTransactionResult,
	getCardInfo,
	exportFileBulkPayments,
};

const moment = require('moment');
const _ = require('lodash');
const isBase64 = require('is-base64');
const cheerio = require('cheerio');

const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const { parseCookies, stringifyCookies } = require('@utils/cookie');
const { TransactionLock } = require('@utils/lock');
const { TransactionStatus } = require('@utils/const');
const { detectCapcha } = require('./capcha');

const PAGE_SIZE = 100;
const MAX_PAGE = 10;
const URI = 'https://www.bidv.vn';
const HEADERS = {
	'Upgrade-Insecure-Requests': 1,
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': 'Windows',
	'sec-ch-ua': `" Not A;Brand";v="99", "Chromium";v="100", "Google Chrome";v="100"`,
};

async function getCapchaUrl(config) {
	const capcha = await fetch(`${URI}/iBank/getCaptcha.html`, {
		headers: {
			Cookie: config.credentials.cookie,
			Origin: URI,
			Referer: `${URI}/iBank/MainEB.html`,
			...HEADERS,
		},
		method: 'POST',
	}).then(res => res.text());

	const isValid = isBase64(capcha, { allowMime: true, mimeRequired: false, allowEmpty: false });
	if (!isValid) {
		return Promise.reject(`BIDV getCapchaUrl error ${capcha}`);
	}
	return capcha;
}

function getLoginToken(html) {
	const $ = cheerio.load(html);
	const input = $('input[name=_token_login]');
	return input ? input.attr('value') : '';
}

function getToken(html) {
	const [, , token] = html.match(/(var tokenVar = tokenVar \|\| )'(\w+)'/) || [];
	return token;
}

function dataToFormUrl(params) {
	const appends = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
	return appends.join('&');
}

async function login(config) {
	const mainUrl = `${URI}/iBank/MainEB.html`;

	const res = await fetch(mainUrl, {
		headers: {
			Cookie: config.credentials.cookie,
			...HEADERS,
		},
	});
	config.credentials.cookie = stringifyCookies(parseCookies(res.headers.raw()['set-cookie']));
	const loginToken = getLoginToken(await res.text());

	const capchaUrl = await getCapchaUrl(config);
	const capcha = await detectCapcha(capchaUrl);
	const body = dataToFormUrl({
		username: config.username,
		password: config.decryptedPassword || config.password,
		captcha: capcha,
		transaction: 'User',
		method: 'Login',
		_token_login: loginToken,
	});

	await fetch(mainUrl, {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: config.credentials.cookie,
			Origin: URI,
			Referer: mainUrl,
			...HEADERS,
		},
		method: 'POST',
		body,
	});

	const res2 = await fetch(mainUrl, {
		headers: {
			Cookie: config.credentials.cookie,
			Referer: mainUrl,
			...HEADERS,
		},
	}).then(rs => rs.text());

	const token = getToken(res2);
	if (!token) {
		throw new Error('BIDV getToken error');
	}
	config.credentials.token = token;
	if (config.save) {
		config.markModified('credentials');
		await config.save();
	}
}

async function checkAuth(config) {
	const data = await fetch(`${URI}/iBank/MainEB.html?transaction=WidgetNotify&method=getMain&_ACTION_MODE=search`, {
		headers: {
			Origin: URI,
			Referer: `${URI}/iBank/MainEB.html`,
			Cookie: config.credentials.cookie,
			RESULT_TYPE: 'JSON',
			token: config.credentials.token,
		},
		method: 'POST',
		body: `transaction=WidgetNotify&method=getMain&_ACTION_MODE=search`,
	}).then(res => res.json());

	if (data.errorCode === 0) return true;
	await login(config);
	return false;
}

async function getTransactionsByAccount(config, query) {
	const { accountNo, page = 1, fromDate, toDate } = query;
	const skip = (page - 1) * PAGE_SIZE;

	const body = dataToFormUrl({
		keyWord: '',
		currencyDefault: 'VND',
		hostUnit: 'Y',
		memberUnits: '',
		accountNo,
		fromDate,
		toDate,
		optAmountMin: '',
		optAmountMax: '',
		optionsTransactionType: '',
		take: PAGE_SIZE,
		skip,
		page,
		pageSize: PAGE_SIZE,
	});
	const data = await fetch(
		`${URI}/iBank/MainEB.html?transaction=TransactionHistory&method=getMain&_ACTION_MODE=search`,
		{
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
				Origin: URI,
				Referer: `${URI}/iBank/MainEB.html?transaction=TransactionHistory&method=main`,
				Cookie: config.credentials.cookie,
				RESULT_TYPE: 'JSON_GRID',
				token: config.credentials.token,
			},
			method: 'POST',
			body,
		}
	)
		.then(res => res.json())
		.catch(e => e);

	if (data && data.errorCode === 0) {
		if (+data.responseData.total > page * PAGE_SIZE && page <= MAX_PAGE) {
			return [
				data.responseData,
				...(await getTransactionsByAccount(config, {
					...query,
					page: page + 1,
				})),
			];
		}
		return [data.responseData];
	}

	logger.error('BIDV getTransactionsByAccount error', query, body, data);
	return [];
}

async function getTransactions(configs, query) {
	const key = `${configs[0].shortName}_${configs[0].username}`;

	if (TransactionLock.isBusy(key)) {
		return [];
	}

	return TransactionLock.acquire(key, async () => {
		await checkAuth(configs[0]);

		query = query || {};
		const fromDate = (query.from ? moment(query.from) : moment().add(-15, 'day')).format('DD/MM/YYYY');
		const toDate = moment(query.to || undefined).format('DD/MM/YYYY');

		const transactions = await configs.asyncMap(config =>
			getTransactionsByAccount(configs[0], {
				fromDate,
				toDate,
				accountNo: config.accountNos[0],
			})
		);

		// const transactions = await config.accountNos.asyncMap(accountNo =>
		// 	getTransactionsByAccount(config, {
		// 		fromDate,
		// 		toDate,
		// 		accountNo,
		// 	})
		// );

		return _.flatten(_.map(_.flatten(transactions), 'rows'));
	});
}

function getTransactionDoc(configs, transaction) {
	const account = configs.find(c => c.accountNos[0] === transaction.accountTransfer) || configs[0];

	return {
		_id: `${account.shortName}_${transaction.id}_${transaction.transactionType}`,
		accountId: account._id,
		accountNo: transaction.accountTransfer,
		bankName: account.shortName,
		data: transaction,
		status: TransactionStatus.SUCCESS,
	};
}

function toNumber(string) {
	return Number(_.replace(string, /\D/g, ''));
}

function getMeta(transaction) {
	const isDebit = transaction.transactionType === 'DEBIT';
	return {
		amount: isDebit ? -toNumber(transaction.debit) : toNumber(transaction.credit),
		transactionType: transaction.transactionType,
		transactionId: transaction.id,
	};
}

function getFields(transaction) {
	return {
		tranTime: moment(transaction.transactionDate, 'DD/MM/YYYY HH:mm:ss').toDate(),
		docNo: transaction.id,
	};
}

function formatMoney(value) {
	return value !== null && value !== undefined ? value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '';
}

function getSMSText(doc) {
	const date = moment(doc.tranTime);

	const body = [
		`TK${doc.data.accountTransfer} tai BIDV`,
		`${doc.meta.amount >= 0 ? '+' : ''}${formatMoney(doc.meta.amount)}VND`,
		`vao ${date.format('HH:mm DD/MM/YYYY')}.`,
		`So du:***VND.`,
		`${doc.data.content}`,
	];
	return body.join(' ');
}

module.exports = {
	getTransactions,
	getTransactionDoc,
	getMeta,
	getFields,
	getSMSText,
};

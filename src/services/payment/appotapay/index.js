const crypto = require('crypto');
const querystring = require('qs');
const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const { v4: uuid } = require('uuid');

const { Platform, ThirdPartyPayment, ThirdPartyPaymentStatus } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const ERROR_MSG = require('./error_code.json');

const PAYMENT_NAME = ThirdPartyPayment.APPOTAPAY;

function ksort(obj) {
	const keys = Object.keys(obj).sort();
	const sortedObj = {};

	keys.forEach(key => {
		sortedObj[key] = obj[key];
	});

	return sortedObj;
}

function createHmac256(params, serectKey) {
	const signData = querystring.stringify(ksort(params), { encode: false });
	const signature = crypto.createHmac('sha256', serectKey).update(signData).digest('hex');
	return signature;
}

function createJWT({ serectkey = '', partnerCode, accessKey: apiKey }) {
	const date = moment().add(7, 'days').unix();
	const payload = {
		iss: partnerCode,
		jti: `${apiKey}-${date}`,
		api_key: apiKey,
		exp: date,
	};

	const header = {
		typ: 'JWT',
		alg: 'HS256',
		cty: 'appotapay-api;v=1',
	};

	return jwt.sign(payload, serectkey, { header, algorithm: 'HS256' });
}

async function getTransactionStatus(orderId, config) {
	const signature = crypto.createHmac('sha256', config.serectkey).update(`orderId=${orderId}`).digest('hex');

	const token = createJWT(config);

	const endpoint = `${config.endpoint}/api/v1/orders/transaction/bank/status`;
	const body = { signature, orderId };
	const configRequest = {
		method: 'post',
		body: JSON.stringify(body),
		headers: {
			'X-APPOTAPAY-AUTH': `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	};

	const response = await fetch(endpoint, configRequest);
	return response.json();
}

async function createPaymentUrl(data) {
	const { otaBookingId, bankCode, amount, paymentRef, ipAddr, config, orderInfo, platform, host, otaName } = data;
	const endpoint = `${config.endpoint}/api/v1/orders/payment/bank`;

	const webRedirectUrl = `${config.returnUrl}/${otaBookingId}`;
	const mobileRedirectUrl = `cozrum://payment-successful/${otaBookingId}/${otaName}/${paymentRef}/${PAYMENT_NAME}`;

	const redirectUrl = platform === Platform.App ? mobileRedirectUrl : host || webRedirectUrl;

	const params = {
		extraData: '',
		bankCode,
		clientIp: ipAddr,
		orderInfo,
		amount,
		paymentMethod: '',
		orderId: paymentRef,
		redirectUrl,
		notifyUrl: config.notifyUrl,
	};

	const token = createJWT(config);
	const signature = createHmac256(params, config.serectkey);
	const body = { ...params, signature };

	const configRequest = {
		method: 'post',
		body: JSON.stringify(body),
		headers: {
			'X-APPOTAPAY-AUTH': `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	};
	const jsonResponse = await fetch(endpoint, configRequest).then(res => res.json());

	return {
		...jsonResponse,
		url: jsonResponse.paymentUrl,
	};
}

async function checkPaymentResult(params, ignoreChecksum) {
	try {
		const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });

		let response = {
			errorCode: params.errorCode,
		};

		if (!ignoreChecksum) {
			const appotapayParams = {
				errorCode: params.errorCode,
				partnerCode: params.partnerCode,
				apiKey: params.apiKey,
				extraData: params.extraData,
				message: params.message,
				amount: params.amount,
				currency: params.currency,
				orderId: params.orderId,
				bankCode: params.bankCode,
				paymentMethod: params.paymentMethod,
				paymentType: params.paymentType,
				appotapayTransId: params.appotapayTransId,
				transactionTs: params.transactionTs,
			};

			const signature = createHmac256(appotapayParams, config.serectkey);
			if (params.signature !== signature) {
				response.errorCode = 2;
				return {
					error: 1,
					dataResponse: response,
				};
			}
		}

		const ref = await models.PaymentRef.findOne({ ref: params.orderId });

		if (!ref) {
			response.errorCode = 36;
		} else if (ref.amount !== Number(params.amount)) {
			response.errorCode = 32;
		}

		const isSuccess = Number(params.errorCode) === 0;

		return {
			error: isSuccess ? 0 : 1,
			data: {
				...params,
				ref,
				method: PAYMENT_NAME,
			},
			dataResponse: response,
		};
	} catch (e) {
		return {
			error: 1,
			dataResponse: {
				errorCode: 99,
			},
		};
	}
}

async function updatePaymentRef(params, ref) {
	if (ref.status !== ThirdPartyPaymentStatus.SUCCESS && params.transactionTs) {
		const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });
		const data = await getTransactionStatus(params.orderId, config);
		const { errorCode, appotapayTransId, bankCode } = data;

		ref.bankCode = bankCode;
		ref.status = Number(errorCode) === 0 ? ThirdPartyPaymentStatus.SUCCESS : ThirdPartyPaymentStatus.FAIL;
		ref.transactionNo = appotapayTransId;
		ref.data = data;
		await ref.save();

		return {
			errorCode,
			message: ERROR_MSG[errorCode],
		};
	}
	return {
		errorCode: 0,
		message: ERROR_MSG['0'],
	};
}

async function refundPayment(config, { orderId, amount, transactionNo, description }) {
	const endpoint = `${config.endpoint}/api/v2/transaction/refund`;
	const params = {
		partnerRefId: orderId,
		transactionId: transactionNo,
		amount,
		currency: 'VND',
		reason: description,
	};

	const token = createJWT(config);
	const signature = createHmac256(params, config.serectkey);
	const body = { ...params, signature };

	const configRequest = {
		method: 'POST',
		body: JSON.stringify(body),
		headers: {
			'X-APPOTAPAY-AUTH': `Bearer ${token}`,
			'Content-Type': 'application/json',
			'X-Request-ID': uuid(),
			'X-Language': 'vi',
		},
	};

	const jsonResponse = await fetch(endpoint, configRequest).then(res => res.json());

	if (jsonResponse.status === 'error' || jsonResponse.errorCode) {
		logger.error('refundPayment', body, jsonResponse);
		return Promise.reject(jsonResponse.message);
	}

	return {
		status: jsonResponse.status === 'success' ? ThirdPartyPaymentStatus.SUCCESS : ThirdPartyPaymentStatus.WAITING,
		transactionNo: jsonResponse.transactionId,
		data: jsonResponse,
	};
}

async function checkRefundTransaction(config, { orderId }) {
	const endpoint = `${config.endpoint}/api/v2/transaction/refund/${orderId}?type=PARTNER_ORDER_ID `;

	const token = createJWT(config);

	const configRequest = {
		method: 'GET',
		headers: {
			'X-APPOTAPAY-AUTH': `Bearer ${token}`,
			'Content-Type': 'application/json',
			'X-Request-ID': uuid(),
			'X-Language': 'vi',
		},
	};

	const jsonResponse = await fetch(endpoint, configRequest).then(res => res.json());

	if (jsonResponse.status === 'error' || jsonResponse.errorCode) {
		logger.error('refundPayment', endpoint, jsonResponse);
		return Promise.reject(jsonResponse.message);
	}

	return {
		status: jsonResponse.status === 'success' ? ThirdPartyPaymentStatus.SUCCESS : ThirdPartyPaymentStatus.WAITING,
		transactionNo: jsonResponse.transactionId,
		data: jsonResponse,
	};
}

module.exports = {
	createPaymentUrl,
	checkPaymentResult,
	updatePaymentRef,
	getTransactionStatus,
	refundPayment,
	checkRefundTransaction,
};

const crypto = require('crypto');
const querystring = require('qs');
const fetch = require('node-fetch');
const { customAlphabet } = require('nanoid');

const { Platform, ThirdPartyPayment, ThirdPartyPaymentStatus } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const errors = require('./error_code.json');

const PAYMENT_NAME = ThirdPartyPayment.MOMO;

const nanoid = customAlphabet('0123456789ABCDEFabcdef', 16);

function createHmac256(params, serectkey) {
	const rawSignature = querystring.stringify(params, { encode: false });
	const signature = crypto.createHmac('sha256', serectkey).update(rawSignature).digest('hex');
	return signature;
}

async function request(endpoint, data) {
	const body = JSON.stringify(data);
	return fetch(endpoint, {
		body,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(body),
		},
	}).then(res => res.json());
}

async function createPaymentUrl(data) {
	let { otaBookingId, otaName, amount, paymentRef, host, config, orderInfo, platform } = data;
	let { partnerCode, accessKey, notifyUrl, returnUrl, endpoint, serectkey } = config;

	let requestType = 'captureMoMoWallet';
	let extraData = 'merchantName=;merchantId='; // pass empty value if your merchant does not have stores else merchantName=[storeName]; merchantId=[storeId] to identify a transaction map with a physical store

	// before sign HMAC SHA256 with format
	let momoParams = {
		partnerCode,
		accessKey,
		requestId: paymentRef,
		amount: amount.toString(),
		orderId: paymentRef,
		orderInfo,
		returnUrl:
			platform === Platform.App
				? `cozrum://payment-successful/${otaBookingId}/${otaName}/${paymentRef}/${PAYMENT_NAME}`
				: host || `${returnUrl}/${otaBookingId}`,
		notifyUrl,
		extraData,
	};
	let signature = createHmac256(momoParams, serectkey);

	const jsonResponse = await request(endpoint, {
		...momoParams,
		requestType,
		signature,
	});

	return {
		...jsonResponse,
		url: jsonResponse.payUrl,
	};
}

async function getTransactionStatus(orderId, config) {
	const requestId = nanoid();

	const data = {
		partnerCode: config.partnerCode,
		accessKey: config.accessKey,
		requestId,
		orderId,
		requestType: 'transactionStatus',
	};
	data.signature = createHmac256(data, config.serectkey);

	return request(config.endpoint, data);
}

async function checkPaymentResult(params, ignoreChecksum) {
	try {
		const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });

		let response = {
			partnerCode: params.partnerCode,
			accessKey: params.accessKey,
			requestId: params.requestId,
			orderId: params.orderId,
			errorCode: params.errorCode,
			message: params.message,
			responseTime: params.responseTime,
			extraData: params.extraData,
		};

		if (!ignoreChecksum) {
			let momoParams = {
				partnerCode: params.partnerCode,
				accessKey: params.accessKey,
				requestId: params.requestId,
				amount: params.amount,
				orderId: params.orderId,
				orderInfo: params.orderInfo,
				orderType: params.orderType,
				transId: params.transId,
				message: params.message,
				localMessage: params.localMessage,
				responseTime: params.responseTime,
				errorCode: params.errorCode,
				payType: params.payType,
				extraData: params.extraData,
			};
			const checksum = createHmac256(momoParams, config.serectkey);

			if (params.signature !== checksum) {
				response.errorCode = 5;
				response.message = errors['5'];
				return {
					error: 1,
					dataResponse: response,
				};
			}
		}

		response.signature = createHmac256(response, config.serectkey);

		const ref = await models.PaymentRef.findOne({ ref: params.orderId });

		if (!ref) {
			response.errorCode = 58;
		} else if (ref.amount !== Number(params.amount)) {
			response.errorCode = 4;
		}

		const isSuccess = Number(response.errorCode) === 0;
		response.message = errors[response.errorCode];

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
				message: errors['99'],
			},
		};
	}
}

async function updatePaymentRef(params, ref) {
	if (ref.status !== ThirdPartyPaymentStatus.SUCCESS && params.transId) {
		const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });
		const data = await getTransactionStatus(params.orderId, config);
		const { errorCode } = data;

		ref.status = Number(errorCode) === 0 ? ThirdPartyPaymentStatus.SUCCESS : ThirdPartyPaymentStatus.FAIL;
		ref.transactionNo = data.transId;
		ref.data = data;
		await ref.save();

		return {
			errorCode,
			message: errors[errorCode],
		};
	}
	return {
		errorCode: 32,
		message: errors['32'],
	};
}

async function refundPayment(config, { orderId, amount, transactionNo, description }) {
	const uri = `https://payment.momo.vn/v2/gateway/api/refund`;
	const requestId = nanoid();

	const body = {
		partnerCode: config.partnerCode,
		orderId,
		requestId,
		amount,
		transId: transactionNo,
		lang: 'en',
		description,
	};

	const rawSignature = `accessKey=${config.accessKey}&amount=${amount}&description=${description}&orderId=${orderId}&partnerCode=${body.partnerCode}&requestId=${requestId}&transId=${body.transId}`;

	body.signature = crypto.createHmac('sha256', config.serectkey).update(rawSignature).digest('hex');

	const jsonResponse = await request(uri, body);

	if (jsonResponse.resultCode !== 0) {
		logger.error('refundPayment', body, jsonResponse);

		return Promise.reject(jsonResponse.message);
	}

	return {
		transactionNo: jsonResponse.transId,
		status: ThirdPartyPaymentStatus.SUCCESS,
		data: jsonResponse,
	};
}

async function checkRefundTransaction(config, { orderId, amount, transactionNo }) {
	const uri = `https://payment.momo.vn/v2/gateway/api/refund/query`;
	const requestId = nanoid();

	const body = {
		partnerCode: config.partnerCode,
		orderId,
		requestId,
		amount,
		transId: transactionNo,
		lang: 'en',
	};

	const rawSignature = `accessKey=${config.accessKey}&orderId=${body.orderId}&partnerCode=${body.partnerCode}&requestId=${body.requestId}`;

	body.signature = crypto.createHmac('sha256', config.serectkey).update(rawSignature).digest('hex');

	const jsonResponse = await request(uri, body);

	if (jsonResponse.resultCode !== 0) {
		logger.error('checkRefundTransaction', body, jsonResponse);

		return Promise.reject(jsonResponse.message);
	}

	return {
		transactionNo: jsonResponse.transId,
		status: ThirdPartyPaymentStatus.SUCCESS,
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

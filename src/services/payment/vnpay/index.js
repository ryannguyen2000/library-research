const crypto = require('crypto');
const _ = require('lodash');
const moment = require('moment');
const querystring = require('qs');
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');

const { logger } = require('@utils/logger');
const { Platform, ThirdPartyPayment, ThirdPartyPaymentStatus } = require('@utils/const');
const models = require('@models');
const ipn_errors = require('./ipn_response_code.json');

const PAYMENT_NAME = ThirdPartyPayment.VNPAY;

function createHash(params, secureHash) {
	const signData = secureHash + querystring.stringify(params, { encode: false });
	return crypto.createHash('sha256').update(signData).digest('hex');
}

// function createNewHash(signData, secretKey) {
// 	const hmac = crypto.createHmac('sha512', secretKey);
// 	const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

// 	return signed;
// }

async function createPaymentUrl(data) {
	const { otaBookingId, otaName, bankCode, amount, paymentRef, host, locale, ipAddr, config, orderInfo, platform } =
		data;

	const returnUrl =
		platform === Platform.App
			? `tb://payment-successful/${otaBookingId}/${otaName}/${paymentRef}/${PAYMENT_NAME}`
			: host || `${config.returnUrl}/${otaBookingId}`;

	let vnp_Params = {
		vnp_Version: '2',
		vnp_Command: 'pay',
		vnp_TmnCode: config.partnerCode,
		vnp_Locale: locale || 'vn',
		vnp_CurrCode: 'VND',
		vnp_TxnRef: paymentRef,
		vnp_OrderInfo: orderInfo,
		vnp_OrderType: '170003',
		vnp_Amount: amount * 100,
		vnp_ReturnUrl: returnUrl,
		vnp_IpAddr: ipAddr,
		vnp_CreateDate: moment().format('YMMDDHHmmss'),
	};

	if (bankCode) vnp_Params.vnp_BankCode = bankCode;

	vnp_Params = Object.sort(vnp_Params);
	vnp_Params.vnp_SecureHash = createHash(vnp_Params, config.serectkey);
	vnp_Params.vnp_SecureHashType = 'SHA256';

	const dataUrl = `${config.endpoint}?${querystring.stringify(vnp_Params, { encode: true })}`;

	return {
		url: dataUrl,
	};
}

async function checkPaymentResult(vnp_Params, fromAPI) {
	try {
		const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });

		const secureHash = vnp_Params.vnp_SecureHash;
		delete vnp_Params.vnp_SecureHash;
		delete vnp_Params.vnp_SecureHashType;

		vnp_Params = Object.sort(vnp_Params);

		if (fromAPI || secureHash === createHash(vnp_Params, config.serectkey)) {
			let rspCode = fromAPI ? vnp_Params.vnp_TransactionStatus : vnp_Params.vnp_ResponseCode;

			const ref = vnp_Params.vnp_TxnRef && (await models.PaymentRef.findOne({ ref: vnp_Params.vnp_TxnRef }));
			if (!ref) {
				return {
					error: 1,
					dataResponse: {
						RspCode: '01',
						Message: ipn_errors['01'],
					},
				};
			}
			if (ref.amount * 100 !== Number(vnp_Params.vnp_Amount)) {
				return {
					error: 1,
					dataResponse: {
						RspCode: '04',
						Message: ipn_errors['04'],
					},
				};
			}

			const isSuccess = rspCode === '00';
			return {
				error: isSuccess ? 0 : 1,
				data: {
					...vnp_Params,
					ref,
					method: PAYMENT_NAME,
				},
				dataResponse: {
					RspCode: '00',
					Message: ipn_errors['00'],
				},
			};
		}
		return {
			error: 1,
			dataResponse: {
				RspCode: '97',
				Message: ipn_errors['97'],
			},
		};
	} catch (e) {
		return {
			error: 1,
			dataResponse: {
				RspCode: '99',
				Message: ipn_errors['99'],
			},
		};
	}
}

async function updatePaymentRef(vnp_Params, ref) {
	const { vnp_TransactionStatus, vnp_ResponseCode, vnp_TransactionNo } = vnp_Params;
	const resCode = vnp_TransactionStatus || vnp_ResponseCode;

	if (ref.status === ThirdPartyPaymentStatus.WAITING && vnp_TransactionNo) {
		if (resCode === '01') {
			return {
				RspCode: resCode,
				Message: ipn_errors[resCode],
				ref,
			};
		}

		ref.status = resCode === '00' ? ThirdPartyPaymentStatus.SUCCESS : ThirdPartyPaymentStatus.FAIL;
		ref.transactionNo = vnp_TransactionNo;
		ref.data = vnp_Params;
		await ref.save();

		return {
			RspCode: '00',
			Message: ipn_errors['00'],
			ref,
		};
	}

	return {
		RspCode: '02',
		Message: ipn_errors['02'],
	};
}

async function getTransactionStatus(orderId, config, ref) {
	const data = {
		vnp_RequestId: uuid(),
		vnp_Version: '2',
		vnp_Command: 'querydr',
		vnp_TmnCode: config.partnerCode,
		vnp_TxnRef: orderId,
		vnp_OrderInfo: ref.description,
		// vnp_TransactionNo: ref.transactionNo,
		vnp_TransactionDate: _.get(ref.data, 'vnp_PayDate') || moment(ref.createdAt).format('YYYYMMDDhhmmss'),
		vnp_CreateDate: moment(ref.createdAt).format('YYYYMMDDhhmmss'),
		vnp_IpAddr: '43.239.223.67',
		vnp_SecureHashType: 'SHA256',
		// vnp_SecureHashType: 'HmacSHA512',
	};
	// data.vnp_SecureHash = createNewHash(
	// 	// querystring.stringify(Object.sort(data), { encode: false }),
	// 	`${data.vnp_RequestId}|${data.vnp_Version}|${data.vnp_Command}|${data.vnp_TmnCode}|${data.vnp_TxnRef}|${data.vnp_TransactionDate}|${data.vnp_CreateDate}|${data.vnp_IpAddr}|${data.vnp_OrderInfo}`,
	// 	config.serectkey
	// );

	data.vnp_SecureHash = crypto
		.createHash('sha256')
		.update(
			`${config.serectkey}${data.vnp_RequestId}|${data.vnp_Version}|${data.vnp_Command}|${data.vnp_TmnCode}|${data.vnp_TxnRef}|${data.vnp_TransactionDate}|${data.vnp_CreateDate}|${data.vnp_IpAddr}|${data.vnp_OrderInfo}`
		)
		.digest('hex');

	const url = `https://merchant.vnpay.vn/merchant_webapi/api/transaction`;
	const body = JSON.stringify(data);

	const resJSON = await fetch(url, {
		body,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	// console.log(resJSON.status);
	// console.log(await resJSON.text());

	return resJSON.json();
}

async function refundPayment(
	config,
	{ originRef, date, orderId, amount, transactionNo, description, isFull = true, user }
) {
	const data = {
		vnp_RequestId: uuid(),
		vnp_Version: '2',
		vnp_Command: 'refund',
		vnp_TmnCode: config.partnerCode,
		vnp_TransactionType: isFull ? '02' : '03', // 2 fullly amount, 3 not full
		// vnp_TxnRef: orderId,
		vnp_TxnRef: originRef.ref,
		vnp_Amount: amount * 100,
		vnp_OrderInfo: description,
		vnp_TransactionNo: transactionNo,
		vnp_TransactionDate:
			_.get(originRef.data, 'vnp_PayDate') || moment(originRef.createdAt).format('YYYYMMDDhhmmss'),

		vnp_CreateBy: user.name,
		vnp_CreateDate: moment(date).format('YYYYMMDDhhmmss'),
		vnp_IpAddr: '43.239.223.67',
	};

	const rawSignature = [
		data.vnp_RequestId,
		data.vnp_Version,
		data.vnp_Command,
		data.vnp_TmnCode,
		data.vnp_TransactionType,
		data.vnp_TxnRef,
		data.vnp_Amount,
		data.vnp_TransactionNo,
		data.vnp_TransactionDate,
		data.vnp_CreateBy,
		data.vnp_CreateDate,
		data.vnp_IpAddr,
		data.vnp_OrderInfo,
	].join('|');

	data.vnp_SecureHash = crypto.createHash('sha256').update(`${config.serectkey}${rawSignature}`).digest('hex');

	const url = `https://merchant.vnpay.vn/merchant_webapi/api/transaction`;

	const body = JSON.stringify(data);

	const res = await fetch(url, {
		body,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	const jsonResponse = await res.json();

	if (jsonResponse.vnp_ResponseCode !== '00') {
		logger.error('refundPayment', data, jsonResponse);
		return Promise.reject(jsonResponse.vnp_Message);
	}

	return {
		status: ThirdPartyPaymentStatus.SUCCESS,
		transactionNo: jsonResponse.vnp_TransactionNo,
		data: jsonResponse,
	};
}

module.exports = { createPaymentUrl, checkPaymentResult, updatePaymentRef, getTransactionStatus, refundPayment };

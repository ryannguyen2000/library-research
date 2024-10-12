const crypto = require('crypto');
const _ = require('lodash');
// const moment = require('moment');
// const querystring = require('qs');
const fetch = require('node-fetch');
// const { v4: uuid } = require('uuid');

const { logger } = require('@utils/logger');
const { Platform, ThirdPartyPayment, ThirdPartyPaymentStatus } = require('@utils/const');
const models = require('@models');

const PAYMENT_NAME = ThirdPartyPayment.NEO_PAY;

function createHash(params, secretKey) {
	const signData =
		_.keys(params)
			.sort((a, b) => a.localeCompare(b))
			.map(field => {
				if (params[field] !== null && params[field] !== undefined) {
					return _.isArray(params[field]) ? params[field].join(',') : params[field];
				}
				return '';
			})
			.join('') + secretKey;

	return crypto.createHash('sha256').update(signData).digest('hex');
}

async function createPaymentUrl(data) {
	const { otaBookingId, otaName, bankCode, amount, paymentRef, host, locale, config, orderInfo, platform } = data;

	const returnUrl =
		platform === Platform.App
			? `cozrum://payment-successful/${otaBookingId}/${otaName}/${paymentRef}/${PAYMENT_NAME}`
			: host || `${config.returnUrl}/${otaBookingId}`;

	const body = {
		neo_MerchantCode: config.partnerCode,
		neo_Currency: 'VND',
		neo_Locale: locale || 'vi',
		neo_Version: '1',
		neo_Command: 'PAY',
		neo_Amount: amount,
		neo_MerchantTxnID: paymentRef,
		neo_OrderID: paymentRef,
		neo_OrderInfo: orderInfo,
		neo_ReturnURL: returnUrl,
		neo_PaymentMethod: ['WALLET', 'ATM', 'CC', 'QR'],
		// neo_ExtData: {
		// 	orderData: {
		// 		payItems: [
		// 			{
		// 				orderId: 'SUB_20231225_001',
		// 				desc: 'Description for sub order id 001',
		// 				price: 37000,
		// 				extraInfo: { foo: 'bar' },
		// 			},
		// 			{
		// 				orderId: 'SUB_20231225_002',
		// 				desc: 'Description for sub order id 002',
		// 				price: 63000,
		// 				extraInfo: { foo: 'bar' },
		// 			},
		// 		],
		// 	},
		// },
	};

	body.neo_SecureHash = createHash(body, config.secretKey);
	const url = `${config.endpoint}/pg/api/v1/paygate/neopay`;

	const res = await fetch(url, {
		body: JSON.stringify(body),
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	const jsonResponse = await res.json();

	if (!jsonResponse.neo_ResponseData) {
		logger.error('neopay createPaymentUrl', body, jsonResponse);
	}

	return {
		url: jsonResponse.neo_ResponseData.redirect,
	};
}

async function checkPaymentResult(neo_Params, fromAPI) {
	try {
		const config = await models.PaymentMethod.findOne({ name: PAYMENT_NAME });

		if (
			fromAPI ||
			_.toUpper(neo_Params.neo_SecureHash) ===
				_.toUpper(
					createHash(
						_.omit(neo_Params, ['neo_SecureHash', 'neo_TransAmount', 'neo_ExtData', 'neo_PaymentMethod']),
						config.secretKey
					)
				)
		) {
			let rspCode = fromAPI ? neo_Params.neo_ResponseCode : neo_Params.neo_ResponseCode;

			const ref = neo_Params.neo_OrderID && (await models.PaymentRef.findOne({ ref: neo_Params.neo_OrderID }));
			if (!ref) {
				return {
					error: 1,
					dataResponse: {
						respcode: '1',
						respmsg: 'Order not found',
					},
				};
			}
			if (ref.amount !== Number(neo_Params.neo_Amount)) {
				return {
					error: 1,
					dataResponse: {
						respcode: 1,
						respmsg: 'Invalid neo_Amount',
					},
				};
			}

			const isSuccess = rspCode === 0;

			return {
				error: isSuccess ? 0 : 1,
				data: {
					...neo_Params,
					ref,
					method: PAYMENT_NAME,
				},
				dataResponse: {
					respcode: 0,
					respmsg: 'received',
				},
			};
		}

		return {
			error: 1,
			dataResponse: {
				respcode: 1,
				respmsg: 'Invalid neo_SecureHash',
			},
		};
	} catch (err) {
		logger.error('neopay checkPaymentResult error', neo_Params, err);
		return {
			error: 1,
			dataResponse: {
				respcode: 1,
				respmsg: 'Unexpected error',
			},
		};
	}
}

async function updatePaymentRef(neo_Params, ref) {
	const { neo_ResponseCode, neo_TransactionID } = neo_Params;
	const resCode = neo_ResponseCode;

	if (ref.status !== ThirdPartyPaymentStatus.SUCCESS && neo_TransactionID) {
		ref.status = resCode === 0 ? ThirdPartyPaymentStatus.SUCCESS : ThirdPartyPaymentStatus.FAIL;
		ref.transactionNo = neo_TransactionID;
		ref.data = neo_Params;
		await ref.save();

		return {
			respcode: 0,
			respmsg: 'received',
			ref,
		};
	}

	return {
		respcode: 0,
		respmsg: 'received',
	};
}

async function getTransactionStatus(orderId, config, ref) {
	const data = {
		neo_MerchantCode: config.partnerCode,
		neo_Version: '1',
		neo_Command: 'QUERY_DR',
		neo_MerchantTxnID: orderId,
	};
	// data.vnp_SecureHash = createNewHash(
	// 	// querystring.stringify(Object.sort(data), { encode: false }),
	// 	`${data.vnp_RequestId}|${data.vnp_Version}|${data.vnp_Command}|${data.vnp_TmnCode}|${data.vnp_TxnRef}|${data.vnp_TransactionDate}|${data.vnp_CreateDate}|${data.vnp_IpAddr}|${data.vnp_OrderInfo}`,
	// 	config.serectkey
	// );

	data.neo_SecureHash = createHash(data, config.secretKey);

	const url = `${config.endpoint}/pg/api/v1/paygate/neopay`;

	const resJSON = await fetch(url, {
		body: JSON.stringify(data),
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	// console.log(resJSON.status);
	// console.log(await resJSON.text());

	return resJSON.json();
}

module.exports = { createPaymentUrl, checkPaymentResult, updatePaymentRef, getTransactionStatus };

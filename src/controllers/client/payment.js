const _ = require('lodash');
const moment = require('moment');

const { OTAs, ThirdPartyPayment, BookingStatus, ThirdPartyPaymentStatus } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const paymentMethods = require('@services/payment');
const { approveInquiry } = require('@controllers/message');
const { createPaymentQr, checkQRPaymentResult } = require('@controllers/banking/qr');
const { throwError, ERROR_CODE } = require('./error');

async function createPayment(body) {
	let { otaBookingId, bankCode, method, otaName = OTAs.CozrumWeb, platform, ip: ipAddr, language } = body;

	if (method === ThirdPartyPayment.BANK_TRANSFER) {
		return createPaymentQr(body);
	}

	method = (method || ThirdPartyPayment.VNPAY).toLowerCase();
	if (!paymentMethods[method]) {
		return throwError(ERROR_CODE.PAYMENT_METHOD_INVALID, language);
	}

	const config = await models.PaymentMethod.findOne({ name: method });
	if (!config) {
		return throwError(ERROR_CODE.PAYMENT_METHOD_INVALID, language);
	}

	const dataPayment = await models.Booking.getPayment({ otaBookingId, otaName });
	if (!dataPayment.amount) {
		return throwError(ERROR_CODE.PAYMENT_NOT_FOUND, language);
	}

	const orderInfo = `Payment for Booking ID ${otaBookingId}`;

	const paymentRef = await models.PaymentRef.createRef({
		method,
		amount: dataPayment.amount,
		otaBookingId,
		otaName,
		bankCode,
		description: orderInfo,
		platform,
		groupIds: dataPayment.bookings[0].groupIds,
		blockId: dataPayment.bookings[0].blockId,
	});
	const data = await paymentMethods[method].createPaymentUrl({
		otaBookingId,
		otaName,
		bankCode,
		amount: dataPayment.amount,
		paymentRef: paymentRef.ref,
		config,
		ipAddr,
		orderInfo,
		platform,
	});

	return { data, paymentRef };
}

async function updateBookingPayment({ ref, ...data }, error, language) {
	if (!ref) return null;
	const response = await paymentMethods[ref.method].updatePaymentRef(data, ref);
	if (error) return response;

	const booking = await models.Booking.findOne({ otaBookingId: ref.otaBookingId, otaName: ref.otaName });
	if (!booking) {
		logger.error('updateBookingPayment Booking not found', ref);
		return throwError(ERROR_CODE.PAYMENT_BOOKING_NOT_FOUND, language);
	}

	const currencyAmount = {
		amount: ref.amount,
		currency: ref.currency,
		exchangedAmount: ref.amount,
	};

	await models.Payout.createOTAPayout({
		otaName: booking.otaName,
		otaId: ref.ref,
		currencyAmount,
		collectorCustomName: ref.method,
		source: models.PaymentMethod.getPayoutSource(ref.method),
		description: `Thanh toán qua ${ref.method.toUpperCase()}, transaction no: ${ref.transactionNo}, orderId: ${
			ref.ref
		}`,
		createdAt: new Date(),
		blockIds: [booking.blockId],
		productId: ref.transactionNo,
		bookingId: booking._id,
	});

	if (booking.status === BookingStatus.REQUEST) {
		approveInquiry({ messageId: booking.messages, force: true, paid: true }).catch(e => {
			logger.error(e);
		});
	}

	return response;
}

async function processIPNVnpay(query) {
	try {
		delete query.start;
		delete query.limit;

		logger.info(`recieve ipn ${ThirdPartyPayment.VNPAY}`, JSON.stringify(query));
		const data = await paymentMethods.vnpay.checkPaymentResult(query);

		if (data.data) {
			const payment = await updateBookingPayment(data.data, data.error);
			Object.assign(data.dataResponse, payment);
		}

		return data.dataResponse;
	} catch (e) {
		logger.error(e);
		return {
			RspCode: '99',
		};
	}
}

async function processIPNMomo(body) {
	try {
		logger.info(`recieve ipn ${ThirdPartyPayment.MOMO}`, body);
		const data = await paymentMethods.momo.checkPaymentResult(body);

		if (data.data) {
			const payment = await updateBookingPayment(data.data, data.error);
			Object.assign(data.dataResponse, payment);
		}
		return data.dataResponse;
	} catch (e) {
		logger.error(e);
		return {
			errorCode: 99,
		};
	}
}

async function processIPNAppotapay(body) {
	try {
		logger.info(`recieve ipn ${ThirdPartyPayment.APPOTAPAY}`, body);

		const data = await paymentMethods.appotapay.checkPaymentResult(body);

		if (data.data) {
			const payment = await updateBookingPayment(data.data, data.error);
			Object.assign(data.dataResponse, payment);
		}

		return data.dataResponse;
	} catch (e) {
		logger.error(e);
		return {
			errorCode: 99,
		};
	}
}

async function processIPNNeopay(body) {
	const apiDebugger = await models.APIDebugger.create({
		from: ThirdPartyPayment.NEO_PAY,
		request: {
			body,
		},
		receiving: true,
	});

	try {
		logger.info(`recieve ipn ${ThirdPartyPayment.NEO_PAY}`, body);

		const data = await paymentMethods.neopay.checkPaymentResult(body);

		if (data.data) {
			const payment = await updateBookingPayment(data.data, data.error);
			Object.assign(data.dataResponse, payment);
		}

		apiDebugger.response = { data: data.dataResponse };
		apiDebugger.save().catch(() => {});

		return data.dataResponse;
	} catch (e) {
		logger.error('processIPNNeopay', e);

		const data = { respcode: 1, respmsg: 'Unexpected error' };

		apiDebugger.response = { data };
		apiDebugger.save().catch(() => {});

		return data;
	}
}

async function processIPNKovena(body, query) {
	try {
		logger.info(`recieve ipn ${ThirdPartyPayment.KOVENA}`, body, query);

		// const data = await paymentMethods.kovena.checkPaymentResult(body);

		// if (data.data) {
		// 	const payment = await updateBookingPayment(data.data, data.error);
		// 	Object.assign(data.dataResponse, payment);
		// }
		// return data.dataResponse;
	} catch (e) {
		logger.error('processIPNKovena', e);
		return {
			respcode: 1,
			respmsg: 'Unexpected error',
		};
	}
}

async function checkTransaction(orderId, user, language) {
	const ref = await models.PaymentRef.findOne({ ref: orderId });
	if (!ref) {
		return throwError(ERROR_CODE.PAYMENT_NOT_FOUND, language);
	}

	if (ref.method === ThirdPartyPayment.BANK_TRANSFER) {
		return checkQRPaymentResult(ref);
	}

	const config = await models.PaymentMethod.findOne({ name: ref.method });

	if (ref.isRefund) {
		if (!paymentMethods[ref.method] || !paymentMethods[ref.method].checkRefundTransaction) {
			return throwError(ERROR_CODE.PAYMENT_METHOD_INVALID, language);
		}

		const res = await paymentMethods[ref.method].checkRefundTransaction(config, {
			orderId,
			amount: Math.abs(ref.amount),
			transactionNo: ref.transactionNo,
			description: ref.description,
			refOrderId: ref.refOrderId,
			createdAt: ref.createdAt,
		});

		ref.transactionNo = res.transactionNo;
		ref.status = res.status;
		ref.data = _.assign(ref.data, res.data);

		await ref.save();

		return res;
	}

	if (!paymentMethods[ref.method] || !paymentMethods[ref.method].getTransactionStatus) {
		return throwError(ERROR_CODE.PAYMENT_METHOD_INVALID, language);
	}

	const res = await paymentMethods[ref.method].getTransactionStatus(orderId, config, ref);
	const data = await paymentMethods[ref.method].checkPaymentResult(res, true);

	if (data.data) {
		const payment = await updateBookingPayment(data.data, data.error);
		Object.assign(data.dataResponse, payment);
	}

	return data;
}

async function getPaymentStatus(query) {
	const { vnp_TxnRef, vnp_Amount, orderId, appotapayTransId, neo_MerchantTxnID } = query;

	let method = '';
	let refId;

	if (orderId) {
		method = appotapayTransId ? ThirdPartyPayment.APPOTAPAY : ThirdPartyPayment.MOMO;
		refId = orderId;
	} else if (neo_MerchantTxnID) {
		method = ThirdPartyPayment.NEO_PAY;
		refId = neo_MerchantTxnID;
	} else {
		method = vnp_TxnRef ? ThirdPartyPayment.VNPAY : '';
		refId = vnp_TxnRef;
	}

	if (!method)
		return {
			error_code: -1,
		};

	const ref = await models.PaymentRef.findOne({ ref: refId });

	if (!ref) {
		return {
			error_code: 1,
			message: 'Đơn hàng không hợp lệ',
		};
	}

	if (method === ThirdPartyPayment.VNPAY) {
		if (ref.amount * 100 !== Number(vnp_Amount)) {
			return {
				error_code: 1,
				message: 'Số tiền không hợp lệ',
			};
		}
	}

	let date = _.get(ref, 'data.vnp_PayDate');
	date = date ? moment(date, 'YYYYMMDDHHmmss') : moment(ref.createdAt);
	date = date.format('DD/MM/Y HH:mm:ss');

	const info = {
		amount: ref.amount,
		currency: ref.currency,
		date,
		orderId: ref.ref,
	};

	if (ref.status === ThirdPartyPaymentStatus.SUCCESS) {
		return {
			error_code: 0,
			message: 'Thanh toán thành công',
			data: info,
		};
	}

	return {
		error_code: 1,
		message: 'Thanh toán thất bại',
		data: info,
	};
}

async function getBankInfo({ bookingId, propertyId }) {
	let blockId;
	let groupIds;

	if (bookingId) {
		const booking = await models.Booking.findById(bookingId)
			.select('blockId')
			.populate('blockId', 'manageFee groupIds');
		blockId = _.get(booking, 'blockId._id');
		groupIds = _.get(booking, 'blockId.groupIds');
	} else if (propertyId) {
		const block = await models.Block.findById(propertyId).select('manageFee groupIds');

		blockId = _.get(block, '_id');
		groupIds = _.get(block, 'groupIds');
	}

	const filter = {
		active: true,
		displayOnWeb: true,
	};

	let banks =
		blockId &&
		(await models.BankAccount.find(
			_.pickBy({
				...filter,
				blockIds: blockId,
			})
		).populate('bankId'));

	if (!banks || !banks.length) {
		banks = await models.BankAccount.find(
			_.pickBy({
				...filter,
				groupIds: groupIds && { $in: groupIds },
				'blockIds.0': { $exists: false },
			})
		).populate('bankId');
	}

	const rs = banks.map(bank => ({
		bank: _.get(bank.bankId, 'shortName') || bank.shortName,
		company_name: bank.accountName,
		bank_account: bank.accountNos[0],
		branch: bank.branch,
		content: bank.displayContent || 'Tên-Số phòng-Chi nhánh',
		note:
			bank.displayNote ||
			'Sau khi chuyển khoản thành công, vui lòng chụp và gửi sao kê để Cozrum tiện đối chiếu. Xin cảm ơn!',
	}));

	return rs;
}

async function getServiceFee() {
	const data = await models.BookingFee.find().select('-_id');
	return _.keyBy(data, 'type');
}

module.exports = {
	getBankInfo,
	getServiceFee,
	getPaymentStatus,
	createPayment,
	processIPNVnpay,
	processIPNMomo,
	processIPNAppotapay,
	checkTransaction,
	processIPNNeopay,
	processIPNKovena,
};

const _ = require('lodash');
const QRCode = require('qrcode');

const { PAYMENT_REF_LENGTH, ThirdPartyPaymentStatus, Currency } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const { generateQr } = require('@services/vietqr');
const { eventEmitter, EVENTS } = require('@utils/events');

const { throwError, ERROR_CODE } = require('../client/error');

async function createPaymentQr(body) {
	let { otaBookingId, method, otaName, language } = body;

	const dataPayment = await models.Booking.getPayment({ otaBookingId, otaName });
	if (!dataPayment.amount) {
		return throwError(ERROR_CODE.PAYMENT_NOT_FOUND, language);
	}

	const groupIds = dataPayment.bookings[0].groupIds;
	const blockId = dataPayment.bookings[0].blockId;

	const filter = {
		active: true,
		displayOnWeb: true,
	};

	let bank =
		blockId &&
		(await models.BankAccount.findOne(
			_.pickBy({
				...filter,
				blockIds: blockId,
			})
		).populate('bankId'));

	if (!bank) {
		bank = await models.BankAccount.findOne(
			_.pickBy({
				...filter,
				groupIds: groupIds && { $in: groupIds },
				'blockIds.0': { $exists: false },
			})
		).populate('bankId');
	}

	if (!bank) {
		return throwError(ERROR_CODE.DEFAULT, language);
	}

	const orderInfo = `QR code payment for Booking ID ${otaBookingId}`;

	let paymentRef = await models.PaymentRef.findOne({
		otaBookingId,
		otaName,
		method,
		amount: dataPayment.amount,
	});

	if (!paymentRef) {
		paymentRef = await models.PaymentRef.createRef({
			method,
			amount: dataPayment.amount,
			otaBookingId,
			otaName,
			description: orderInfo,
			groupIds: dataPayment.bookings[0].groupIds,
			blockId: dataPayment.bookings[0].blockId,
		});
	}

	if (!paymentRef.qrCode) {
		const info = {
			accountNo: _.get(bank, 'accountNos[0]'),
			accountName: _.get(bank, 'accountName'),
			acqId: _.get(bank.bankId, 'bin'),
			addInfo: `CPO ${paymentRef.ref} ${otaBookingId}`,
			amount: paymentRef.amount,
			template: 'compact',
		};

		const data = await generateQr(info);

		paymentRef.qrCode = data.qrCode;

		await paymentRef.save();
	}

	return {
		data: {
			qrDataURL: await QRCode.toDataURL(paymentRef.qrCode),
		},
		paymentRef,
	};
}

async function onReceivedNewSMSBanking(sms) {
	try {
		if (!sms.transId) return;

		const transaction = await models.BankTransaction.findById(sms.transId);
		if (!transaction) return;

		const description = transaction.data.content || transaction.data.description;
		if (!description) return;

		const detectAutoQR = description.match(`CPO ([0-9a-zA-Z]{${PAYMENT_REF_LENGTH}})`);
		if (!detectAutoQR || !detectAutoQR[1]) return;

		const paymentRef = await models.PaymentRef.findOne({ ref: new RegExp(detectAutoQR[1], 'i') });
		if (!paymentRef || paymentRef.status === ThirdPartyPaymentStatus.SUCCESS) {
			return;
		}

		const booking = await models.Booking.findOne({
			otaName: paymentRef.otaName,
			otaBookingId: paymentRef.otaBookingId,
		}).select('_id blockId');

		const currencyAmount = {
			amount: transaction.meta.amount,
			currency: transaction.meta.currency || Currency.VND,
		};

		await models.Payout.createBookingPayout(null, {
			otaName: paymentRef.otaName,
			// otaId: paymentRef.ref,
			currencyAmount,
			collectorCustomName: transaction.bankName,
			description: `Thanh toán qua QR Code ngân hàng, transaction no: ${transaction.docNo}, orderId: ${paymentRef.ref}`,
			createdAt: new Date(),
			blockIds: [booking.blockId],
			bookingId: booking._id,
			paidAt: transaction.tranTime,
			smsId: sms._id,
		});

		paymentRef.status = ThirdPartyPaymentStatus.SUCCESS;
		paymentRef.transactionNo = transaction.docNo;
		await paymentRef.save();
	} catch (e) {
		logger.error('onReceivedNewSMSBanking', sms, e);
	}
}

async function checkQRPaymentResult(paymentRef) {
	if (paymentRef.status === ThirdPartyPaymentStatus.SUCCESS) {
		return;
	}

	const regex = new RegExp(`CPO ${paymentRef.ref}`, 'i');

	const transaction = await models.BankTransaction.findOne({
		tranTime: { $gte: paymentRef.createdAt },
		$or: [
			{
				'data.content': regex,
			},
			{
				'data.description': regex,
			},
		],
	});

	if (!transaction || !transaction.smsId) return;

	const sms = await models.SMSMessage.findById(transaction.smsId);
	if (!sms || _.get(sms.payoutId, 'length')) return;

	const booking = await models.Booking.findOne({
		otaName: paymentRef.otaName,
		otaBookingId: paymentRef.otaBookingId,
	}).select('_id blockId');

	const currencyAmount = {
		amount: transaction.meta.amount,
		currency: transaction.meta.currency || Currency.VND,
	};

	await models.Payout.createBookingPayout(null, {
		otaName: paymentRef.otaName,
		currencyAmount,
		collectorCustomName: transaction.bankName,
		description: `Thanh toán qua QR Code ngân hàng, transaction no: ${transaction.docNo}, orderId: ${paymentRef.ref}`,
		createdAt: new Date(),
		blockIds: [booking.blockId],
		bookingId: booking._id,
		paidAt: transaction.tranTime,
		smsId: sms._id,
	});

	paymentRef.status = ThirdPartyPaymentStatus.SUCCESS;
	paymentRef.transactionNo = transaction.docNo;
	await paymentRef.save();
}

eventEmitter.on(EVENTS.BANKING_SMS, onReceivedNewSMSBanking);

module.exports = {
	createPaymentQr,
	checkQRPaymentResult,
};

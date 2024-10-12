const _ = require('lodash');
// const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { throwError, ERROR_CODE } = require('../error');

async function sendRefundRequest(body, language) {
	let { bookingId, bankAccountHolder, phone, email, bankAccountNumber, bankCode, note } = body;

	bankAccountHolder = _.trim(bankAccountHolder);
	bankAccountNumber = _.trim(bankAccountNumber);
	bookingId = _.trim(bookingId);
	bankCode = _.trim(bankCode);

	if (!bookingId) {
		return throwError(ERROR_CODE.PAYMENT_BOOKING_NOT_FOUND, language);
		// throw new ThrowReturn('Thiếu mã đặt phòng / The booking code missing!');
	}
	if (!bankAccountHolder) {
		return throwError(ERROR_CODE.CARD_HOLDER_REQURED, language);
		// throw new ThrowReturn('Hãy nhập tên chủ tài khoản / Please enter the account holder name');
	}
	if (!bankAccountNumber) {
		return throwError(ERROR_CODE.CARD_NUMBER_REQURED, language);
		// throw new ThrowReturn('Hãy nhập số tài khoản ngân hàng / Please enter the bank account number ');
	}

	if (!bankCode) {
		return throwError(ERROR_CODE.BANK_INVALID, language);
		// throw new ThrowReturn('Hãy nhập tên ngân hàng / Please enter the bank name');
	}

	const exist = await models.FormRefund.findOne({ bookingId });
	if (exist) {
		return throwError(ERROR_CODE.FORM_ALREADY_SUMITTED, language);
		// throw new ThrowReturn('Mã đặt phòng này đã được gửi trước đó / This booking code already submitted!');
	}

	const bank = await models.Bank.findOne({ bankCode });
	if (!bank) {
		return throwError(ERROR_CODE.BANK_INVALID, language);
		// throw new ThrowReturn('Mã ngân hàng không hợp lệ / Bank code is invalid!!');
	}

	const booking = await models.Booking.findOne({
		$or: [
			{
				_id: bookingId,
			},
			{
				relativeBookings: bookingId,
			},
		],
	}).select('_id blockId');
	if (!booking) {
		return throwError(ERROR_CODE.PAYMENT_BOOKING_NOT_FOUND, language);
		// throw new ThrowReturn('Yêu cầu hoàn tiền không hợp lệ / Refund request is invalid!');
	}

	const refund = new models.FormRefund({
		bookingId,
		phone,
		bankAccountHolder,
		bankAccountNumber,
		bankId: bank._id,
		email,
		note,
	});
	const err = refund.validateSync();

	if (err) {
		throw err;
	}
	await refund.save();

	return { refund, booking };
}

async function searchRefundInfo(otaBookingId) {
	if (!otaBookingId) return null;
	const refund = await models.FormRefund.findOne({ otaBookingId }).select('-note');
	return refund || {};
}

module.exports = { sendRefundRequest, searchRefundInfo };

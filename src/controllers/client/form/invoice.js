const _ = require('lodash');
const moment = require('moment');
const { v4: uuid } = require('uuid');
const path = require('path');
const fs = require('fs');

const { UPLOAD_CONFIG } = require('@config/setting');
// const ThrowReturn = require('@core/throwreturn');
const { compressImage } = require('@utils/compress');
const { BookingStatus } = require('@utils/const');
const { isImage, checkFolder } = require('@utils/file');
const { isEmail } = require('@utils/validate');
const models = require('@models');
const { throwError, ERROR_CODE } = require('../error');

async function sendInvoiceRequest(body, language) {
	let {
		bookingCode,
		checkIn,
		checkOut,
		taxNumber,
		companyName,
		companyAddress,
		email,
		note,
		attachments,
		isExcludeBook = 'true',
		price,
	} = body;

	isExcludeBook = isExcludeBook === 'true';

	if (attachments && !_.isArray(attachments)) {
		attachments = [attachments];
	}
	if (!_.isArray(bookingCode)) {
		bookingCode = _.split(bookingCode, ',')
			.map(s => _.trim(s))
			.filter(s => s);
	}

	try {
		if (!bookingCode.length) {
			return throwError(ERROR_CODE.PAYMENT_BOOKING_NOT_FOUND, language);
			// throw new ThrowReturn('Hãy nhập mã đặt phòng / Please enter the booking code!');
		}
		if (!taxNumber) {
			return throwError(ERROR_CODE.TAX_NUMBER_INVALID, language);
			// throw new ThrowReturn('Hãy nhập mã số thuế / Please enter the tax number!');
		}
		if (!companyName) {
			return throwError(ERROR_CODE.TAX_NUMBER_INVALID, language);
			// throw new ThrowReturn('Hãy nhập tên công ty / Please enter the company name!');
		}
		if (!companyAddress) {
			return throwError(ERROR_CODE.TAX_NUMBER_INVALID, language);
			// throw new ThrowReturn('Hãy nhập địa chỉ công ty / Please enter the comnapy address!');
		}
		if (!email || !isEmail(email)) {
			return throwError(ERROR_CODE.INVALID_GUEST_EMAIL, language);
			// throw new ThrowReturn('Hãy nhập email / Please enter the email!');
		}

		// if (!isEmail(email)) throw new ThrowReturn('Email không hợp lệ / Email is not valid!');
		// if (!checkIn) throw new ThrowReturn('Hãy nhập ngày nhận phòng / Please enter the check-in date!');
		// if (!checkOut) throw new ThrowReturn('Hãy nhập ngày trả phòng / Please enter the check-out date!');
		if (isExcludeBook && (!attachments || !attachments.length)) {
			return throwError(ERROR_CODE.IMAGE_UPLOAD_REQUIRED, language);
			// throw new ThrowReturn('Hãy tải lên ít nhất 1 ảnh / Please upload the attachments!');
		}
		if (isExcludeBook && _.some(attachments, a => !isImage(a))) {
			return throwError(ERROR_CODE.UPLOADED_MUST_BE_IMAGE, language);
			// throw new ThrowReturn(`Tệp đính kèm phải là hình ảnh / The attachments must be image!`);
		}

		// check already sent
		const exists = await models.FormInvoice.findOne({ bookingCode: { $in: bookingCode } });
		if (exists) {
			return throwError(ERROR_CODE.FORM_ALREADY_SUMITTED, language);
			// throw new ThrowReturn('Mã đặt phòng này đã được gửi trước đó / This booking code already submitted!');
		}

		let bookings = [];

		if (bookingCode.length === 1) {
			const booking = await models.Booking.findOne({
				otaBookingId: bookingCode[0],
				status: BookingStatus.CONFIRMED,
				// from: new Date(checkIn).zeroHours(),
				// to: new Date(checkOut).zeroHours(),
			}).select('_id blockId');
			if (!booking) {
				return throwError(ERROR_CODE.PAYMENT_BOOKING_NOT_FOUND, language);
				// throw new ThrowReturn('Mã đặt phòng không hợp lệ / Booking code is invalid!');
			}

			bookings.push(booking);
		} else {
			bookings = await models.Booking.find({
				otaBookingId: bookingCode,
				status: BookingStatus.CONFIRMED,
			}).select('_id otaBookingId blockId');
			const codeInvalid = bookingCode.find(code => !bookings.some(b => b.otaBookingId === code));
			if (codeInvalid) {
				return throwError(ERROR_CODE.INVALID_BOOKING_CODE, language, [codeInvalid]);
				// throw new ThrowReturn(
				// 	`Mã đặt phòng '${codeInvalid}' không hợp lệ / Booking code '${codeInvalid}' is invalid!`
				// );
			}
		}

		const form = new models.FormInvoice({
			bookingCode,
			checkIn,
			checkOut,
			taxNumber,
			companyName,
			companyAddress,
			email,
			note,
			price,
		});
		const err = form.validateSync();
		if (err) {
			throw err;
		}

		if (isExcludeBook) {
			form.attachments = await saveFiles(attachments);
		}
		await form.save();

		return {
			form,
			bookings,
		};
	} finally {
		_.forEach(attachments, a => {
			if (a.tempFilePath) fs.unlink(a.tempFilePath, () => {});
		});
	}
}

async function saveFiles(attachments) {
	const fileDir = `${moment().format('YY/MM/DD')}/form`;
	const dpath = `${UPLOAD_CONFIG.PATH}/${fileDir}`;
	await checkFolder(dpath);

	const attachmentUrls = attachments.asyncMap(async attachment => {
		let fileName = await compressImage(attachment, dpath);
		if (!fileName) {
			fileName = `${uuid()}${path.extname(attachment.name)}`;
			await attachment.mv(`${dpath}/${fileName}`);
		}

		return `${UPLOAD_CONFIG.FULL_URI}/${fileDir}/${fileName}`;
	});

	return attachmentUrls;
}

async function searchInvoiceInfo({ taxNumber }) {
	if (!taxNumber) {
		return null;
	}

	return models.FormInvoice.findOne({ taxNumber })
		.sort({ createdAt: -1 })
		.select('-_id taxNumber companyName companyAddress email');
}

module.exports = {
	sendInvoiceRequest,
	searchInvoiceInfo,
};

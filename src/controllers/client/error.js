const _ = require('lodash');
const ThrowReturn = require('@core/throwreturn');

const ERROR_CODE = {
	DEFAULT: 1,
	OUT_OF_RANGE: 2,
	NOT_FOUND_LISTING: 3,
	INVALID_RANGE: 4,
	NOT_FOUND_PROPERTY: 5,
	PAYMENT_METHOD_INVALID: 6,
	PAYMENT_NOT_FOUND: 7,
	PAYMENT_BOOKING_NOT_FOUND: 8,
	INVALID_ROOM: 9,
	INVALID_GUEST: 10,
	INVALID_GUEST_NAME: 11,
	INVALID_GUEST_PHONE: 12,
	INVALID_GUEST_EMAIL: 13,
	ROOM_IS_FULL: 14,
	INVALID_PARAMS: 15,
	INVALID_ID_CARD: 16,
	FORM_ALREADY_SUMITTED: 17,
	TAX_NUMBER_INVALID: 18,
	COMPANY_NAME_INVALID: 19,
	COMPANY_ADDRESS_INVALID: 20,
	IMAGE_UPLOAD_REQUIRED: 21,
	UPLOADED_MUST_BE_IMAGE: 22,
	INVALID_BOOKING_CODE: 23,
	CARD_HOLDER_REQURED: 24,
	CARD_NUMBER_REQURED: 25,
	BANK_INVALID: 26,
};

const ERROR_MSG = {
	[ERROR_CODE.DEFAULT]: {
		vi: 'Xin lỗi, đã có lỗi xảy ra vui lòng thử lại sau!',
		en: 'Sorry, an error occurred. Please try again later!',
	},
	[ERROR_CODE.OUT_OF_RANGE]: {
		vi: 'Xin lỗi, không thể đặt phòng nhiều hơn %s% đêm!',
		en: 'Sorry, a booking cannot currently be more than %s% nights!',
	},
	[ERROR_CODE.NOT_FOUND_LISTING]: {
		vi: 'Loại phòng này không tồn tại!',
		en: 'This room type does not exist!',
	},
	[ERROR_CODE.INVALID_RANGE]: {
		vi: 'Ngày check-in và check-out không hợp lệ!',
		en: 'Invalid check-in and check-out dates!',
	},
	[ERROR_CODE.NOT_FOUND_PROPERTY]: {
		vi: 'Không tìm thấy thông tin khách sạn này!',
		en: 'This hotel was not found!',
	},
	[ERROR_CODE.PAYMENT_METHOD_INVALID]: {
		vi: 'Xin lỗi, hiện tại không hỗ trợ phương thức thanh toán này!',
		en: 'Sorry, this payment method is not currently supported!',
	},
	[ERROR_CODE.PAYMENT_NOT_FOUND]: {
		vi: 'Xin lỗi, không tìm thấy thông tin thanh toán!',
		en: 'Sorry, no payment information found!',
	},
	[ERROR_CODE.PAYMENT_BOOKING_NOT_FOUND]: {
		vi: 'Xin lỗi, không tìm thấy thông tin đặt phòng!',
		en: 'Sorry, no booking information found!',
	},
	[ERROR_CODE.INVALID_ROOM]: {
		vi: 'Xin lỗi, số lượng phòng không hợp lệ!',
		en: 'Sorry, number of rooms is not valid!',
	},
	[ERROR_CODE.INVALID_GUEST]: {
		vi: 'Xin lỗi, số lượng khách không hợp lệ!',
		en: 'Sorry, number of guests is not valid!',
	},
	[ERROR_CODE.INVALID_GUEST_NAME]: {
		vi: 'Xin lỗi, tên khách hàng không hợp lệ!',
		en: 'Sorry, invalid customer name!',
	},
	[ERROR_CODE.INVALID_GUEST_PHONE]: {
		vi: 'Xin lỗi, số điện thoại không hợp lệ!',
		en: 'Sorry, invalid phone nummber!',
	},
	[ERROR_CODE.INVALID_GUEST_EMAIL]: {
		vi: 'Xin lỗi, Email không hợp lệ!',
		en: 'Sorry, invalid Email!',
	},
	[ERROR_CODE.ROOM_IS_FULL]: {
		vi: 'Xin lỗi, Phòng hiện tại không sẵn có!',
		en: 'Sorry, Room is currently unavailable!',
	},
	[ERROR_CODE.INVALID_PARAMS]: {
		vi: 'Dữ liệu đầu vào không hợp lệ!',
		en: 'Invalid input data!',
	},
	[ERROR_CODE.INVALID_ID_CARD]: {
		vi: 'Xin lỗi, Hộ chiếu/CMND/CCCD không hợp lệ!',
		en: 'Sorry, Passport/ID card is not valid!',
	},
	[ERROR_CODE.FORM_ALREADY_SUMITTED]: {
		vi: 'Xin lỗi, Bạn đã gửi thông tin trước đó rồi!',
		en: 'Sorry, Your information already submitted before!',
	},
	[ERROR_CODE.TAX_NUMBER_INVALID]: {
		vi: 'Xin lỗi, Hãy nhập mã số thuế!',
		en: 'Sorry, Please enter the tax number!',
	},
	[ERROR_CODE.COMPANY_NAME_INVALID]: {
		vi: 'Xin lỗi, Hãy nhập tên công ty!',
		en: 'Sorry, Please enter the company name!',
	},
	[ERROR_CODE.COMPANY_ADDRESS_INVALID]: {
		vi: 'Xin lỗi, Hãy nhập địa chỉ công ty!',
		en: 'Sorry, Please enter the company address!',
	},
	[ERROR_CODE.IMAGE_UPLOAD_REQUIRED]: {
		vi: 'Xin lỗi, Hãy tải lên ít nhất 1 ảnh!',
		en: 'Sorry, Please upload the attachments!',
	},
	[ERROR_CODE.UPLOADED_MUST_BE_IMAGE]: {
		vi: 'Xin lỗi, Tệp đính kèm phải là hình ảnh!',
		en: 'Sorry, The attachments must be an image!',
	},
	[ERROR_CODE.INVALID_BOOKING_CODE]: {
		vi: `Xin lỗi, Mã đặt phòng '%s%' không hợp lệ!`,
		en: `Sorry, Booking code '%s%' is invalid!`,
	},
	[ERROR_CODE.CARD_HOLDER_REQURED]: {
		vi: `Xin lỗi, Hãy nhập tên chủ tài khoản!`,
		en: `Sorry, Please enter the Account Holder Name!`,
	},
	[ERROR_CODE.CARD_NUMBER_REQURED]: {
		vi: `Xin lỗi, Hãy nhập số tài khoản ngân hàng!`,
		en: `Sorry, Please enter the Bank Account Number!`,
	},
	[ERROR_CODE.BANK_INVALID]: {
		vi: `Xin lỗi, Ngân hàng không hợp lệ!`,
		en: `Sorry, Bank code is invalid!`,
	},
};

function throwError(code, lang = 'en', varibles = []) {
	let msg =
		_.get(ERROR_MSG[code], lang) || _.get(ERROR_MSG[code], 'en') || _.get(ERROR_MSG[ERROR_CODE.DEFAULT], lang);

	varibles.forEach(varible => {
		msg = msg.replace('%s%', varible);
	});

	throw new ThrowReturn(msg);
}

module.exports = {
	throwError,
	ERROR_CODE,
};

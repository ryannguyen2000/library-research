const ACTION = {
	START: 'START',
	GET_CAPCHA: 'GET_CAPCHA',
	GET_CAPCHA_DONE: 'GET_CAPCHA_DONE',
	SEND_CAPCHA: 'SEND_CAPCHA',
	SEND_CAPCHA_DONE: 'SEND_CAPCHA_DONE',
	GET_OTP: 'GET_OTP',
	GET_OTP_DONE: 'GET_OTP_DONE',
	SEND_OTP: 'SEND_OTP',
	SEND_OTP_DONE: 'SEND_OTP_DONE',
	GET_FILE: 'GET_FILE',
	GET_FILE_DONE: 'GET_FILE_DONE',
	SUCCESS: 'SUCCESS',
	ERROR: 'ERROR',
	READY: 'READY',
};

const GUEST_LOG_FIELDS = [
	'fullName',
	'name',
	'phone',
	'email',
	'country',
	'lang',
	'tags',
	'passport',
	'passportNumber',
	'address',
	'gender',
	'dayOfBirth',
	'ottIds.facebook',
	'ottIds.whatsapp',
	'ottIds.line',
	'ottIds.telegram',
	'ottIds.zalo',
	'ottIds.zalo_oa',
];

const LOG_FIELDS_LABELS = {
	// ottIds
	fullName: { vi: 'Họ và tên', en: 'Full name' },
	name: { vi: 'Tên', en: 'Name' },
	phone: { vi: 'Số điện thoại', en: 'Phone' },
	email: { vi: 'Email', en: 'Email' },
	country: { vi: 'Quốc gia', en: 'Country' },
	tags: { vi: 'Tags', en: 'Tags' },
	passportNumber: { vi: 'Số hộ chiếu', en: 'Passport number' },
	passport: { vi: 'Hộ chiếu', en: 'Passport' },
	address: { vi: 'Địa chỉ', en: 'Address' },
	gender: { vi: 'Giới tính', en: 'Gender' },
	dayOfBirth: { vi: 'Ngày sinh', en: 'Day of birth' },
	'ottIds.facebook': { vi: 'Facebook', en: 'Facebook' },
	'ottIds.whatsapp': { vi: 'Whatsapp', en: 'Whatsapp' },
	'ottIds.line': { vi: 'Line', en: 'Line' },
	'ottIds.telegram': { vi: 'Telegram', en: 'Telegram' },
	'ottIds.zalo': { vi: 'Zalo', en: 'Zalo' },
	'ottIds.zalo_oa': { vi: 'Zalo OA', en: 'Zalo OA' },
};

const LOG_VALUES_MAPPER = {
	true: { vi: 'Có', en: 'Yes' },
	false: { vi: 'Không', en: 'No' },
	gender: { male: { vi: 'Nam', en: 'Male' }, female: { vi: 'Nữ', en: 'Female' } },
	lang: { vi: 'Tiếng Việt', en: 'English' },
};

module.exports = {
	ACTION,
	GUEST_LOG_FIELDS,
	LOG_FIELDS_LABELS,
	LOG_VALUES_MAPPER,
};

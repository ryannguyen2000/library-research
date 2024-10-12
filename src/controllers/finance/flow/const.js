const { CASH_FLOW_OBJECT } = require('@utils/const');

const OBJECT_NAME = {
	[CASH_FLOW_OBJECT.GUEST]: { vi: 'Khách hàng', en: 'Guests' },
	[CASH_FLOW_OBJECT.UNPAID]: { vi: 'Chưa thu', en: 'Unpaid' },
	[CASH_FLOW_OBJECT.IGNORE_PRICE]: { vi: 'Không tính doanh thu', en: 'Ignore revenue' },
	[CASH_FLOW_OBJECT.COMMISSION_OTA]: { vi: 'Commision OTAs', en: 'Commision OTAs' },
	[CASH_FLOW_OBJECT.COMMISSION_tb]: { vi: 'Commision tb', en: 'Commision tb' },
	[CASH_FLOW_OBJECT.OTA_COLLECT]: { vi: 'OTAs', en: 'OTAs' },
	[CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT]: { vi: 'Trung gian thanh toán', en: 'Third party payment' },
	[CASH_FLOW_OBJECT.B2B]: { vi: 'B2B', en: 'B2B' },
	[CASH_FLOW_OBJECT.TRANSACTION_FEE]: { vi: 'Phí thanh toán', en: 'Transaction fee' },
	[CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM]: {
		vi: 'Chờ kế toán xác nhận',
		en: 'Wait for accountant to confirm',
	},
	[CASH_FLOW_OBJECT.USER_CONFIRMED]: { vi: 'Nhân viên đã xác nhận', en: 'User confirmed' },
	[CASH_FLOW_OBJECT.USER_UNCONFIRMED]: { vi: 'Nhân viên chưa xác nhận', en: 'User unconfirmed' },
	[CASH_FLOW_OBJECT.CASHIER]: { vi: 'Sổ quỹ offline', en: 'Cash box' },
	[CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT]: { vi: 'Tài khoản thu chi hộ công ty', en: `Company's Bank account` },
	[CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT]: { vi: 'Tài khoản chủ nhà', en: `Host's Bank account` },
	[CASH_FLOW_OBJECT.CASH_FUND]: { vi: 'Sổ tiền mặt công ty', en: 'Cash fund' },
	[CASH_FLOW_OBJECT.HOST_CASH_FUND]: { vi: 'Sổ tiền mặt chủ nhà', en: `Host's Cash fund` },
	[CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND]: { vi: 'Sổ ứng lương công ty', en: 'Salary advance fund' },
	[CASH_FLOW_OBJECT.BACKUP_CASH_FUND]: { vi: 'Sổ tiền dự phòng rủi ro', en: 'Risk fund' },
	[CASH_FLOW_OBJECT.SERVICES]: { vi: 'Điện nước & dịch vụ', en: 'Services' },
	[CASH_FLOW_OBJECT.TAX]: { vi: 'Thuế thu nhập', en: 'Revenue tax' },
	[CASH_FLOW_OBJECT.HOST_INCOME]: { vi: 'Thu nhập của chủ nhà', en: 'Host income' },
	[CASH_FLOW_OBJECT.MANAGE_FEE]: { vi: 'Chi phí vận hành tb', en: 'Manage fee' },
	[CASH_FLOW_OBJECT.MAINTENANCE]: { vi: 'Đối tác bảo trì', en: 'Maintenance' },
	[CASH_FLOW_OBJECT.BUY_EQUIPMENT]: { vi: 'Đối tác mua trang thiết bị', en: 'Buy equipment' },
	[CASH_FLOW_OBJECT.OTHER_FEE]: { vi: 'Chi phí khác', en: 'Other fees' },
	[CASH_FLOW_OBJECT.REFUND]: { vi: 'Sổ hoàn tiền', en: 'Refund' },
	[CASH_FLOW_OBJECT.GUEST_REFUNDED]: { vi: 'Hoàn tiền khách hàng', en: 'Guest Refunded' },
};

const GROUP_KEY = {
	SOURCE: 'SOURCE',
	PARTNER: 'PARTNER',
	USER: 'USER',
	COMPANY: 'COMPANY',
	EXPANSE: 'EXPANSE',
};
const GROUP_NAME = {
	SOURCE: { vi: '', en: '' },
	PARTNER: { vi: 'Đối tác', en: 'Partners' },
	USER: { vi: 'Nhân viên và nội bộ', en: 'Staffs and Internal' },
	COMPANY: { vi: 'Công ty', en: 'Company' },
	EXPANSE: { vi: 'Chi phí', en: 'Expenses' },
};

const GROUP = [
	{
		key: GROUP_KEY.SOURCE,
		objects: [
			CASH_FLOW_OBJECT.GUEST,
			CASH_FLOW_OBJECT.UNPAID,
			CASH_FLOW_OBJECT.GUEST_REFUNDED,
			CASH_FLOW_OBJECT.IGNORE_PRICE,
		],
	},
	{
		key: GROUP_KEY.PARTNER,
		objects: [
			CASH_FLOW_OBJECT.COMMISSION_tb,
			CASH_FLOW_OBJECT.COMMISSION_OTA,
			CASH_FLOW_OBJECT.OTA_COLLECT,
			CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT,
			CASH_FLOW_OBJECT.B2B,
			CASH_FLOW_OBJECT.TRANSACTION_FEE,
		],
	},
	{
		key: GROUP_KEY.USER,
		objects: [
			CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
			CASH_FLOW_OBJECT.USER_UNCONFIRMED,
			CASH_FLOW_OBJECT.USER_CONFIRMED,
			CASH_FLOW_OBJECT.CASHIER,
		],
	},
	{
		key: GROUP_KEY.COMPANY,
		objects: [
			CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
			CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
			CASH_FLOW_OBJECT.CASH_FUND,
			CASH_FLOW_OBJECT.HOST_CASH_FUND,
			CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND,
			CASH_FLOW_OBJECT.REFUND,
			CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
		],
	},
];

const GROUP_WITH_EXPENSE = [
	{
		key: GROUP_KEY.SOURCE,
		objects: [
			CASH_FLOW_OBJECT.GUEST,
			CASH_FLOW_OBJECT.UNPAID,
			CASH_FLOW_OBJECT.GUEST_REFUNDED,
			CASH_FLOW_OBJECT.IGNORE_PRICE,
		],
	},
	{
		key: GROUP_KEY.PARTNER,
		objects: [
			// CASH_FLOW_OBJECT.COMMISSION_OTA,
			CASH_FLOW_OBJECT.OTA_COLLECT,
			CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT,
			CASH_FLOW_OBJECT.B2B,
			// CASH_FLOW_OBJECT.TRANSACTION_FEE,
		],
	},
	{
		key: GROUP_KEY.USER,
		objects: [
			CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
			CASH_FLOW_OBJECT.USER_UNCONFIRMED,
			CASH_FLOW_OBJECT.USER_CONFIRMED,
			CASH_FLOW_OBJECT.CASHIER,
		],
	},
	{
		key: GROUP_KEY.COMPANY,
		objects: [
			CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
			CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
			CASH_FLOW_OBJECT.CASH_FUND,
			CASH_FLOW_OBJECT.HOST_CASH_FUND,
			CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND,
			CASH_FLOW_OBJECT.REFUND,
			CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
		],
	},
	{
		key: GROUP_KEY.EXPANSE,
		objects: [
			CASH_FLOW_OBJECT.COMMISSION_OTA,
			CASH_FLOW_OBJECT.COMMISSION_tb,
			CASH_FLOW_OBJECT.TRANSACTION_FEE,
			CASH_FLOW_OBJECT.TAX,
			CASH_FLOW_OBJECT.HOST_INCOME,
			CASH_FLOW_OBJECT.MANAGE_FEE,
			CASH_FLOW_OBJECT.SERVICES,
			CASH_FLOW_OBJECT.MAINTENANCE,
			CASH_FLOW_OBJECT.BUY_EQUIPMENT,
			CASH_FLOW_OBJECT.OTHER_FEE,
		],
	},
];

const REVENUE_OBJECTS = [
	CASH_FLOW_OBJECT.HOST_CASH_FUND,
	CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
	CASH_FLOW_OBJECT.CASH_FUND,
	CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
];

const DETAIL_GROUP_KEY = {
	OTA: 'OTA',
	PAYMENT_COLLECTOR: 'PAYMENT_COLLECTOR',
	HOME: 'HOME',
	USER_COLLECT: 'USER_COLLECT',
};

module.exports = {
	OBJECT_NAME,
	GROUP,
	GROUP_WITH_EXPENSE,
	GROUP_NAME,
	REVENUE_OBJECTS,
	DETAIL_GROUP_KEY,
};

const { CurrencyConvert, LANGUAGE, TaskTags, UserRoles } = require('@utils/const');

const Settings = {
	CurrencyExchange: {
		key: 'CurrencyExchange',
		value: CurrencyConvert.USD,
		description: 'Tỷ giá USD so với VND',
		title: 'Tỷ giá USD',
		constSettingPath: 'CurrencyConvert.USD',
	},
	BuyCurrencyExchange: {
		key: 'BuyCurrencyExchange',
		value: CurrencyConvert.USD,
		description: 'Tỷ giá mua USD so với VND',
		title: 'Tỷ giá mua USD',
	},
	BuyEURCurrencyExchange: {
		key: 'BuyEURCurrencyExchange',
		value: CurrencyConvert.EUR,
		description: 'Tỷ giá mua EUR so với VND',
		title: 'Tỷ giá mua EUR',
		constSettingPath: 'CurrencyConvert.EUR',
	},
	TaxReport: {
		key: 'TaxReport',
		value: 0.07,
		readOnly: true,
	},
	AutoResolveOverbook: {
		key: 'AutoResolveOverbook',
		value: false,
		readOnly: true,
	},
	MinNightsForFreeCleaningTask: {
		key: 'MinNightsForFreeCleaningTask',
		value: 4,
		description: 'đơn vị tính bằng số đêm',
		title: 'Số đêm tối thiểu để tạo nhiệm vụ dọn phòng',
	},
	TimeoutForResetPasscode: {
		key: 'TimeoutForResetPasscode',
		value: 20,
		description: 'đơn vị tính bằng phút',
		title: 'Thời gian mã cổng còn hiệu lực sau khi check-in',
	},
	ShortPaymentExpirationTime: {
		key: 'ShortPaymentExpirationTime',
		value: 180,
		description: 'Ngày đặt phòng trùng với ngày check-in (phút)',
		title: 'Thời gian huỷ đặt phòng Non-refundable trong ngày',
	},
	LongPaymentExpirationTime: {
		key: 'LongPaymentExpirationTime',
		value: 180,
		description: 'Ngày đặt phòng khác với ngày check-in (phút)',
		title: 'Thời gian huỷ đặt phòng Non-refundable khác ngày',
	},
	MinDayShowGuide: {
		key: 'MinDayShowGuide',
		value: 0,
		description: '(ngày)',
		title: 'Số ngày hiển thị check-in guide trước ngày check-in',
	},
	VATFee: {
		key: 'VATFee',
		value: 8,
		description: '%',
		title: 'Phí VAT',
	},
	DaysForSyncPrice: {
		key: 'DaysForSyncPrice',
		value: 365,
		description: 'ngày',
		title: 'Số ngày tối đa để đồng bộ giá',
	},
	DaysForCrawlerBookings: {
		key: 'DaysForCrawlerBookings',
		value: 365,
		description: 'ngày',
		title: 'Số ngày tối đa để crawler bookings',
	},
	NationalCode: {
		key: 'NationalCode',
		value: 'VN',
		language: LANGUAGE.VI,
		description: 'alpha2',
		title: 'Mã quốc gia',
	},
	Hotline: {
		key: 'Hotline',
		value: '+84906239899',
		title: 'Số hotline',
	},
	DayStartTime: {
		key: 'DayStartTime',
		value: '07:30',
		title: 'Thời gian bắt đầu hoạt động',
	},
	DayEndTime: {
		key: 'DayEndTime',
		value: '23:30',
		title: 'Thời gian ngừng hoạt động',
	},
	PhoneToSendCoop: {
		key: 'PhoneToSendCoop',
		value: '', // format: {ottName1}#{phone1};{ottName2}#{phone2}...
		title: 'Sđt gửi thông tin hợp tác',
	},
	// NEWCS
	MaxCallOut: {
		key: 'MaxCallOut',
		value: 2,
		title: 'Số lần gọi tối đa lúc xác nhận đặt phòng',
	},
	MaxSendMessage: {
		key: 'MaxSendMessage',
		value: 3,
		title: 'Số lần gửi tin nhắn tối đa lúc xác nhận đặt phòng',
	},
	DelayForReCallAfterIn: {
		key: 'DelayForReCallAfterIn',
		value: 20,
		title: 'Thời gian gọi lại với đặt phòng sau giờ checkin (phút)',
	},
	DelayForReCallBeforeIn: {
		key: 'DelayForReCallBeforeIn',
		value: 60,
		title: 'Thời gian gọi lại với đặt phòng trước giờ checkin (phút)',
	},
	DelayForReSendAfterIn: {
		key: 'DelayForReSendAfterIn',
		value: 10,
		title: 'Thời gian gửi lại tin nhắn với đặt phòng sau giờ checkin (phút)',
	},
	DelayForReSendBeforeIn: {
		key: 'DelayForReSendBeforeIn',
		value: 30,
		title: 'Thời gian gửi lại tin nhắn với đặt phòng trước giờ checkin (phút)',
	},
	DelayForReCallGuide: {
		key: 'DelayForReCallGuide',
		value: 60,
		title: 'Thời gian gọi lại với đặt phòng cần chốt guide (phút)',
	},
	CalendarAccessTime: {
		key: 'CalendarAccessTime',
		value: 300,
		title: 'Thời gian cần xác thực lại yêu cầu truy cập lịch (giây)',
	},
	LimitAdvSalary: {
		key: 'LimitAdvSalary',
		value: 6000000,
		title: 'Giá trị ứng lương tối đa (vnđ)',
	},
	PaymentRoundingValue: {
		key: 'PaymentRoundingValue',
		value: 1000,
		title: 'Giá trị thanh toán chênh lệch có thể làm tròn (VNĐ)',
	},
	ZaloDefaultSelectors: {
		key: 'DefautMessageSelector',
		value: [{ value: 1, label: 'Nhiệm vụ PCCC', type: TaskTags.PCCC }],
		title: 'Danh sách chức năng tự động trên Zalo',
	},
	DefaultPayRemark: {
		key: 'DefaultPayRemark',
		value: 'tb CHUYEN KHOAN',
		title: 'ND chuyển khoản mặc định nếu để trống',
	},
	NeedApproveForUpdateBookingPrice: {
		key: 'NeedApproveForUpdateBookingPrice',
		value: true,
		title: 'Cần xác nhận trước khi cập nhật giá đặt phòng',
		groupSeparate: true,
	},
	MaxAmountForApprovePayRequestThrowMsg: {
		key: 'MaxAmountForApprovePayRequestThrowMsg',
		value: 50000000,
		title: 'Số tiền tối đa có thể xác nhận chi qua tin nhắn',
	},
	OwnerNotificationConfig: {
		key: 'OwnerNotificationConfig',
		value: {
			sendForRoles: [UserRoles.CDT_OWNER, UserRoles.CDT_OWNER_ND],
		},
		title: 'Cấu Hình gửi thông báo cho chủ nhà',
	},
	MaxAmountPerPayout: {
		key: 'MaxAmountPerPayout',
		value: 450000000,
		title: 'Số tiền tối đa cho mỗi chi phí',
	},
	ActiveAutoChargeNonRefundable: {
		key: 'ActiveAutoChargeNonRefundable',
		value: false,
		title: 'Tự động charge đặt phòng non-refund booking.com',
	},
};

module.exports = {
	Settings,
};

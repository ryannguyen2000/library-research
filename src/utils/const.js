const OTAs = {
	Cozrum: 'cozrum',
	CozrumWeb: 'cozrum.com',
	CozrumExtend: 'cozrum_extend',
	OwnerExtend: 'owner_extend',
	Famiroom: 'famiroom',
	Agoda: 'agoda',
	Airbnb: 'airbnb',
	Booking: 'booking',
	Expedia: 'expedia',
	Luxstay: 'luxstay',
	Vrbo: 'vrbo',
	Vntrip: 'vntrip',
	Traveloka: 'traveloka',
	Grabhotel: 'grabhotel',
	Go2joy: 'go2joy',
	Ctrip: 'ctrip',
	Tripi: 'tripi',
	Mytour: 'mytour',
	Quickstay: 'quickstay',
	TA: 'TA',
	Facebook: 'facebook',
	Zalo: 'zalo',
	ZaloOA: 'zalo_oa',
	WhatsApp: 'whatsapp',
	iMessage: 'imessage',
	SMS: 'sms',
	Telegram: 'telegram',
	Line: 'line',
	Tiket: 'tiket',
};
const LocalOTA = OTAs.Cozrum;

const BookingStatus = {
	CONFIRMED: 'confirmed',
	REQUEST: 'request',
	CANCELED: 'canceled',
	DECLINED: 'declined',
	NOSHOW: 'noshow',
	CHARGED: 'charged',
};

const ContractStatus = {
	CONFIRMED: 'confirmed',
	CANCELED: 'canceled',
};

const CurrencyConvert = {
	VND: 1,
	USD: 23187,
	EUR: 25209,
	IDR: 1.57,
};

const LANGUAGE = {
	VI: 'vi',
	EN: 'en',
};

const Services = {
	Hour: 1,
	Night: 2,
	Day: 3,
	Month: 4,
};

module.exports = Object.freeze({
	LocalOTA,
	LocalOTAs: {
		Cozrum: OTAs.Cozrum,
		CozrumWeb: OTAs.CozrumWeb,
		CozrumExtend: OTAs.CozrumExtend,
	},
	OTAs,
	OTTs: {
		Facebook: OTAs.Facebook,
		Zalo: OTAs.Zalo,
		ZaloOA: OTAs.ZaloOA,
		WhatsApp: OTAs.WhatsApp,
		// iMessage: OTAs.iMessage,
		Telegram: OTAs.Telegram,
		Line: OTAs.Line,
		// SMS: OTAs.SMS,
	},

	DefaultCommission: {
		[OTAs.Booking]: 15,
		[OTAs.Agoda]: 20,
		[OTAs.Expedia]: 20,
		[OTAs.Ctrip]: 20,
	},

	OTAHasGeniusPromotion: [OTAs.Booking],
	OTANotHaveProperty: [OTAs.Cozrum, OTAs.CozrumWeb, OTAs.Airbnb, OTAs.Luxstay],
	OTAsHavePrePaid: [
		OTAs.Agoda,
		OTAs.Airbnb,
		OTAs.Traveloka,
		OTAs.Expedia,
		OTAs.Luxstay,
		OTAs.Grabhotel,
		OTAs.Go2joy,
		OTAs.Ctrip,
		OTAs.Mytour,
		OTAs.Tiket,
	],

	OTAsListingConfig: {
		[OTAs.Airbnb]: { multiRooms: true },
		[OTAs.Booking]: { multiRooms: true },
		[OTAs.Luxstay]: { multiRooms: false },
		[OTAs.Expedia]: { multiRooms: true },
		[OTAs.Vrbo]: { multiRooms: false },
		[OTAs.Vntrip]: { multiRooms: true },
		[OTAs.Agoda]: {
			multiRooms: true,
			USER_SENDER_ID: 10,
			HOST_SENDER_ID: 21,
			OTA_SENDER_ID: 11,
			HostSender: 'host',
			GuestSender: 'guest',
		},
		[OTAs.Traveloka]: { multiRooms: true },
		[OTAs.Ctrip]: { multiRooms: true },
		[OTAs.Tripi]: { multiRooms: true },
		[OTAs.Grabhotel]: { multiRooms: true },
		[OTAs.Go2joy]: { multiRooms: true },
		[OTAs.Mytour]: { multiRooms: true },
		[OTAs.Quickstay]: { multiRooms: true },
		[OTAs.Tiket]: { multiRooms: true },
	},

	AcceleratorOTAs: [OTAs.Agoda, OTAs.Booking, OTAs.Expedia, OTAs.Ctrip],
	AcceleratorDayType: {
		Allday: 'allday',
		Weekday: 'weekday',
		Weekend: 'weekend',
	},

	RuleDay: {
		from: '14:00',
		to: '12:00',
	},

	RuleDelay: 30, // unit: minute. range between 2 reservation

	RuleOvernight: {
		from: '22:00',
		to: '12:00',
		openHour: '08:00',
	},

	RuleHour: {
		openHour: '06:00',
		closeHour: '22:00',
		maxHour: 10,
		minHour: 1,
		firstHours: 1,
	},

	StringeeType: {
		SMS: 'sms',
		Stringee: 'stringee',
	},

	StringeeStatus: {
		MISSED: 'MISSED',
		CALL_IN: 'CALL_IN',
		CALL_OUT: 'CALL_OUT',
	},
	MailAccountStatus: {
		LOG_IN: 'log_in',
		LOG_OUT: 'log_out',
	},

	SMSBankingPhones: ['VietinBank', 'BIDV', 'Techcombank', 'Vietcombank', 'MBBank'],

	Services,

	ContractType: {
		Person: 1,
		Company: 2,
		Extend: 3,
		Sale: 4,
		Others: 5,
	},

	VirtualBookingPhone: [
		'2035640799',
		'578748874',
		'10107888',
		'75582628521',
		'442036847925',
		'862160781960',
		'842444581647',
		'442039293737',
	],

	Currency: {
		USD: 'USD',
		VND: 'VND',
		EUR: 'EUR',
		IDR: 'IDR',
	},

	DefaultManageFee: {
		longTerm: 0.15,
		shortTerm: 0.25,
		hasTax: true,
		hasVAT: false,
	},

	// DefaultRateId: 'default',

	UserRoles: {
		ADMIN: 'ADMIN',
		HOST: 'HOST',
		ANONYMOUS: 'ANONYMOUS',
		ACCOUNTANT: 'ACCOUNTANT',
		MANAGER: 'MANAGER',
		LEADER: 'HOST_LEADER',
		MAID: 'MAID',
		REPAIRER: 'REPAIRER',
		MARKETING: 'MARKETING',
		CDT_OWNER: 'CDT_OWNER',
		CDT_TA: 'CDT_TA',
		CDT_HOST: 'CDT_HOST',
		CDT_OWNER_ND: 'CDT_OWNER_ND',
	},

	RolePermissons: {
		INBOX_UNKNOWN_HIDDEN: 'INBOX_UNKNOWN_HIDDEN',
		TASK_STATUS_ONLY: 'TASK_STATUS_ONLY',
		TASK: 'TASK',
		RESERVATION: 'RESERVATION',
		BOOKING: 'BOOKING',
		SMS_MONEY_VIEW: 'SMS_MONEY_VIEW',
		ANONYMOUS: 'ANONYMOUS',
		ROOT: 'ROOT',
		CALLING: 'CALLING',
		SMS: 'SMS',
		INBOX: 'INBOX',
		CAMERA: 'CAMERA',
		IGNORE_CHECK_CALENDAR: 'IGNORE_CHECK_CALENDAR',
		APPROVER_UPDATE_BOOKING_PRICE: 'APPROVER_UPDATE_BOOKING_PRICE',
		FINANCE: 'FINANCE',
		FINANCE_APPROVE_PAY: 'FINANCE_APPROVE_PAY',
		FINANCE_APPROVE_REPORT: 'FINANCE_APPROVE_REPORT',
		FINANCE_APPROVE_PAYOUT: 'FINANCE_APPROVE_PAYOUT',
		VIEW_PAYROLL: 'VIEW_PAYROLL',
	},

	InboxType: {
		RESERVATION: 'reservation',
		RESERVATION_ERROR: 'reservation_error',
		RESERVATION_UPDATE: 'reservation_update',
		CANCELED: 'canceled',
		MESSAGE: 'message',
		TASK: 'task',
		SMS: 'sms',
		REMINDER: 'reminder',
		DOOR_ACCESS: 'door_access',
		CALLING: 'calling',
	},

	AutoEvents: {
		Inquiry: 'Inquiry',
		Confirmed: 'Confirmed',
		Updated: 'Updated',
		Canceled: 'Canceled',
		Noshow: 'Noshow',
		CheckIn: 'CheckIn',
		CheckOut: 'CheckOut',
		Payment: 'Payment',
		CheckCheckIn: 'CheckCheckIn',
		TaskCreate: 'TaskCreate',
	},

	AutoTemplates: {
		Reservation: 'reservation',
		ReservationConfirmed: 'reservation_confirmed',
		ReservationCanceled: 'reservation_canceled',
		Guide: 'guide',
		AfterCheckIn: 'afterCheckIn',
		PreCheckOut: 'preCheckout',
		Review: 'review',
		CheckCheckIn: 'checkCheckIn',
		CreateCleaningTask: 'createCleaningTask',
		UpdateCleaningTask: 'updateCleaningTask',
		BookingChargedAuto: 'booking_charged_auto',
	},

	MessageAutoType: {
		HOST_GROUP: 'host_group',
		GUEST: 'guest',
		CDT_OWNER: 'cdt_owner',
	},

	MessageUser: {
		ME: 'me',
		GUEST: 'guest',
		BOT: 'BOT',
	},

	MessageGroupEvent: {
		CHECK_IN: 'CheckIn',
		CHECK_OUT: 'CheckOut',
		CONFIRMED: 'Confirmed',
		CANCELED: 'Canceled',
		NOSHOW: 'Noshow',
		PAYMENT: 'Payment',
	},

	MessageGroupType: {
		INTERNAL: 'internal',
		HOST: 'host',
	},

	MessageGroupInternalType: {
		ASSET_REPORT: 'asset_report',
		CONTRACT_ZALO: 'contract_zalo',
		VOUCHER_ZALO: 'voucher_zalo',
		PAY_REQUEST: 'pay_request',
		REFUND: 'refund',
	},

	MessageVariable: {
		GUEST: {
			text: '%GUEST%',
			description: 'Tên khách hàng',
		},
		GUIDE: {
			text: '%GUIDE%',
			description: 'Guide check in',
		},
		BOOKING_CODE: {
			text: '%BOOKING_CODE%',
		},
		BOOKING_PRICE: {
			text: '%BOOKING_PRICE%',
		},
		BOOKING_PAYMENT_STATUS: {
			text: '%BOOKING_PAYMENT_STATUS%',
		},
		OTA: {
			text: '%OTA%',
		},
		ROOM: {
			text: '%ROOM%',
		},
		PROPERTY_NAME: {
			text: '%PROPERTY_NAME%',
		},
		PAYMENT_AMOUNT: {
			text: '%PAYMENT_AMOUNT%',
		},
		TIME_EXPIRATION: {
			text: '%TIME_EXPIRATION%', // Thời gian để huỷ phòng non-refundable
		},
		PAYMENT_URL: {
			text: '%PAYMENT_URL%',
		},
		REFUND_URL: {
			text: '%REFUND_URL%',
		},
		DATE: {
			text: '%DATE%',
		},
		QUANTITY: {
			text: '%QUANTITY%',
			description: 'Số lượng',
		},
		FEE_AMOUNT: {
			text: '%FEE_AMOUNT%',
		},
		BANK_INFO: {
			text: '%BANK_INFO%',
		},
		URL: {
			text: '%URL%',
		},
		IMAGE: {
			text: '%IMAGE%',
		},
		UPDATING_PRICE_LIST_VI: {
			text: '%UPDATING_PRICE_LIST_VI%',
			description: 'Danh sách giá cập nhật',
		},
		UPDATING_PRICE_LIST_EN: {
			text: '%UPDATING_PRICE_LIST_EN%',
			description: 'Danh sách giá cập nhật',
		},
		CLEANING_DATES: {
			text: '%CLEANING_DATES%', // Ngày dọn dẹp của task tự động
		},
		HOTLINE: {
			text: '%HOTLINE%', // hotline
		},
		ZALO_NUMBER: {
			text: '%ZALO_NUMBER%', // zalo number
		},
		FROM: {
			text: '%FROM%',
		},
		TO: {
			text: '%TO%',
		},
		OTA_FEE: {
			text: '%OTA_FEE%',
		},
		PRICE: {
			text: '%PRICE%',
		},
		TASK_REASON: {
			text: '%TASK_REASON%',
		},
		PAYMENT_METHOD: {
			text: '%PAYMENT_METHOD%',
		},
		USER: {
			text: '%USER%',
		},
		MANAGER: {
			text: '%MANAGER%',
		},
		DC_NO: {
			text: '%DC_NO%', // Mã phiếu chi
		},
		LC_NO: {
			text: '%LC_NO%', // Mã lệnh chi
		},
	},
	MessageStatus: {
		NONE: 'none',
		REQUEST: 'request',
		EVENT: 'event',
	},

	MessageSentType: {
		PAYMENT_CONFIRMATION: 'payment_confirmation',
		PAYMENT_SA_CONFIRMATION: 'payment_sa_confirmation',
		PAY_REQUEST_CONFIRMATION: 'pay_request_confirmation',
		REFUND_REQUEST_CONFIRMATION: 'refund_request_confirmation',
	},

	CurrencyConvert,

	Errors: {
		RoomNotAvailable: 3001,
	},

	BookingStatus,
	BookingStatusCanceled: [
		BookingStatus.CANCELED,
		BookingStatus.NOSHOW,
		BookingStatus.CHARGED,
		BookingStatus.DECLINED,
	],
	ContractStatus,

	BookingFees: {
		PAY_AT_PROPERTY: 'pay_at_property',
	},

	BookingStatusOrder: {
		canceled: 0,
		declined: 1,
		request: 2,
		confirmed: 3,
	},

	BookingHistoryType: {
		CheckInTime: 1,
	},

	BookingCheckinType: {
		P: 'P', // password webpass
		C: 'C', // card webpass
		A: 'A', // auto
		M: 'M', // message from group
		RC: 'RC', // card rfid
		SC: 'SC',
	},

	BookingAskReview: {
		NOT_YET: 'NOT_YET',
		ASKED: 'ASKED',
		OTHER: 'OTHER',
	},

	BookingGuideStatus: {
		CantContact: 0,
		WaitingForResponse: 1,
		Responding: 2,
		Done: 3,
	},

	BookingGuideDoneStatus: {
		Sent: 1,
		Called: 2,
		CantContact: 3,
		PayAtProperty: 4,
		PayAtHotel: 5,
		Paid: 6,
		GuestVIP: 7,
		FollowPayment: 8,
		ByUser: 9,
	},

	BookingCallStatus: {
		None: 0,
		NeedCall: 1,
		NeedCallForGuide: 2,
		NeedCallForConfirmation: 3,
	},

	BookingTimeInOutStatus: {
		None: 0,
		DoneIn: 1,
		Done: 2,
	},

	BookingQueueCancellation: {
		None: 0,
		NeedCancel: 1,
	},

	BookingPaymentStatus: {
		NoInfo: 0,
		Auto: 1,
		Banking: 2,
		PayAtProperty: 3, // thanh toán tại nhà (cần ng tới thu tiền)
		PayAtHotel: 4, // thanh toán tại quầy
		Loan: 5,
	},

	BookingPaymentSubStatus: {
		None: 0,
		NeedMark: 1,
		WaitForCheck: 2,
		WaitForRefund: 3,
		CheckedInAndNeedContact: 4,
		Collecting: 5,
		CheckedInAndNoPayment: 6,
		Canceled: 7,
		NeedCancel: 8,
	},

	BookingPaymentCollectType: {
		None: 0,
		DomesticCurrency: 1,
		ForeignCurrency: 2,
		Card: 2,
	},

	BookingContactOTAStatus: {
		None: 0,
		CantContactGuest: 1,
		Noshow: 2,
		Canceled: 3,
	},

	ProblemStatus: {
		Pending: 'pending',
		Doing: 'doing', // Kỹ thuật đã tiếp nhận
		WaitingForPartnerFix: 'waitingForPartnerFix', // Chờ đối tác xử lý
		DoingManyTimes: 'doingManyTimes', // Xử lý nhiều lần
		CheckoutAndNotDone: 'checkoutAndNotDone', // Chưa xử lý xong nhưng khách đã check out
		Done: 'done',
		Closed: 'closed',
	},

	BookingStatusKeys: {
		GuideStatus: 'guideStatus',
		GuideDoneStatus: 'guideDoneStatus',
		CallStatus: 'callStatus',
		TimeInOutStatus: 'timeInOutStatus',
		ContactOTAStatus: 'contactOTAStatus',
		QueueCancellationStatus: 'queueCancellationStatus',
		PaymentStatus: 'paymentStatus',
		PaymentSubStatus: 'paymentSubStatus',
		PaymentDone: 'paymentDone',
		PaymentCollectType: 'paymentCollectType',
		ProblemStatus: 'problemStatus',
	},

	REASON_UPDATING_TYPE: {
		BOOKING_PRICE: 'BOOKING_PRICE',
		REFUND: 'REFUND',
	},

	PropertyCIType: {
		Receptionist: 'receptionist',
		Security: 'security',
	},

	RateDiscountType: {
		Percentage: 'percentage',
		Amount: 'amount',
	},

	ONE_DAY: 24 * 60 * 60 * 1000,
	ONE_HOUR: 1 * 60 * 60 * 1000,
	ONE_MINUTE: 60 * 1000,
	DEFAULT_TIME_ZONE: -420,
	MAX_RUN_SYNC_PRICE: 2,
	MAX_RUN_CRAWLER: 2,
	DELAY_MINUTE_CHECK_HEADER: 5,

	PayoutType: {
		// for fee
		PAY: 'pay',
		PREPAID: 'prepaid',
		// for revenue
		RESERVATION: 'reservation',
		SERVICE: 'service',
		DEPOSIT: 'deposit',
		REFUND: 'refund',
		OTHER: 'other',
		VAT: 'vat',

		CURRENCY_EXCHANGE: 'currency_exchange',
	},

	PayoutTypeCode: {
		reservation: 'HU',
		pay: 'DC',
		prepaid: 'TU',
	},

	PayoutStates: {
		PROCESSING: 'processing',
		TRANSFERRED: 'transferred',

		PRE_CONFIRMED: 'pre_confirmed',
		APPROVE: 'approve',
		CONFIRMED: 'confirmed',
		PAID: 'paid',

		// states use for prepaid type
		PRE_CONFIRMED_2: 'pre_confirmed_2',
		APPROVE_2: 'approve_2',
		CONFIRMED_2: 'confirmed_2',
		PAID_2: 'paid_2',

		DELETED: 'deleted',
	},

	TransactionStatus: {
		WAITING: 'WAITING',
		WAIT_FOR_APPROVE: 'WAIT_FOR_APPROVE',
		PROCESSING: 'PROCESSING',
		SUCCESS: 'SUCCESS',
		ERROR: 'ERROR',
		DELETED: 'DELETED',
		DECLINED: 'DECLINED',
	},

	TransactionTypes: {
		DEBIT: 'debit',
		CREDIT: 'credit',
	},

	PayoutSources: {
		BANKING: 'banking',
		PERSONAL_BANKING: 'personal_banking',
		SWIPE_CARD: 'swipe_card',
		CASH: 'cash',
		VOUCHER: 'voucher',
		ONLINE_WALLET: 'online_wallet',
		THIRD_PARTY: 'third_party',
		SUBTRACT_DEPOSIT: 'subtract_deposit',
		BACKUP_CASH: 'backup_cash',
	},

	PayoutPayMethods: {
		VIET_QR: 'viet_qr',
		AUTO_BANKING: 'auto_banking',
		MANUAL_BANKING: 'manual_banking',
		FILE_BULK: 'file_bulk',
	},

	PayoutPaySources: {
		Zalo: 'zalo',
		Cms: 'cms',
		BankApp: 'bank_app',
	},

	PayoutAutoTypes: {
		BOOKING_COMMISSION: 'booking_commission',
		EXPEDIA_COMMISSION: 'expedia_commission',
		PAYROLL: 'payroll',
		ELECTRIC: 'electric',
		WATER: 'water',
		REVENUE_SHARE: 'revenue_share',
		TASK: 'task',
		CUSTOM: 'custom',
	},

	PayoutCollector: {
		GUEST: 'guest',
		AGODA: 'agoda',
		USER: 'user',
		PAYDI: 'paydi',
	},

	PayoutCard: {
		VISA: 'VISA',
		MASTERCARD: 'MASTERCARD',
		JCB: 'JCB',
		LOCAL: 'LOCAL',
		MOTO: 'MOTO',
	},

	PayoutCardType: {
		DOMESTIC: 'DOMESTIC',
		FOREIGN: 'FOREIGN',
	},

	PayoutBuyType: {
		Export: 'export',
		BuyNew: 'buy_new',
		Repair: 'repair',
		Labor: 'labor',
	},

	PayoutDistributeType: {
		Equality: 1,
		Value: 2,
	},

	PayoutCollectStatus: {
		Pending: 'pending',
		Reject: 'reject',
		Confirmed: 'confirmed',
	},

	PayoutReason: {
		LOST_BY_GUEST: 'lost_by_guest',
		DAMAGE_BY_EMPLOYEE: 'damage_by_employee',
		DEPRECIATION: 'depreciation',
		OTHERS: 'others',
	},

	RateType: {
		PAY_NOW: 'PAY_NOW',
		PAY_AT_PROPERTY: 'PAY_AT_PROPERTY',
		LOAN: 'LOAN',
	},

	Platform: {
		Web: 'web',
		App: 'app',
	},

	ThirdPartyPayment: {
		MOMO: 'momo',
		VNPAY: 'vnpay',
		APPOTAPAY: 'appotapay',
		KOVENA: 'kovena',
		NEO_PAY: 'neopay',
		BANK_TRANSFER: 'bank_transfer',
	},

	ThirdPartyPaymentStatus: {
		SUCCESS: 'success',
		FAIL: 'fail',
		WAITING: 'waiting',
	},

	TaskTags: {
		CLEANING: 'cleaning',
		CLEANING_BACK: 'cleaning_back',
		REPAIRING: 'repairing',
		PA: 'pa',
		COLLECT_MONEY: 'collect_money',
		CONFIRMATION_BOOKING: 'confirmation_booking',
		TUTORIAL_CHECKIN: 'tutorial_checkin',
		VAT: 'vat',
		REFUND: 'refund',
		GUEST_REQUEST: 'guest_request',
		PCCC: 'pccc',
	},

	TaskStatus: {
		Waiting: 'waiting',
		Confirmed: 'confirmed',
		Checked: 'checked',
		Doing: 'doing',
		Done: 'done',
		Deleted: 'deleted',
		Expired: 'expired',
	},

	TaskChecking: {
		Pass: 'pass', // KT định kỳ đạt
		PassRandom: 'pass_random', // KT ngẫu nhiên đạt
		Fail: 'fail', // KT định kỳ không đạt
		FailRandom: 'fail_random', // KT ngẫu nhiên không đạt
	},

	TaskReason: {
		Plan: 'plan',
		GuestRequest: 'guest_request',
		Issue: 'issue',
	},

	TaskSource: {
		Auto: 'auto',
		Zalo: 'zalo',
		Cms: 'cms',
		Direction: 'direction',
		Other: 'other',
	},

	TaskWorkingType: {
		Normal: 1,
		Overtime: 2,
	},

	TaskPriority: {
		Normal: 0,
		Mid: 1,
		High: 2,
	},

	TaskNotificationType: {
		AutoGroup: 'auto_group',
		AutoGroupManager: 'auto_group_manager',
		AutoPerson: 'auto_person',
		AutoPersonManager: 'auto_person_manager',
		AutoGroupPerson: 'auto_group_person',
		AutoGroupPersonManager: 'auto_group_person_manager',
	},

	TaskReminderType: {
		Today: 'today',
		AllTime: 'all_time',
	},

	TaskAutoCreateTimeType: {
		DAILY: 'DAILY',
		WEEKLY: 'WEEKLY',
		MONTHLY: 'MONTHLY',
	},

	GuestTag: {
		Local: 'Local Guest',
		Traveller: 'Traveller',
		International: 'International Guest',
	},

	GuestRegisterType: {
		National: 'national',
		International: 'international',
	},

	GuestRegisterAccountType: {
		DVC_CAPCHA: 1,
		DVC_OTP: 2,
		DVC_ASM: 3,
		DVC_VNEID: 4,
	},

	AccountConfigTypes: {
		Electric: 'electric',
		Water: 'water',
		Invoice: 'invoice',
		API: 'api',
	},

	AccountProvider: {
		CHO_LON: 'cho_lon',
		BEN_THANH: 'ben_thanh',
		GIA_DINH: 'gia_dinh',
		PHU_HOA_TAN: 'phu_hoa_tan',
		NHA_BE: 'nha_be',
		EASY_INVOICE: 'easy_invoice',
		VNPT_INVOICE: 'vnpt_invoice',
		TUYA: 'tuya',
		FACEBOOK: 'facebook',
	},

	Attitude: ['satisfied', 'normal', 'unsatisfied', 'angry'],

	KPIs: {
		Review: 'review',
		Revenue: 'revenue',
	},

	PromotionType: {
		RuleSet: 'rule_set',
		Basic: 'basic',
		LastMinute: 'last_minute',
		EarlyBird: 'early_booker',
		NightFlashSale: 'night_flash_sale',
		HourlySale: 'hourly_sale',
	},

	PromotionRuleSetType: {
		SEASONAL_ADJUSTMENT: 'SEASONAL_ADJUSTMENT',
		BOOKED_BEYOND_AT_LEAST_X_DAYS: 'BOOKED_BEYOND_AT_LEAST_X_DAYS',
		BOOKED_WITHIN_AT_MOST_X_DAYS: 'BOOKED_WITHIN_AT_MOST_X_DAYS',
		NIGHT_FLASH_SALE: 'NIGHT_FLASH_SALE',
		HOURLY_SALE: 'HOURLY_SALE',
	},

	PromotionComparisonKey: {
		AvailableRoom: 'available_room',
		Occupancy: 'occupancy',
		TimeNow: 'time_now',
	},

	// PromotionAutoState: {
	// 	Reset: 'reset',
	// 	Disabled: 'disabled',
	// 	Enabled: 'enabled',
	// 	Set: 'set',
	// },

	PromotionAutoOperation: {
		And: 'and',
		Or: 'or',
	},

	PromotionAutoTimeType: {
		Ahead: 1,
		Exac: 2,
	},

	PromotionComparisonType: {
		Higher: 1,
		Lower: 2,
		Between: 3,
	},

	PromotionRuleSetBlockType: {
		Default: 1,
		Timer: 2,
		Dynamic: 3,
	},

	PromotionExecType: {
		OnOff: 1,
		ValueChange: 2,
		ValueSet: 3,
		Reset: 4,
	},

	PromotionChangeType: {
		PERCENT: 'PERCENT',
		VALUE: 'VALUE',
	},

	PromotionCalcType: {
		Sum: 'sum',
		Multi: 'multi',
	},

	PolicyRuleDiscountTypes: {
		Amount: 1,
		Percentage: 2,
	},

	PolicyRuleConditionTypes: {
		Checkin: 1,
		Checkout: 2,
		Age: 3,
	},

	PolicyRuleChargeTypes: {
		NonRefundable: 1,
		Noshow: 2,
		Flexible: 3,
	},

	PolicyRuleChargeValueTypes: {
		ByNight: 1,
		ByPercentage: 2,
	},

	PolicyTypes: {
		Cancellation: 'cancellation',
		ExtraFee: 'extra_fee',
		ExtraHour: 'extra_hour',
	},

	RatePlanPricingTypes: {
		New: 1,
		Reference: 2,
	},

	RatePlanRefTypes: {
		Amount: 1,
		Percentage: 2,
	},

	RatePlanBenefits: {
		Breakfast: 'breakfast',
		Lunch: 'lunch',
		Dinner: 'dinner',
		Other: 'other',
	},

	DaysOfWeek: {
		Sunday: '1',
		Monday: '2',
		Tueday: '3',
		Wednesday: '4',
		Thursday: '5',
		Friday: '6',
		Saturday: '7',
	},

	REPORT_GROUP: {
		ELECTRIC: 'electric',
		WATER: 'water',
		INTERNET: 'internet',
		REPAIR: 'repair',
		SECURIRY: 'security',
		INVESTMENT: 'investment',
		MAINTENANCE: 'maintenance',
		PAYMENT_FEE: 'payment_fee',
		FINANCIAL_EXPENSES: 'financial_expenses',
	},

	AssetDefaultAttrs: [
		{
			name: 'Thông tin',
			type: 'String',
			isDefault: true,
		},
		{
			name: 'Đặc điểm',
			type: 'String',
			isDefault: true,
		},
		{
			name: 'Đơn vị tính',
			type: 'String',
			isDefault: true,
		},
		{
			name: 'Đơn giá',
			type: 'Number',
			isDefault: true,
		},
		{
			name: 'Số lượng',
			type: 'Number',
			isDefault: true,
		},
		{
			name: 'Hình ảnh thực tế',
			type: 'Images',
			isDefault: true,
		},
		{
			name: 'Hạn bảo hành',
			type: 'Date',
			isDefault: true,
		},
		{
			name: 'Phiếu bảo hành',
			type: 'Images',
			isDefault: true,
		},
		{
			name: 'Liên hệ bảo hành',
			type: 'String',
			isDefault: true,
		},
		{
			name: 'Ghi chú',
			type: 'String',
			isDefault: true,
		},
	],

	AssetActions: {
		NEW: 'NEW',
		DELETE: 'DELETE',
		REPLACE: 'REPLACE',
		REPAIR: 'REPAIR',
	},

	BookingLogs: {
		BOOKING_CREATE: 'BOOKING_CREATE',
		BOOKING_DECLINED: 'BOOKING_DECLINED',
		BOOKING_CHARGED: 'BOOKING_CHARGED',
		BOOKING_CHARGED_UNDO: 'BOOKING_CHARGED_UNDO',
		BOOKING_CANCELED: 'BOOKING_CANCELED',
		BOOKING_CANCELED_UNDO: 'BOOKING_CANCELED_UNDO',
		BOOKING_NOSHOW: 'BOOKING_NOSHOW',
		BOOKING_NOSHOW_UNDO: 'BOOKING_NOSHOW_UNDO',
		BOOKING_SPLIT: 'BOOKING_SPLIT',
		BOOKING_OVERBOOK: 'BOOKING_OVERBOOK',
		BOOKING_OVERBOOK_RESOLVED: 'BOOKING_OVERBOOK_RESOLVED',
		BOOKING_UPDATE_CHECKIN: 'BOOKING_UPDATE_CHECKIN',
		BOOKING_UPDATE_CHECKOUT: 'BOOKING_UPDATE_CHECKOUT',
		BOOKING_UPDATE_ROOM: 'BOOKING_UPDATE_ROOM',
		BOOKING_UPDATE_ROOM_AMOUNT: 'BOOKING_UPDATE_ROOM_AMOUNT',
		BOOKING_UPDATE_HOME: 'BOOKING_UPDATE_HOME',
		BOOKING_UPDATE_OTA: 'BOOKING_UPDATE_OTA',

		BOOKING_UPDATE_FROM_HOUR: 'BOOKING_UPDATE_FROM_HOUR',
		BOOKING_UPDATE_TO_HOUR: 'BOOKING_UPDATE_TO_HOUR',

		EXPORT_INVOICE: 'EXPORT_INVOICE',

		REQUEST_APPROVED: 'REQUEST_APPROVED',
		REQUEST_DECLINED: 'REQUEST_DECLINED',

		GUEST_CHECKIN: 'GUEST_CHECKIN',
		GUEST_CHECKOUT: 'GUEST_CHECKOUT',
		GUEST_CHECKIN_UNDO: 'GUEST_CHECKIN_UNDO',
		GUEST_CHECKOUT_UNDO: 'GUEST_CHECKOUT_UNDO',
		GUEST_LINKED: 'GUEST_LINKED',

		MESSAGE_LINK: 'MESSAGE_LINK',

		PRICE_UPDATE: 'PRICE_UPDATE',
		PRICE_UPDATE_AUTO: 'PRICE_UPDATE_AUTO',
		FEE_ELECTRIC_UPDATE: 'FEE_ELECTRIC_UPDATE',
		FEE_WATER_UPDATE: 'FEE_WATER_UPDATE',
		FEE_SERVICE_UPDATE: 'FEE_SERVICE_UPDATE',
		FEE_OTA_UPDATE: 'FEE_OTA_UPDATE',
		FEE_LATE_CHECKOUT: 'FEE_LATE_CHECKOUT',
		FEE_EARLY_CHECKIN: 'FEE_EARLY_CHECKIN',
		FEE_ROOM_UPGRADE: 'FEE_ROOM_UPGRADE',
		FEE_EXTRA_PEOPLE: 'FEE_EXTRA_PEOPLE',
		FEE_COMPENSATION: 'FEE_COMPENSATION',
		FEE_BOOKING: 'FEE_BOOKING',
		FEE_MANAGEMENT: 'FEE_MANAGEMENT',
		FEE_CHANGE_DATE: 'FEE_CHANGE_DATE',
		FEE_CLEANING: 'FEE_CLEANING',
		FEE_VAT: 'FEE_VAT',
		FEE_SERVICE: 'FEE_SERVICE',
		FEE_INTERNET: 'FEE_INTERNET',
		FEE_MOTOBIKE: 'FEE_MOTOBIKE',
		FEE_CAR: 'FEE_CAR',
		FEE_LAUNDRY: 'FEE_LAUNDRY',
		FEE_DRINK_WATER: 'FEE_DRINK_WATER',
		PREVIOUS_ELECTRIC_QUANTITY: 'PREVIOUS_ELECTRIC_QUANTITY',
		CURRENT_ELECTRIC_QUANTITY: 'CURRENT_ELECTRIC_QUANTITY',
		ELECTRIC_PRICE_PER_KWH: 'ELECTRIC_PRICE_PER_KWH',
		PREVIOUS_WATER_QUANTITY: 'PREVIUOS_WATER_QUANTITY',
		CURRENT_WATER_QUANTITY: 'CURRENT_WATER_QUANTITY',
		WATER_PRICE_PER_M3: 'WATER_PRICE_PER_M3',
		DEFAULT_WATER_PRICE: 'DEFAULT_WATER_PRICE',
		WATER_FEE_CALC_TYPE: 'WATER_FEE_CALC_TYPE',
		MINIBAR: 'MINIBAR',
	},

	ServiceFeeLogs: {
		CREATE: 'CREATE',
		UPDATE: 'UPDATE',
		DELETE: 'DELETE',
	},
	OperationReportStatus: {
		IN_PROGRESS: 'in_progress',
		ERROR: 'error',
		COMPLETED: 'completed',
	},

	HISTORY_TYPE: {
		BLOCK: 'BLOCK',
		BOOKING: 'BOOKING',
		TASK: 'TASK',
		ASSET_REPORT: 'ASSET_REPORT',
	},

	LANGUAGE,

	CanceledByType: {
		OTA: 'OTA',
		USER: 'USER',
		SYSTEM: 'SYSTEM',
	},

	LAYOUT_VIEW_TYPE: {
		LARGE: 'large',
		NORMAL: 'normal',
	},

	LAYOUT_TYPE: {
		ROOT: 'ROOT',
		X: 'X',
		Y: 'Y',
	},
	SERVICE_FEE_TYPES: {
		LAUNDRY_FEE: 'laundryFee',
		CAR_FEE: 'carFee',
		COMPENSATION: 'compensation',
		MOTOBIKE_FEE: 'motobikeFee',
		DRINK_WATER_FEE: 'drinkWaterFee',
	},
	ROOM_PRICE: 'roomPrice',
	EXTRA_FEE: {
		ELECTRIC_FEE: 'electricFee',
		WATER_FEE: 'waterFee',
		EXTRA_FEE: 'extraFee',
		EARLY_CHECKIN: 'earlyCheckin',
		LATE_CHECKOUT: 'lateCheckout',
		ROOM_UPGRADE: 'roomUpgrade',
		EXTRA_PEOPLE: 'extraPeople',
		BOOKING_FEE: 'bookingFee',
		CHANGE_DATE_FEE: 'changeDateFee',
		MANAGEMENT_FEE: 'managementFee',
		COMPENSATION: 'compensation',
		CLEANING_FEE: 'cleaningFee',
		VAT_FEE: 'vatFee',
		SERVICE_FEE: 'serviceFee',
		INTERNET_FEE: 'internetFee',
		MOTOBIKE_FEE: 'motobikeFee',
		CAR_FEE: 'carFee',
		LAUNDRY_FEE: 'laundryFee',
		DRINK_WATER_FEE: 'drinkWaterFee',
		MINIBAR: 'minibar',
	},
	VIRTUAL_RESOURCE: {
		HISTORY: 'HISTORY',
		HISTORY_BLOCK: 'HISTORY_BLOCK',
		HISTORY_ROOM: 'HISTORY_ROOM',
		HISTORY_DATE: 'HISTORY_DATE',

		TASK: 'TASK',
		TASK_BLOCK: 'TASK_BLOCK',
		TASK_ROOM: 'TASK_ROOM',
		TASK_DATE: 'TASK_DATE',

		PAYOUT: 'PAYOUT',
		PAYOUT_DATE_YEAR: 'PAYOUT_DATE_YEAR',
		PAYOUT_DATE_MONTH: 'PAYOUT_DATE_MONTH',
		PAYOUT_BLOCK: 'PAYOUT_BLOCK',
	},
	DEFAULT_FOLDER_NAME: {
		VI: 'Thư mục mới',
		EN: 'New folder',
	},
	RESOURCE_FILE_TYPE: {
		RECONCILIATION: 'reconciliation',
		MANUAL: 'manual',
	},
	RESOURCE_FILE_STATUS: {
		WAITING: 'waiting',
		DONE: 'done',
	},
	FEE_TITLE: {
		electricFee: {
			vi: 'Tiền điện',
			en: 'Electric fee',
		},
		waterFee: {
			vi: 'Tiền nước',
			en: 'Water fee',
		},
		compensation: {
			vi: 'Phí bồi thường',
			en: 'Compensation',
		},
		cleaningFee: {
			vi: 'Phí dọn dẹp',
			en: 'Cleaning fee',
		},
		vatFee: {
			vi: 'Phí VAT',
			en: 'VAT fee',
		},
		serviceFee: {
			vi: 'Phí dịch vụ',
			en: 'Service fee',
		},
		internetFee: {
			vi: 'Phí internet',
			en: 'Internet fee',
		},
		motobikeFee: {
			vi: 'Phí xe máy',
			en: 'Motobike fee',
		},
		carFee: {
			vi: 'Phí xe hơi',
			en: 'Car fee',
		},
		laundryFee: {
			vi: 'Phí giặt đồ',
			en: 'Laundry fee',
		},
		drinkWaterFee: {
			vi: 'Phí nước uống',
			en: 'Drink water fee',
		},
	},
	CLEANING_STATE: {
		VD: 'VD', // dơ
		VC: 'VC', // sạch
		OOO: 'OOO', // Repair
	},
	CONTRACT_CALC_TYPE: {
		toEndOfMonth: 1,
		toCheckIn: 2,
	},
	EMAIL_TYPE: {
		OUTLOOK: 'OUTLOOK',
		GMAIL: 'GMAIL',
	},
	EMAIL_SUB_TYPE: {
		CONFIRMATION: 'CONFIRMATION',
		CONFIRMATION_OTA: 'CONFIRMATION_OTA',
	},
	REPORT_TYPE: {
		SONATA: 'sonata',
	},
	GUARANTEE_REV_TYPE: {
		SHARE: 1,
		CZ: 2,
		HOST: 3,
	},
	CASHIER_TYPE: {
		CASH: 'cash',
		CURRENCY_EXCHANGE: 'currency_exchange',
	},
	HANDOVER_STATUS: {
		PROCESSING: 'processing',
		DONE: 'done',
		CONFIRMED: 'confirmed',
	},
	BANK_ACCOUNT_TYPE: {
		PERSONAL: 'personal',
		COMPANY: 'company',
		COMPANY_PERSONAL: 'company_personal',
		CUSTOMER: 'customer',
	},
	BANK_ACCOUNT: {
		PRIVATE: 'private',
		PARTER: 'parter',
		USER: 'user',
	},
	BANK_ACCOUNT_SOURCE_TYPE: {
		BANKING: 'banking',
		CASH: 'cash',
	},
	SYS_BANK_ACCOUNT_TYPE: {
		INBOUND: 'INBOUND',
		OUTBOUND: 'OUTBOUND',
		OUTBOUND_PAY: 'OUTBOUND_PAY',
	},
	LOCK_TYPE: {
		DAY: Services.Day,
		HOUR: Services.Hour,
	},
	DOOR_LOCK_POS_TYPE: {
		GATE: 'gate',
		ROOM: 'room',
	},
	DOOR_LOCK_TYPE: {
		WEBPASS: 'webpass',
		TUYA: 'tuya',
	},
	DOOR_LOCK_CODE_TYPE: {
		FOREVER: 0,
		OTP: 1,
		UNTIL_CHECKOUT: 2,
	},
	PRESENT_COMPARE_WITH_CHECKIN_RESULT: {
		SAME: 0,
		NEXT_DATE_OF_CHECKIN: 1,
	},
	CASH_FLOW_OBJECT: {
		GUEST: 'GUEST',
		GUEST_REFUNDED: 'GUEST_REFUNDED',
		UNPAID: 'UNPAID',
		IGNORE_PRICE: 'IGNORE_PRICE',
		OTA_COLLECT: 'OTA_COLLECT',
		THIRD_PARTY_PAYMENT: 'THIRD_PARTY_PAYMENT',
		B2B: 'B2B',
		WAIT_FOR_ACCOUNTANT_TO_CONFIRM: 'WAIT_FOR_ACCOUNTANT_TO_CONFIRM',
		USER_CONFIRMED: 'USER_CONFIRMED',
		USER_UNCONFIRMED: 'USER_UNCONFIRMED',
		CASHIER: 'CASHIER',
		COMPANY_BANK_ACCOUNT: 'COMPANY_BANK_ACCOUNT',
		HOST_BANK_ACCOUNT: 'HOST_BANK_ACCOUNT',
		HOST_CASH_FUND: 'HOST_CASH_FUND',
		CASH_FUND: 'CASH_FUND',
		SALARY_ADVANCE_FUND: 'SALARY_ADVANCE_FUND',
		BACKUP_CASH_FUND: 'BACKUP_CASH_FUND',
		REFUND: 'REFUND',
		// expense
		COMMISSION_OTA: 'COMMISSION_OTA',
		COMMISSION_COZRUM: 'COMMISSION_COZRUM',
		SERVICES: 'SERVICES',
		TAX: 'TAX',
		HOST_INCOME: 'HOST_INCOME',
		MANAGE_FEE: 'MANAGE_FEE',
		MAINTENANCE: 'MAINTENANCE',
		BUY_EQUIPMENT: 'BUY_EQUIPMENT',
		OTHER_FEE: 'OTHER_FEE',
		TRANSACTION_FEE: 'TRANSACTION_FEE',
	},
	ASSET_ISSUE_STATUS: {
		WAITING: 'waiting',
		PROCESSING: 'processing',
		DONE: 'done',
		MERGED: 'merged',
		DELETED: 'deleted',
	},
	ASSET_ISSUE_UNAVAILABLE_STATUS: ['deleted', 'merged'],
	ASSET_ISSUE_SOURCE: {
		ZALO: 'zalo',
		CMS: 'cms',
		OTHER: 'other',
	},
	ASSET_ISSUE_PRIORITY: {
		NORMAL: 0,
		MID: 1,
		HIGHT: 2,
	},
	ASSET_ISSUE_LOGS: {
		CREATE: 'CREATE',
		DELETE: 'DELETE',
		MERGE: 'MERGE',
		STATUS_UPDATED_BY_TASK: 'STATUS_UPDATED_BY_TASK',
		UPDATE_STATUS: 'UPDATE_STATUS',
		ADD_TASK: 'ADD_TASK',
		ADD_HISTORY: 'ADD_HISTORY',
		REMOVE_TASK: 'REMOVE_TASK',
		REMOVE_HISTORY: 'REMOVE_HISTORY',
		MERGE_TASK: 'MERGE_TASK',
		MERGE_HISTORY: 'MERGE_HISTORY',
	},
	ASSET_ISSUE_TASK_LOGS: {
		CREATED: 'CREATED',
		RESTORE: 'RESTORE',
		DELETE: 'DELETE',
	},
	ASSET_ISSUE_HISTORY_LOGS: {
		CREATED: 'CREATED',
		RESTORE: 'RESTORE',
		DELETE: 'DELETE',
	},
	WATER_FEE_CALC_TYPE: {
		DEFAULT: 1,
		QUANTITY: 2,
	},
	USER_SYS_NAME: {
		GUEST: 'guest',
		SYSTEM: 'system',
	},
	VATExportType: {
		MISA: 'misa',
		VIETTEL: 'viettel',
	},
	CHECK_ITEM_STATUS: {
		PASS: 'pass',
		FAIL: 'fail',
		DELETED: 'deleted',
	},
	CHECK_LIST_LOGS: {
		CREATED: 'CREATED',
		DELETED: 'DELETED',
		CHANGE_STATUS: 'CHANGE STATUS',
		ADD_TASK: 'ADD_TASK',
		REMOVE_TASK: 'REMOVE_TASK',
		ADD_PETITION: 'ADD_PETITION',
		REMOVE_PETITION: 'REMOVE_PETITION',
	},
	PETITION_STATUS: {
		WAITING: 'waiting',
		CONFIRMED: 'confirmed',
		DONE: 'done',
		DELETED: 'deleted',
	},
	PETITION_LOGS: {
		CREATED: 'CREATED',
		CHANGE_STATUS: 'CHANGE_STATUS',
		DELETED: 'DELETED',
	},
	PAYMENT_CARD_SWIPE_STATUS: {
		ERROR: 'error',
		SWIPED: 'swiped',
		UNSWIPED: 'unswiped',
	},
	PAYMENT_CARD_STATUS: {
		UNKNOWN: 'unknown',
		VALID: 'valid',
		INVALID: 'invalid',
		NO_INFO: 'no_info',
		UPDATED: 'updated',
	},
	PAYMENT_CHARGE_STATUS: {
		NEED_TO_CHARGE: 'need_to_charge',
		ERROR: 'error',
		CHARGED: 'charged',
		IGNORED: 'ignored',
	},
	PAYMENT_CHARGE_TYPE: {
		FIRST_NIGHT: 'first_night',
		FULL: 'full',
	},
	OTA_PAYMENT_METHODS: {
		VIRTUAL_CARD: 5,
		BANK_TRANSFER: 1,
	},
	USER_CONTACT_TYPE: {
		GUEST: 'guest',
		USER: 'user',
		GROUP: 'group',
		OWNER: 'owner',
		HOST: 'host',
		TA: 'ta',
	},
	ROOM_GROUP_TYPES: {
		CUSTOM: 'CUSTOM',
		DEFAULT: 'DEFAULT',
		VIRTUAL: 'VIRTUAL',
	},
	INVOICE_STATUS: {
		CHECKING: 'checking',
		PUBLISHED: 'published',
		DELETED: 'deleted',
	},
	DEFAULT_TEMPORARY_PASSWORD_CREATION_LIMIT: 10,
	BOOKING_PRICE_VAT_TYPES: {
		DEFAULT: 'DEFAULT',
		ORIGIN_PRICE: 'ORIGIN_PRICE',
	},
	ROOM_CARD_TYPES: {
		NORMAL: 'NORMAL',
		MASTER: 'MASTER',
	},
	OPERATION_REPORT_TYPE: {
		REVENUE_REPORT: 'revenue_report',
		OPERATION_REPORT: 'operation_report',
		APPROVED_REPORT: 'approved_report',
		REQUEST_MODIFY_REPORT: 'request_modify_report',
	},
	DOOR_LOCK_PASSWORD_LENGTH: {
		WEBPASS: 6,
		TUYA_BLUETOOTH_AND_ZIGBEE: 6,
		TUYA_WIFI: 7,
	},
	WORK_NOTE_TYPES: {
		NORMAL: 1,
		HOST_ONLY: 2,
		LOCK_ROOM: 3,
	},
	OTA_ACCOUNT_TYPE: {
		CM_API: 'CM_API',
	},
	PAYMENT_REF_LENGTH: 10,

	GUEST_GROUP_KEYS: ['phone', 'fullName', 'passportNumber', 'email'],

	GUEST_GROUP_LAST_TIME: new Date('2024-08-22T08:00:00.000Z'),

	REVENUE_STREAM_TYPES: {
		BY_TRANSACTION: 1,
		BY_PROFIT: 2,
	},

	EXPENSES_STREAM_DATA_TYPES: {
		TRANSACTION_FEE: 1,
		COMMISSION: 2,
	},

	REVENUE_STREAM_CALC_TYPES: {
		BEFORE_COMMISSION: 1,
		AFTER_COMMISSION: 2,
		FIXED: 3,
		IN_REPORT: 4,
		COMMISSION: 5,
		TRANSACTION_FEE: 6,
	},

	REPORT_STREAM_VIRTUAL_CTG_TYPES: {
		PROVINCE: 'PROVINCE',
		DISTRICT: 'DISTRICT',
		HOTEL_STATS_1: 'HOTEL_STATS_1',
		HOTEL_STATS_2: 'HOTEL_STATS_2',

		GMV_TRANSACTION: 'GMV_TRANSACTION',
		GMV_TRANSACTION_TOTAL: 'GMV_TRANSACTION_TOTAL',
		GMV_TRANSACTION_AVG: 'GMV_TRANSACTION_AVG',
		HOTEL_LIST: 'HOTEL_LIST',
		HOTEL_LIST_COOP: 'HOTEL_LIST_COOP',

		HOTEL: 'HOTEL',

		HOTEL_COUNT: 'HOTEL_COUNT',
		ROOM_COUNT: 'ROOM_COUNT',
		HOTEL_REVENUE: 'HOTEL_REVENUE',
		HOTEL_EXPENSES: 'HOTEL_EXPENSES',
		HOTEL_PROFIT: 'HOTEL_PROFIT',
		COZRUM_PROFIT: 'COZRUM_PROFIT',
		OWNER_PROFIT: 'OWNER_PROFIT',
		HOTEL_REVENUE_AVG: 'HOTEL_REVENUE_AVG',
		ROOM_REVENUE_AVG: 'ROOM_REVENUE_AVG',

		COMMISSION_OTA: 'COMMISSION_OTA',
		COMMISSION_OTA_BY_SERVICE: 'COMMISSION_OTA_BY_SERVICE',

		INCOME_REVENUE: 'INCOME_REVENUE',
		INCOME_EXPENSES: 'INCOME_EXPENSES',
		CALCULATION: 'CALCULATION',
	},

	REPORT_STREAM_CTG_TYPES: {
		REVENUE: 'revenue',
		EXPENSES: 'expenses',
		INCOME_STATMENT: 'income_statement',
	},

	REPORT_STREAM_TRANSACTION_STATUS: {
		TEMPOLARY: 1,
		APPROVED: 2,
		CANCELED: 3,
	},

	REPORT_STREAM_TRANSACTION_TYPES: {
		REVENUE_TRANSACTION: 1,
		EXPENSES_TRANSACTION: 2,
		REVENUE_CALCULATION: 3,
		REVENUE_INFO: 4,
		EXPENSES_INFO: 5,
		EXPENSES_CALCULATION: 6,
		PROFIT_INFO: 7,
	},

	REPORT_STREAM_SOURCES: {
		CZ: 1,
		OWNER: 2,
		OTA_PARTNER: 3,
		PAYMENT_PARTNER: 4,
		AFFILIATE_PARTNER: 5,
	},

	TIMELINE_TYPES: {
		DAILY: 'DAILY',
		WEEKLY: 'WEEKLY',
		MONTHLY: 'MONTHLY',
		QUARTERLY: 'QUARTERLY',
		YEARLY: 'YEARLY',
	},

	STATIC_CONTENT_TYPE: {
		ROOM: 'ROOM',
		PROPERTY: 'PROPERTY',
	},

	REPORT_TEMPLATE_TYPES: {
		PCCC: 'PCCC',
		TOURISM_ACCOMMODATION: 'tourismAccommodation',
	},

	PROPERTY_TYPES: {
		PROPERTY: 1,
		TEST: 2,
		OFFICE: 3,
		ADMIN: 4,
	},
});

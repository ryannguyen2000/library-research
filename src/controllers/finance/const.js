const { PayoutType, PayoutSources, VATExportType } = require('@utils/const');

const LOG_FIELDS_LABELS = {
	'currencyAmount.quantity': { vi: 'Số lượng', en: 'Quantity' },
	'currencyAmount.unitPrice': { vi: 'Đơn giá', en: 'Unit price' },
	'currencyAmount.vat': { vi: 'Phí VAT', en: 'VAT' },
	'currencyAmount.exchangedAmount': { vi: 'Số tiền', en: 'Price' },
	distribute: { vi: 'Phân bổ', en: 'Distributed' },
	source: { vi: 'Cách thức chi', en: 'Payment source' },
	payoutType: { vi: 'Loại thanh toán', en: 'Payment type' },
	description: { vi: 'Mô tả', en: 'Description' },
	categoryId: { vi: 'Khoản chi', en: 'Payment category' },
	blockIds: { vi: 'Nhà', en: 'House' },
	transactionFee: { vi: 'Phí thanh toán', en: 'Transaction fee' },
	isInternal: { vi: 'tb chi', en: 'Paid by tb' },
	hasInvoice: { vi: 'Hoá đơn', en: 'Invoice' },
	ignoreReport: { vi: 'Bỏ qua báo cáo', en: 'Hide on Report' },
	paidAt: { vi: 'Ngày thu/chi', en: 'Date paid' },
	buyType: { vi: 'Xuất kho / mua mới', en: 'Warehouse/New Order' },
	isOwnerCollect: { vi: 'Chủ nhà thu', en: 'Collected by Owner' },
	isCalcDeposit: { vi: 'Tính cọc vào doanh thu', en: 'Charged Deposit' },
	isAvoidTransactionFee: { vi: 'Bỏ qua phí giao dịch', en: 'Skip transaction fee' },
	startPeriod: { vi: 'Kì chi', en: 'Period' },
	distributeMonths: { vi: 'Số tháng phân bổ', en: 'Total months distributed' },
	collector: { vi: 'Người thu', en: 'Collector' },
	state: { vi: 'Trạng thái', en: 'State' },
	payAccountId: { vi: 'Thông tin người nhận', en: 'Credit Account' },
	payDebitAccountId: { vi: 'Nguồn chi', en: 'Debit Account' },
	payDescription: { vi: 'ND chuyển khoản', en: 'Transfer content' },
	confirmedBy: { vi: 'Người duyệt', en: 'Confirmed by' },
};

const LOG_FIELDS = [
	'currencyAmount.quantity',
	'currencyAmount.unitPrice',
	'currencyAmount.vat',
	'currencyAmount.exchangedAmount',
	'distribute',
	'source',
	'description',
	'categoryId',
	'blockIds',
	'transactionFee',
	'isInternal',
	'hasInvoice',
	'ignoreReport',
	'paidAt',
	'buyType',
	'isOwnerCollect',
	'isCalcDeposit',
	'isAvoidTransactionFee',
	'startPeriod',
	'distributeMonths',
	'payoutType',
	'collector',
	'state',
	'payAccountId',
	'payDebitAccountId',
	'payDescription',
	'confirmedBy',
];

const LOG_VALUES_MAPPER = {
	source: {
		[PayoutSources.BANKING]: { vi: 'Chuyển khoản công ty', en: 'Company bank transfer' },
		[PayoutSources.PERSONAL_BANKING]: { vi: 'Chuyển khoản cá nhân', en: 'Personal bank transfer' },
		[PayoutSources.SWIPE_CARD]: { vi: 'Cà thẻ', en: 'Swipe card' },
		[PayoutSources.CASH]: { vi: 'Tiền mặt', en: 'Cash' },
		[PayoutSources.VOUCHER]: { vi: 'Voucher', en: 'Voucher' },
		[PayoutSources.ONLINE_WALLET]: { vi: 'Ví điện tử', en: 'EWallet' },
		[PayoutSources.THIRD_PARTY]: { vi: 'Kênh thanh toán trung gian', en: 'Third Party Payment' },
		[PayoutSources.SUBTRACT_DEPOSIT]: { vi: 'Cấn trừ cọc', en: 'From Deposit' },
	},
	payoutType: {
		[PayoutType.RESERVATION]: { vi: 'Tiền phòng', en: 'Room charge' },
		[PayoutType.DEPOSIT]: { vi: 'Tiền cọc', en: 'Deposit' },
		[PayoutType.SERVICE]: { vi: 'Tiền dịch vụ', en: 'Service charge' },
		[PayoutType.REFUND]: { vi: 'Hoàn tiền', en: 'Refund' },
		[PayoutType.VAT]: { vi: 'Phí VAT', en: 'VAT fee' },
		[PayoutType.OTHER]: { vi: 'Khác', en: 'Other fee' },
	},
	true: { vi: 'Có', en: 'Yes' },
	false: { vi: 'Không', en: 'No' },
};

const MISA_CONFIG = {
	FILE_NAME: 'danh_sach_hoa_don_misa.xls',
	XLSX: {
		ORIGIN: 'A1',
		TITLE: [
			'Hiển thị trên sổ',
			'Hình thức bán hàng',
			'Phương thức thanh toán',
			'Kiểm phiếu xuất kho',
			'XK vào khu phi thuế quan và các TH được coi như XK',
			'Lập kèm hóa đơn',
			'Đã lập hóa đơn',
			'Ngày hạch toán (*)',
			'Ngày chứng từ (*)',
			'Số chứng từ (*)',
			'Số phiếu xuất',
			'Lý do xuất',
			'Số hóa đơn',
			'Ngày hóa đơn',
			'Mã khách hàng',
			'Tên khách hàng',
			'Địa chỉ',
			'Mã số thuế',
			'Diễn giải',
			'Nộp vào TK',
			'NV bán hàng',
			'Mã hàng (*)',
			'Tên hàng',
			'Hàng khuyến mại',
			'TK Tiền/Chi phí/Nợ (*)',
			'TK Doanh thu/Có (*)',
			'ĐVT',
			'Số lượng',
			'Đơn giá sau thuế',
			'Đơn giá',
			'Thành tiền',
			'Tỷ lệ CK (%)',
			'Tiền chiết khấu',
			'TK chiết khấu',
			'Giá tính thuế XK',
			'% thuế XK',
			'Tiền thuế XK',
			'TK thuế XK',
			'% thuế GTGT',
			'Tiền thuế GTGT',
			'TK thuế GTGT',
			'HH không TH trên tờ khai thuế GTGT',
			'Kho',
			'TK giá vốn',
			'TK Kho',
			'Đơn giá vốn',
			'Tiền vốn',
			'Hàng hóa giữ hộ/bán hộ',
		],
		SUB_TITLE: [],
		WS_DEFAULT: {},
		DEFAULT: {
			issueInvoiceAlongWith: 1,
			productCode: 'phong',
			loanAccount: 131,
			revenueAccount: 5113,
			unit: 'đêm',
		},
	},
};

const VIETTEL_CONFIG = {
	FILE_NAME: 'danh_sach_hoa_don_viettel.xls',
	XLSX: {
		ORIGIN: 'A8',
		TITLE: [
			'STT',
			'Nhóm hoá đơn (*)',

			// I.Thông tin người mua
			'Người mua không lấy HĐ',
			'Mã KH',
			'Họ Tên',
			'Địa chỉ',
			'Số điện thoại',
			'Email',
			'Mã số thuế',
			'Loại giấy tờ',
			'Số giấy tờ',
			'Tên đơn vị',
			'Tên ngân hàng',
			'Tài khoản ngân hàng',
			'Hợp đồng số',

			// II.Thông tin giao dịch
			'Hình thức thanh toán (*)',
			'Thanh toán (*)',
			'Loại tiền (*)',
			'Tỷ giá',

			// III.Thông tin hàng hóa
			'Loại hàng hoá',
			'Mã hàng hoá/dich vụ (*)',
			'Tên hàng hoá/dịch vụ',
			'Ghi chú',
			'Số lô',
			'Hạn dùng',
			'Đơn vị tính',
			'Số lượng (*)',
			'Đơn giá (*)',
			'Thành tiền (*)',
			'Thuế GTGT (%) (*)',
			'Tiền thuế',

			/// VI. Thông tin bổ sung
			'Quy đổi',
			'Diễn giải',
			'Số BH',
			'Ghi chú',
			'BL',
			'Mã KH',
			'DO',
			'RPO',
			'Tổng trọng lượng',
			'Hạn thanh toán',
			'Chiết khấu thương mại',
			'Ghi chú',
			'', // result
		],
		SUB_TITLE: [
			'itemNo',
			'group',

			// I.Thông tin người mua
			'',
			'buyerCode',
			'buyerName',
			'buyerAddress',
			'buyerPhone',
			'buyerEmail',
			'buyerTaxCode',
			'buyerIdType',
			'buyerIdNo',
			'buyerLegalName',
			'buyerBankName',
			'buyerBankAccount',
			'contactNo',

			// II.Thông tin giao dịch
			'payMethod',
			'payStatus',
			'currencyCode',
			'exchangeRate',

			// III.Thông tin hàng hóa
			'selection',
			'itemCode',
			'itemName',
			'itemNote',
			'batchNo',
			'expDate',
			'itemUnit',
			'itemQuantity',
			'itemPrice',
			'amountBeforeTax',
			'taxPercentage',
			'taxAmount',

			/// VI. Thông tin bổ sung
			'Exchange',
			'Explain',
			'BHNo',
			'Note',
			'bl',
			'makh',
			'do',
			'rpo',
			'tongtl',
			'hantt',
			'invoiceDiscount',
			'invoiceNote',
			'', // result
		],
		WS_DEFAULT: {
			'!merges': [
				{
					s: { c: 2, r: 7 },
					e: { c: 14, r: 7 },
				},
				{
					s: { c: 15, r: 7 },
					e: { c: 18, r: 7 },
				},
				{
					s: { c: 19, r: 7 },
					e: { c: 30, r: 7 },
				},
				{
					s: { c: 31, r: 7 },
					e: { c: 42, r: 7 },
				},
			],
			C8: { t: 's', v: 'Thông tin người dùng' },
			P8: { t: 's', v: 'Thông tin giao dịch' },
			T8: { t: 's', v: 'Thông tin hàng hóa' },
		},
		DEFAULT: {
			buyerIdType: '3',
			payMethod: 'TM/CK',
			payStatus: '1',
			selection: '1',
			itemCode: 'DV',
			itemUnit: 'đêm',
		},
	},
};

const XLSX_CONFIG = {
	[VATExportType.MISA]: MISA_CONFIG,
	[VATExportType.VIETTEL]: VIETTEL_CONFIG,
};

module.exports = {
	LOG_FIELDS,
	LOG_FIELDS_LABELS,
	LOG_VALUES_MAPPER,
	XLSX_CONFIG,
};

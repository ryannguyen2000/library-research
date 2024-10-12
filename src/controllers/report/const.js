const { OPERATION_REPORT_TYPE } = require('@utils/const');

const REPORT_TYPE = [
	{
		key: OPERATION_REPORT_TYPE.REVENUE_REPORT,
		name: { en: 'Revenue report', vi: 'Báo cáo doanh thu' },
		shortName: 'bcdt',
	},
	{
		key: OPERATION_REPORT_TYPE.OPERATION_REPORT,
		name: { en: 'Operation report', vi: 'Báo cáo vận hành' },
		shortName: 'bcvh',
	},
];

const TEXT = {
	MONTH: { en: 'MONTH', vi: 'THÁNG' },
	TOTAL: { en: 'Total', vi: 'Tổng cộng' },
};

const OPERATION_REPORT_CATEGORIES = {
	REVENUE_REPORT: {
		key: 'revenue_report',
		name: { en: 'Revenue reconciliation', vi: 'Đối soát doanh thu' },
	},
	PERFORMANCE: {
		key: 'performance',
		name: { en: 'Operating performance', vi: 'Công suất vận hành' },
	},
	TASK_STATISTIC: {
		key: 'task_statistic',
		name: { en: 'Workload statistics', vi: 'Khối lượng công việc' },
	},
	CUSTOMER_REVIEW: {
		key: 'customer_review',
		name: { en: 'Customer reviews', vi: 'Đánh giá từ khách hàng' },
	},
	QUALITY_CONTROL: {
		key: 'quality_control',
		name: { en: 'Operation log', vi: 'Nhật ký vận hành' },
	},
	INVOICE: {
		key: 'invoice',
		name: { en: 'Invoices, documents', vi: 'Hóa đơn, chứng từ' },
	},
};

const RESOUCRE_DIRECTORY_TEMPLATE = {
	folderName: { vi: '%REPORT_TYPE%', en: '%REPORT_TYPE%' },
	children: {
		folderName: { vi: 'NĂM %YEAR%', en: '%YEAR%' },
		children: {
			folderName: { vi: 'THÁNG %MONTH%', en: '%MONTH%' },
		},
	},
};

const FORMAT_CELL = {
	PRICE: 'price',
	DATE: 'date',
	CHECK_BOX: 'check_box',
	ROOMS: 'rooms',
	TAG: 'tag',
	ASSIGN: 'assign',
	SERVICE_TYPE: 'service_type',
	OTA_ICON: 'ota_icon',
	RATING_AVR: 'rating_avr',
	RATING_REVIEW: 'rating_review',
};

const PERFORMANCE_TYPES = {
	REVENUE: 'revenue',
	OCCUPANCY: 'occupancy',
	REV_PAR: 'RevPar',
	ADR: 'ADR',
};

const REPORT_TYPES = {
	REVENUE_EXPENSE: {
		name: { en: 'A. Revenue and Expenses', vi: 'A. Doanh thu và chi phí' },
		footerText: {
			en: 'TP.HCM, %DAY%-%MONTH%-%YEAR%',
			vi: 'TP.HCM, ngày %DAY% tháng %MONTH% năm %YEAR%',
		},
		type: 'overview',
		reportDataType: 'revenue_expense',
	},
	BOOKING_REVENUE: {
		type: 'detail',
		name: { en: 'A. Booking Revenue', vi: 'A. Doanh thu đặt phòng' },
		reportDataType: 'booking_revenue',
		dataKey: 'revenue.revenues',
		footerText: { en: 'Total booking revenue', vi: 'Tổng doanh thu đặt phòng' },
	},
	BOOKING_REVENUE_GENERATED: {
		type: 'detail',
		name: { en: 'B. Generated Revenue', vi: 'B. Doanh thu phát sinh' },
		reportDataType: 'booking_revenue_generated',
		dataKey: 'revenue.otherRevenues',
		footerText: { en: 'Total generated revenue', vi: 'Tổng doanh thu phát sinh' },
	},
	BOOKING_REVENUE_OTHER: {
		type: 'detail',
		name: { en: 'C. Other Revenue', vi: 'C. Doanh thu khác' },
		reportDataType: 'booking_revenue_other',
		dataKey: 'revenue.other',
		footerText: { en: 'Total other revenue', vi: 'Tổng doanh thu khác' },
	},
	BOOKING_REVENUE_GROUND_RENT: {
		type: 'detail',
		name: { en: 'D. Ground Rent Revenue', vi: 'D. Doanh thu mặt bằng' },
		reportDataType: 'booking_revenue_ground_rent',
		dataKey: 'revenue.groundRentRevenues',
		footerText: { en: 'Total ground rent revenue', vi: 'Tổng doanh thu mặt bằng' },
	},
	COST_DETAIL: {
		name: { en: 'A. Cost List', vi: 'A. Danh sách chi phí' },
		type: 'cost_detail',
		reportDataType: 'cost_detail',
	},
};

const REPORT_CATEGORIES = {
	OVERVIEW: { en: 'Overview', vi: 'Tổng quan' },
	INCOME_LIST: { en: 'Income list', vi: 'Danh sách thu' },
	COST_LIST: { en: 'Cost list', vi: 'Danh sách chi phí' },
};

const OVERVIEW_COLUMNS = [
	{
		title: { en: 'Content', vi: 'Nội dung' },
		dataIndex: 'name',
		align: 'left',
	},
	// {
	// 	title: '',
	// 	dataIndex: '',
	// 	width: 150,
	// 	align: 'center',
	// },
	// {
	// 	title: '',
	// 	dataIndex: '',
	// 	width: 150,
	// 	align: 'center',
	// },
	{
		title: { en: 'Amount', vi: 'Số tiền' },
		dataIndex: 'total',
		width: 150,
		align: 'right',
		format: FORMAT_CELL.PRICE,
	},
];
const REVENUES_COLUMNS = [
	{
		title: { en: 'No.', vi: 'STT' },
		dataIndex: 'index',
		align: 'center',
		width: 30,
	},
	{
		title: { en: 'Full Name', vi: 'Tên đầy đủ' },
		width: 110,
		align: 'left',
		dataIndex: ['guestId', 'fullName'],
	},
	{
		title: { en: 'Source', vi: 'Nguồn' },
		align: 'center',
		width: 40,
		dataIndex: 'otaName',
	},
	{
		title: { en: 'Booking Code', vi: 'Mã đặt phòng' },
		align: 'center',
		// width: 80,
		dataIndex: 'otaBookingId',
	},
	{
		title: { en: 'Service Type', vi: 'Loại Thuê' },
		align: 'left',
		width: 80,
		dataIndex: 'serviceType',
		format: FORMAT_CELL.SERVICE_TYPE,
	},
	{
		title: { en: 'Check In', vi: 'Check In' },
		align: 'center',
		width: 90,
		dataIndex: 'from',
		format: FORMAT_CELL.DATE,
	},
	{
		title: { en: 'Nights', vi: 'Đêm' },
		align: 'center',
		// width: 80,
		dataIndex: 'nights',
	},
	{
		title: { en: 'Rooms', vi: 'Phòng' },
		align: 'left',
		width: 80,
		dataIndex: 'rooms',
	},
	{
		title: { en: 'Payment Method', vi: 'Hình thức thanh toán' },
		align: 'center',
		width: 50,
		dataIndex: 'payType',
	},
	{
		title: { en: 'Note', vi: 'Ghi chú' },
		width: 100,
		align: 'left',
		dataIndex: 'description',
		isRevenue: true,
	},
	{
		title: { en: 'Revenue (VND)', vi: 'Doanh thu (VND)' },
		align: 'right',
		width: 80,
		dataIndex: 'vnd',
		format: FORMAT_CELL.PRICE,
	},

	{
		title: { en: 'Ota Fee Redux', vi: 'Hoa hồng OTA tự cấn trừ' },
		align: 'right',
		width: 80,
		dataIndex: 'ota_fee_redux',
		format: FORMAT_CELL.PRICE,
	},
	{
		title: { en: 'Ota Fee No Redux', vi: 'Hoa hồng OTA không tự cấn trừ' },
		align: 'right',
		width: 80,
		dataIndex: 'ota_fee_no_redux',
		format: FORMAT_CELL.PRICE,
	},
	// {
	// 	title: { en: 'Commission (OTA)', vi: 'Hoa hồng (OTA)' },
	// 	align: 'right',
	// 	width: 50,
	// 	dataIndex: 'OTAFee',
	// 	format: FORMAT_CELL.PRICE,
	// },
	{
		title: { en: 'Payment Fee', vi: 'Phí thanh toán' },
		align: 'right',
		width: 40,
		dataIndex: 'transactionFee',
		format: FORMAT_CELL.PRICE,
	},
	{
		title: { en: 'Total OTA Fee and Payment Fee', vi: 'Tổng phí OTA và Phí thanh toán' },
		align: 'right',
		width: 60,
		dataIndex: 'commAndTransFee',
		format: FORMAT_CELL.PRICE,
	},
	// {
	// 	title: { en: 'Reduce OTA Commission', vi: 'Cấn trừ hoa hồng OTA' },
	// 	align: 'center',
	// 	width: 80,
	// 	dataIndex: 'isReduxOTAFee',
	// 	format: FORMAT_CELL.CHECK_BOX,
	// },

	{
		title: { en: 'Revenue for Tax Calculation', vi: 'Doanh thu tính thuế' },
		align: 'right',
		width: 110,
		dataIndex: 'revenueForTax',
		hasTax: true,
		format: FORMAT_CELL.PRICE,
	},
	{
		title: { en: 'Manage fee Redux', vi: 'Chi phí quản lý CZ có giảm trừ' },
		align: 'right',
		width: 110,
		dataIndex: 'manageFeeRedux',
		hasTax: true,
		format: FORMAT_CELL.PRICE,
	},
	{
		title: { en: 'Financial Expenses (TNCN Tax)', vi: 'Chi phí tài chính ( thuế TNCN )' },
		align: 'right',
		width: 110,
		dataIndex: 'tax',
		hasTax: true,
		format: FORMAT_CELL.PRICE,
	},
];

const FOOTER_BOOKING_REVENUE_COLUMNS = [
	{ dataIndex: 'text', colSpan: 10, align: 'right' },
	{ dataIndex: 'total', align: 'right', format: FORMAT_CELL.PRICE },
	{ dataIndex: 'totalOTAFeeRedux', align: 'right', format: FORMAT_CELL.PRICE },
	{ dataIndex: 'totalOTAFeeNoRedux', align: 'right', format: FORMAT_CELL.PRICE },
	{ dataIndex: 'totalTransactionFee', align: 'right', format: FORMAT_CELL.PRICE },
	{ dataIndex: 'totalCommAndTransFee', align: 'right', format: FORMAT_CELL.PRICE },
	{ dataIndex: 'totalRevenueForTax', align: 'right', format: FORMAT_CELL.PRICE },
	{ dataIndex: 'totalManageFeeRedux', align: 'right', format: FORMAT_CELL.PRICE },
	{ dataIndex: 'totalTax', align: 'right', format: FORMAT_CELL.PRICE },
];

const COST_DETAIL = [
	{
		title: { en: 'No.', vi: 'STT' },
		dataIndex: 'index',
		align: 'center',
		width: 70,
	},
	{
		title: { en: 'Expense Type', vi: 'Loại chi phí' },
		dataIndex: 'description',
	},
	{
		title: { en: 'Room', vi: 'Phòng' },
		dataIndex: 'roomIds',
		width: 150,
		align: 'center',
		format: FORMAT_CELL.ROOMS,
	},
	{
		title: { en: 'Amount', vi: 'Số tiền' },
		dataIndex: 'vnd',
		width: 150,
		align: 'right',
		format: FORMAT_CELL.PRICE,
	},
];

const TASK_COLUMNS = [
	// {
	// 	title: { en: 'No.', vi: 'STT' },
	// 	dataIndex: 'index',
	// 	align: 'center',
	// 	width: 70,
	// },
	{
		title: { en: 'Status', vi: 'Trạng thái' },
		dataIndex: 'status',
		width: 100,
		format: FORMAT_CELL.TAG,
	},
	{
		title: { en: 'Description', vi: 'Mô tả' },
		dataIndex: 'description',
		width: 150,
	},
	{
		title: { en: 'Time', vi: 'Thời gian' },
		dataIndex: 'time',
		width: 150,
		format: FORMAT_CELL.DATE,
	},
	{
		title: { en: 'Room', vi: 'Phòng' },
		dataIndex: 'roomIds',
		width: 150,
		format: FORMAT_CELL.ROOMS,
	},
	{
		title: { en: 'Fee', vi: 'Chi phí' },
		align: 'right',
		dataIndex: ['fee', 'amount'],
		width: 150,
		format: FORMAT_CELL.PRICE,
	},
	{
		title: { en: 'Assign', vi: 'Phân công' },
		dataIndex: 'assigned',
		width: 150,
		format: FORMAT_CELL.ASSIGN,
	},
];

const SERVICES = {
	HOUR: {
		value: 1,
		label: 'Thuê giờ',
	},
	DAY: {
		value: 3,
		label: 'Thuê ngày',
	},
	NIGHT: {
		value: 2,
		label: 'Qua đêm',
	},
	MONTH: {
		value: 4,
		label: 'Thuê tháng',
	},
};

const RATING_COLUMNS = [
	{
		title: { en: 'OTA', vi: 'OTA' },
		dataIndex: 'ota',
		align: 'center',
		format: FORMAT_CELL.OTA_ICON,
	},
	{
		title: { en: 'Total', vi: 'Tổng đánh giá' },
		dataIndex: 'total',
		align: 'center',
	},
	{
		title: { en: 'Average', vi: 'Điểm trung bình' },
		dataIndex: 'rating',
		format: FORMAT_CELL.RATING_AVR,
		align: 'center',
	},
];

const REVIEW_COLUMNS = [
	{
		title: { en: 'Booking Id', vi: 'Mã đặt phòng' },
		width: '80px',
		// dataIndex: ['bookingId', 'id'],
		dataIndex: 'otaBookingId',
	},
	{
		title: { en: 'OTA', vi: 'OTA' },
		width: '50px',
		dataIndex: 'otaName',
		align: 'center',
		format: FORMAT_CELL.OTA_ICON,
	},
	{
		title: { en: 'Check-in', vi: 'Ngày check-in' },
		dataIndex: ['details', 'checkIn'],
		format: FORMAT_CELL.DATE,
		width: '100px',
	},
	{
		title: { en: 'Customer name', vi: 'Khách hàng' },
		dataIndex: ['bookingId', 'guestId', 'displayName'],
		width: '180px',
	},
	{
		title: { en: 'Comments', vi: 'Đánh giá công khai' },
		dataIndex: 'comments',
		width: '220px',
	},
	{
		title: { en: 'Feedback', vi: 'Đánh giá ẩn danh' },
		dataIndex: 'feedback',
		width: '220px',
	},
	{
		title: { en: 'Rating', vi: 'Điểm' },
		dataIndex: 'rating',
		format: FORMAT_CELL.RATING_REVIEW,
		width: '60px',
	},
];

const OTAS_ICON = {
	agoda: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 203.5 203.5"><path d="M101.7 203.5a101.7 101.7 0 1 1 101.7-101.7 101.8 101.8 0 0 1-101.7 101.7z" fill="#404040"/><path d="M101.7 2.5a99.2 99.2 0 1 0 99.2 99.2 99.3 99.3 0 0 0-99.2-99.2z" fill="#fff"/><path d="M118 59.2c-.5-2.8-1-5.4-1.5-8-1.2-5-4.4-8-9.3-8.2a79.2 79.2 0 0 0-15.5.5c-4 .6-7.3 3.4-9.8 6.8a52.2 52.2 0 0 0-4 5.9c-2.2 4-6.8 4-10.2 3a8.1 8.1 0 0 1-6.1-8c0-7.6 4-13 10-17 6.4-4.4 13.7-6.4 21.3-7 8.6-.7 17.2-.7 25.7 1.4 13 3 19.6 10.5 20.7 24l.5 22.4c-.2 10.3.1 20.5 3.4 30.5 2.2 6.6-3 12.6-10 12.6a9.4 9.4 0 0 1-7.1-3.5l-7-8.6-10.6 6.6c-11.4 6-23.3 7.8-35.5 3-16.6-6.6-21-27.5-8.5-39.6 5.4-5.2 12.4-7 19.4-8.4l32-7.3a19.4 19.4 0 0 0 2-.7zm.5 14L87.4 81a10 10 0 0 0-7 11.3 11.6 11.6 0 0 0 9.2 10.2 22.7 22.7 0 0 0 7.3.5c8.4-1 16-4 18.8-12.6 2-5.3 2-11.2 3-17.2z" fill="#212a33"/><path d="M50.6 145.3A11 11 0 0 1 39.7 156 11.2 11.2 0 0 1 28.9 145c.1-5.8 5.3-11 11-11a11.2 11.2 0 0 1 10.8 11.2z" fill="#ed2227"/><path d="M112.3 145.2a10.8 10.8 0 0 1-10.9 10.7A11.1 11.1 0 0 1 90.8 145c0-5.7 5.4-11 11-10.8a11 11 0 0 1 10.6 11z" fill="#14ad5a"/><path d="M174.2 145a10.9 10.9 0 0 1-10.7 10.9 11 11 0 0 1-10.8-10.9c.1-5.8 5.2-11 11-11a11.3 11.3 0 0 1 10.6 10.9z" fill="#2d7ec1"/><path d="M70.6 155.7A10.5 10.5 0 0 1 60 144.9a10.9 10.9 0 0 1 10.5-10.7c5.8-.1 11.2 5.2 11 11-.2 6.2-5.8 11.2-11 10.6z" fill="#f79e1e"/><path d="M132.4 155.7a10.5 10.5 0 0 1-10.6-10.8 11 11 0 0 1 10.6-10.7 11.2 11.2 0 0 1 10.8 10.9 10.8 10.8 0 0 1-10.9 10.6z" fill="#8050a0"/></svg>`,
	airbnb: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 202.5 202.5"><circle cx="101.2" cy="101.2" r="101.2" fill="#f05b61"/><path d="M134.2 165a32 32 0 0 1-16.7-4.8 59.8 59.8 0 0 1-14-11.3l-1.6-1.6c-.6-.6-1-.5-1.6.1a62.4 62.4 0 0 1-17.6 14.1 31.9 31.9 0 0 1-19.6 3.4 28.7 28.7 0 0 1-17.3-9.5 27.7 27.7 0 0 1-7.2-20.5c.2-5 1.8-9.4 3.8-13.8l19.4-40.8q6.6-13.5 13.5-26.8c2.7-5.2 5-10.6 9-15a21.8 21.8 0 0 1 20.6-7.3 22.5 22.5 0 0 1 16.8 12.2q6.2 11.5 12 23.2L156 113c2 4.6 4.4 9.2 6 14a28.6 28.6 0 0 1-13.6 34.6c-4.6 2.3-7.6 3.6-14.5 3.5zm-10-62.2a39.5 39.5 0 0 1-5.5 20c-3.2 5.7-7.3 11-11 16.4-.5.7-.6 1 0 1.7.4.3.6.7 1 1a48 48 0 0 0 16.8 12.6c8 3.2 16 3 23-3.2a19.4 19.4 0 0 0 5.2-21.6c-1.6-4.3-3.8-8.4-5.7-12.7l-32-65.3c-1.7-3.2-3.3-6.5-6.4-9-4-3.2-8.7-3.4-13.4-2-3.5 1-6 3.7-7.6 7q-4 7.3-7.7 14.8-5 9.5-9.5 19L51 124c-2.2 4.7-3.8 9.4-3.3 14.7a18.3 18.3 0 0 0 9.2 14.7c7.8 4.6 15.7 3.5 23.4-.7a52.6 52.6 0 0 0 12.9-10.5c.7-.7 1.7-1.4 1.8-2s-1-1.5-1.5-2.3c-3.2-5-6.4-9.7-9.5-14.7a44.3 44.3 0 0 1-5.3-14.5 25.8 25.8 0 0 1 .5-12.8c2.6-8.4 8.2-13.4 16.6-15.5a23 23 0 0 1 13 .6 22.6 22.6 0 0 1 9.8 6 21.1 21.1 0 0 1 5.8 15.8zm-9 .3a31.8 31.8 0 0 0-.3-3.2 12.6 12.6 0 0 0-5.7-8.7c-3-2-6.3-2.2-9.7-2a12.6 12.6 0 0 0-11.7 9.4c-1.2 5.3-.1 10.4 1.8 15.4 2.6 6.6 6.6 12.4 10.8 18 .6.8 1 .8 1.6 0l7.5-11.4a39 39 0 0 0 5.6-17.6z" fill="#fff"/></svg>`,
	booking: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 202.5 202.5"><circle cx="101.23" cy="101.23" r="101.23" fill="#263e7b"/><path d="M109.16 97.44l1.8 1.16c11 5.54 15 17.65 13.8 27.86-1.8 14.8-11.66 24.76-27.08 27.4a68.85 68.85 0 0 1-10.81 1h-37.3c0-1.06-.12-1.9-.12-2.73q0-46.52 0-93c0-8.08 4.72-12.86 12.78-12.8l30.28.46a32.32 32.32 0 0 1 15.22 4.68c15.6 9.12 17.65 31.63 4 43.78-.72.64-1.53 1.3-2.56 2.2zm-38.58 38.62c7 0 13.8.42 20.5-.12s10.62-4.63 11.84-11.24c1.83-9.95-4.2-17.4-14.3-17.6-3.47-.06-6.94 0-10.4 0-5.2 0-7.5 2-7.6 7.17-.15 7.17-.04 14.35-.04 21.78zm.1-46.17c6.1 0 12.16.2 18.18-.07 4.5-.2 7.57-2.87 9.24-7a15.6 15.6 0 0 0 .73-9.27c-1-4.65-4.1-8.1-8.84-8.65a80.14 80.14 0 0 0-13.43-.33c-3.72.2-5.67 2.2-5.8 5.93-.26 6.42-.07 12.87-.07 19.4zm64.58 52.94a13.1 13.1 0 1 1 13.14 13.3 13.13 13.13 0 0 1-13.14-13.3z" fill="#fff"/></svg>`,
	tb: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 202.5 202.5"><circle cx="101.23" cy="101.23" r="101.23" fill="#0bb3c8"/><g fill="#fff"><path d="M131.85 96.26a31.08 31.08 0 1 1 0-17.87l20.15-4.1a51.57 51.57 0 1 0-89.51 46l39.65 46.4 39.55-46.4a51.55 51.55 0 0 0 10.32-20z"/><circle cx="102.09" cy="87.32" r="15.49"/></g></svg>`,
	ctrip: `<svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><defs><style>.cls-1{fill:none;}.cls-2{fill:#3c74b9;}.cls-3{fill:#f89921;}</style></defs><title>caheo</title><rect class="cls-1" width="150" height="150"/><path class="cls-2" d="M132.87,93c-8.15-.17-10.48,5.82-10.81,15.14s-12.48,28.12-29.78,25.62S58.67,123,65.32,87.37c-6,8.32-14,47.08,25.45,57.23-32.28,2-49.41-28.95-43.09-51.41S69.43,62.92,73.31,65.58s1,9.09-5,14.64c2.77.55,13.31-.22,21.18-8.65s5.66-16.41,5.66-18.41,3-3.44,7.1-4.77,8.65-1.77,16.08-5.1c-12.09-4.1-9.76-5.77-8.32-5.32,14.09,5.55,25.73-.33,26.84-6.77s-5-9-14.2-9.21c0-7.65-6.32-25.07-33.27-20.63S45.91,25.65,45.91,25.65C27.61,20.88,7,29.42,8.09,42.18c1.66,1,4.33-.33,8.87-2,7.87-2.22,12.26,4.1,8.93,9.93-8.15,14.14-10.65,38.76-2.33,59.06s35.77,45.09,73.37,38.93,43.09-28.62,44.25-37.93S141,93.2,132.87,93Zm-31-75.36a7.33,7.33,0,0,1,3.28.78h-.21A6,6,0,1,0,107.35,30a7.37,7.37,0,1,1-5.48-12.3Zm3.72,4.66a1.77,1.77,0,1,1-1.77-1.77A1.77,1.77,0,0,1,105.58,22.32Z" transform="translate(0)"/><path class="cls-3" d="M122.05,108.17c.3-8.27,2.17-13.9,8.28-15-1.46-10.61-6.45-11.73-12.11-10.83-6.32,1-8.15,7.15-7,12.81S112.9,122.81,92.77,128c-9.79,2.51-16.35.45-20.51-2.32,5.32,4.92,12.57,7.07,20,8.15C109.58,136.29,121.72,117.49,122.05,108.17Z" transform="translate(0)"/></svg>`,
	expedia: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 202.5 202.6"><circle cx="101.2" cy="101.3" r="101.2" fill="#ffc814"/><path d="M196.7 68a101 101 0 0 1-15.9 96.1A101.2 101.2 0 0 1 2.1 121.7L81.5 103c9.5-2 18.8-5 28.2-7.7l12.3-3.5.5 2.2q1 4.7 2.2 9.5a3.4 3.4 0 0 1 0 1q-.2 2.2-.4 4.4l-4.3 49.8c-.1.8-.1 1.6-.2 2.5l5.5-1.8a1 1 0 0 0 .7-.7q6.3-20.2 12.6-40.4 5.2-16.8 10.5-33.7a1.2 1.2 0 0 1 .9-.9q17-5 34.3-9.8a45.2 45.2 0 0 0 10.9-5.2zm-3.7-9.3l-3.5.2a43 43 0 0 0-11 1.8L146 70a.9.9 0 0 1-1-.2l-49.5-43q-4.7-4-9.3-8a.7.7 0 0 0-.5-.2L80 20s-.1 0-.1.1l34 45.7a3 3 0 0 1 .4.8q2 5.3 3.7 10.5c.2.7.2.7-.4 1l-32.4 9.3c-3.4 1-6.6 2.3-10 3.4l-74 25.7A99.1 99.1 0 0 1 6.8 65C17.4 38 36 18.8 62.8 7.7a101 101 0 0 1 130.2 51z" fill="#14375d"/></svg>`,
	go2joy: `<svg
			version="1.1"
			id="Layer_1"
			xmlns="http://www.w3.org/2000/svg"
			xmlns:xlink="http://www.w3.org/1999/xlink"
			x="0px"
			y="0px"
			viewBox="0 0 510 510"
			style="enable-background:new 0 0 510 510;"
			xml:space="preserve"
		>
			<style type="text/css">
				.st0 {
					fill: #f0562a;
				}
				.st1 {
					fill: #f06723;
				}
				.st2 {
					fill: #ffffff;
				}
			</style>
			<path
				class="st0"
				d="M406.6,510H103.4C46.5,510,0,463.5,0,406.6V103.4C0,46.5,46.5,0,103.4,0h303.3C463.5,0,510,46.5,510,103.4
	   v303.3C510,463.5,463.5,510,406.6,510z"
			/>
			<path
				class="st1"
				d="M400.9,493.4H109.1c-50.9,0-92.5-41.6-92.5-92.5V109.1c0-50.9,41.6-92.5,92.5-92.5h291.8
	   c50.9,0,92.5,41.6,92.5,92.5v291.8C493.4,451.8,451.8,493.4,400.9,493.4z"
			/>
			<path
				class="st2"
				d="M232.7,280.6c-12.6,0-24.2,0-36.1,0c0-16.9,0-33.3,0-50.3c30.4,0,61,0,91.7,0c8.3-30.4,29.4-50.1,53.6-67.2
	   c9.9-7,20-13.9,29.6-21.3c4.2-3.2,8.1-7.1,11.1-11.4c8-11.3,3.3-26.3-9.5-31.5c-12.2-5-23.4-2.2-32.9,6.3
	   c-5.1,4.6-9.3,10.3-14.2,15.8c-13.6-9.1-27.7-18.5-41.9-28.1c0.5-1.3,0.8-2.4,1.3-3.4c17.6-33.2,55.8-52.3,93.1-47
	   c16.5,2.4,31.7,7.5,44.7,18.2c14.5,12,21.9,27.7,23.5,46.3c2.5,30.4-10.9,53.6-33.9,71.7c-11.8,9.2-24.7,16.9-36.9,25.6
	   c-6.5,4.6-12.9,9.5-18.8,14.8c-2.8,2.6-4.4,6.6-7.2,11.2c34.6,0,67.4,0,100.5,0c0.1,2.1,0.2,3.7,0.2,5.3c0,47.5,0.1,95,0,142.5
	   c-0.1,21.8-6.9,41-23.6,55.7c-16.1,14.2-35.4,20-56.7,19.7c-40.2-0.4-68.1-26.8-76-68.5c-0.3-1.6-1-3.3-0.8-4.9
	   c0.2-1.3,1.1-3.3,2.1-3.6c16.2-4.9,32.4-9.7,49-14.5c1,4.5,1.5,8.9,3,12.8c2.3,6,4.8,12.1,8.4,17.4c5.4,7.9,14.1,10.3,23,7.6
	   c7.5-2.2,12.6-9.4,13.3-18.8c0.1-2,0.1-4,0.1-6c0-29.5,0-59,0-88.5c0-1.8,0-3.6,0-6c-2.3,0-4,0-5.8,0c-31,0-62,0.1-93-0.1
	   c-4.1,0-5.5,0.9-6.4,5.2c-9.6,48.3-46.9,84.5-95.7,93.7c-28.4,5.3-56.1,4.4-82.4-8.6c-38.5-19-60.3-50.8-68.7-92.1
	   c-5.6-27.1-4.5-54.1,5.3-80.2c14.3-37.9,41.1-63.5,79.7-75.5c43.2-13.5,84.8-10,123.5,15.1c5.3,3.4,9.9,7.8,14.9,11.8
	   c2.6,2.1,5.1,4.3,8,6.7c-11.4,15.1-22,29.1-32.3,42.7c-7.3-5.8-14-11.6-21.2-16.6c-43.1-30.2-114.6-5.6-121.2,57.9
	   c-3.1,30.4,15.4,66.6,39.7,79.1c33.6,17.2,75.9,4,92-29.2C230.3,287.6,231.2,284.5,232.7,280.6z"
			/>
		</svg>`,
	traveloka: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 102 102" stroke="none" stroke-linecap="round" stroke-linejoin="round" fill="#fff" fill-rule="nonzero"><path d="M1 51C1 23 23 1 51 1s50 22 50 50-22 50-50 50S1 79 1 51z" fill="#259fda"/><path d="M56 20s-1 14 0 22 6 21 9 26c4 6 15 11 15 11-1 0-2-1-3-1 0 1 1 2 1 2s-9-6-17-7c-9-2-14-3-20-5-5-1-7-6-9-8s-10-5-20-7c11 2 14 2 15 2 1-1 4-3 7-1 4 1 5 2 6 1 2 0 3-4 2-7 0-2-4-9-2-16 2-6 11-11 16-12z"/><path d="M56 39v3c1 7 5 19 9 25-1-2-1-4-1-5 4-9 15-24 24-33-15 1-29 8-32 10z" fill="#f3f3f5"/><path d="M56 39v3c1 7 5 19 9 25-1-2-1-3-1-4-2-9-2-21-2-27-3 1-5 2-6 3z" fill="#dfe0e1"/></svg>`,
};

const LOGO_INTRO_PAGE =
	'data:image/png;base64,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';

const LOGO_TASK =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAABQBAMAAAC35AtgAAAACXBIWXMAABcRAAAXEQHKJvM/AAAAHlBMVEVHcEwAWXseW3UAWXsAWXsAWXv0eSD0eSD0eSD0eSARYEPvAAAACXRSTlMA/yxl1J1UyosWnlOmAAACC0lEQVRIx61Wy1KDMBRloFa3kbDHPmZcQrF7AdnT1g/ouKjjzumuO8eV/QFr/lZISHKTXDIuvCvK6bm5zxOCQFu4fiKENrs0wGzegdyaFYKuiTK69aEIviSG0cxAo9KESWLEtyG21eOuLfehSyYk9pE7y8ZPhvQrFCV0CD7HYVKJwFTOtCmK4lnnbvqmK9G30gguN1CYCPcu/6zb8ABij5wyqDL1sU/sKgD3mTo6hh2S9EqVrDUavJCcIWtqzl8oMx8iu7WmR/hsZFEG3+EhBd7rVJ4i3t6f2GUvS8nn8U4czd9NT4yxSyoOF9Oeg7TeWG9H/lykIAYe2ZSj7AJDFHk99o/XAmZ7B261b8beAQzyOg/wtwPzfpz+Bv/8G1xqGAsNSezoL8uH09gKFhVOBmzJGRy9grDYlxtO3ovNEvJmjMNrB38KsekmKdMbNgzT4etFD1M/LhFcVjukWo+sOcilnLGNu0Nqi2K1RBUy5v3LBXHXRG5tqx9rl9xTpLQAGVxCccltlVX6y+OZWCo8N6Un1EK3m81mWpioI3v0yZG9EcVVlQpLFE0sJbGstRowQtYyCG3r1hhR8xFJNzoYecku3Rou+z5JURnE7kCEntmwcRPG7vW+9JGNyibYt8PCbQZKR8ma3uLwMKEJ/t0iK1uNoKIxdIws6KNkTveQe7qH3DWGZj442Jk/fwFq0bgy1Q/mRwAAAABJRU5ErkJggg==';

const CHECBOX_SVG =
	'<svg class="svg-icon" style="width: 1em; height: 1em;vertical-align: middle;fill: currentColor;overflow: hidden;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M863.576287 208.933543 426.318572 673.529907 128.084167 464.780559 64.132646 496.746598 447.865307 848.494801 959.52557 208.933543Z"  /></svg>';

const LOGO_HEADER_STICKY =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGkAAAAeBAMAAADdiy1wAAAAJFBMVEVHcEwAWXv0eSB2ZloAWXsAWXv0eSD0eSAAWXsAWXv0eSD0eSD5ntLLAAAADHRSTlMA/vsbRNrQmniwNmxvPIbpAAACG0lEQVQ4y52Uz0sbQRTHH0xwdXpacMG9yRRW0MvAYlNvCd2AuTWYgMewwhbsJWxveok0Qr1Fmhy8BQoWkkvwoKD/XL/v7SYk/QEdH+zssHmffN+vGSIi1Wz5wciSk6mmz3bqhh35hY1coEqrpIKaA3XIRIeXtkNWt74fDuIEr+D/M9uE99cy0L5LgNuyaRSbyvG3D1gTNqumNJvrKT5PJ6R/6KdnotnlhOhKJPBDBT3DOoZ2n7akPn1tZqbrRaDyM3p38GhMr2rMZ6JbTudndk50NygUfX+n7MZQmTzrbZTUxl70ku7ll3k0oRZ8dGrMpKhNyz+9gchWp4M8azqFx1LLfMGzT9r0iLN5YyBd1iaooaonKo6v5e8Qw1IrsvCEX9oVygPVLWsTEtW5LKjpkFQKJ28ZIUFnjv3ub1qHEAC1I7yF1nxFa0E97EpeKjWIP15QvHCYSJMp7y+U1LCaXRCNB3ahtY3S81j+U6su/YplSNqoeMgtbMuz1LJ/UEfcnnI2Thjtcx3wHiVJTbQ8dEWn61QF3eQ5fC9ziHTCMYJrlF1mSptzujfrFPGwD5JjQCgaNYsjUxfqo2hRHmVR/nadkuEJFudLXctd0OiwDVXGVDU1F/dn5H0ClWGGHrvFAVs9yxh1fIzZrHQDsz0lZfGNpGwU25V7o+12RxVigePVVoh9J0djsdC6UpuvkSJ19QopFnOXgt24Sf0CFWaT7XbKnVUAAAAASUVORK5CYII=';

const STAR_ICON =
	'<svg height="20" width="20" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 47.94 47.94" xml:space="preserve"><path style="fill:#ffcf15;" d="M26.285,2.486l5.407,10.956c0.376,0.762,1.103,1.29,1.944,1.412l12.091,1.757c2.118,0.308,2.963,2.91,1.431,4.403l-8.749,8.528c-0.608,0.593-0.886,1.448-0.742,2.285l2.065,12.042c0.362,2.109-1.852,3.717-3.746,2.722l-10.814-5.685c-0.752-0.395-1.651-0.395-2.403,0l-10.814,5.685c-1.894,0.996-4.108-0.613-3.746-2.722l2.065-12.042c0.144-0.837-0.134-1.692-0.742-2.285l-8.749-8.528c-1.532-1.494-0.687-4.096,1.431-4.403l12.091-1.757c0.841-0.122,1.568-0.65,1.944-1.412l5.407-10.956 C22.602,0.567,25.338,0.567,26.285,2.486z"/>';

module.exports = {
	PERFORMANCE_TYPES,
	OVERVIEW_COLUMNS,
	REVENUES_COLUMNS,
	REPORT_TYPES,
	FORMAT_CELL,
	FOOTER_BOOKING_REVENUE_COLUMNS,
	COST_DETAIL,
	LOGO_TASK,
	LOGO_INTRO_PAGE,
	CHECBOX_SVG,
	RESOUCRE_DIRECTORY_TEMPLATE,
	LOGO_HEADER_STICKY,
	OPERATION_REPORT_CATEGORIES,
	REPORT_TYPE,
	TEXT,
	TASK_COLUMNS,
	SERVICES,
	STAR_ICON,
	RATING_COLUMNS,
	OTAS_ICON,
	REVIEW_COLUMNS,
	REPORT_CATEGORIES,
};

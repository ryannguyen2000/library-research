const HOST_REPORT_FEE_GROUP_DEFAULT = {
	electric: { name: { vi: 'Chi phí tiền điện', en: 'Electric cost' }, hiddenOnNull: false, isCalcDistribute: false },
	water: {
		name: {
			vi: 'Chi phí tiền nước',
			en: 'Water cost',
		},
		hiddenOnNull: false,
		isCalcDistribute: false,
	},
	internet: {
		name: {
			vi: 'Chi phí Internet',
			en: 'Internet cost',
		},
		hiddenOnNull: false,
		isCalcDistribute: false,
	},
	repair: {
		name: {
			vi: 'Chi phí sữa chữa thay thế mới',
			en: 'New replacement repair cost',
		},
		hiddenOnNull: false,
		isCalcDistribute: false,
	},
	security: {
		name: {
			vi: 'Chi phí an ninh',
			en: 'Security fee',
		},
		hiddenOnNull: false,
		isCalcDistribute: false,
	},
	investment: {
		name: {
			vi: 'Thu hồi vốn đầu tư',
			en: 'Investment',
		},
		hiddenOnNull: false,
		isCalcDistribute: false,
	},
	maintenance: {
		name: {
			vi: 'Chi phí bảo trì',
			en: 'Maintaince fee',
		},
		hiddenOnNull: false,
		isCalcDistribute: false,
	},
	payment_fee: {
		name: {
			vi: 'Chi phí thanh toán các kênh',
			en: 'Payment fee',
		},
		hiddenOnNull: false,
		isCalcDistribute: false,
	},
	financial_expenses: {
		name: {
			vi: 'Chi phí tài chính',
			en: 'Financial expenses',
		},
		hiddenOnNull: false,
		isCalcDistribute: false,
	},
	other: {
		name: {
			vi: 'Chi hộ khác',
			en: 'Others',
		},
		hiddenOnNull: false,
		isOther: true,
		isCalcDistribute: false,
	},
};

module.exports = { HOST_REPORT_FEE_GROUP_DEFAULT };

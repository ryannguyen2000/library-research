const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.CASHIER,
		to: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
		line: 28,
	},
	{
		from: CASH_FLOW_OBJECT.CASHIER,
		to: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		line: 29,
	},
	{
		from: CASH_FLOW_OBJECT.CASHIER,
		to: CASH_FLOW_OBJECT.CASH_FUND,
		line: 30,
	},
	{
		from: CASH_FLOW_OBJECT.CASHIER,
		to: CASH_FLOW_OBJECT.HOST_CASH_FUND,
		line: 31,
	},
	{
		from: CASH_FLOW_OBJECT.CASHIER,
		to: CASH_FLOW_OBJECT.REFUND,
		line: 32,
	},
];

module.exports = {
	LINES,
	name: CASH_FLOW_OBJECT.CASHIER,
};

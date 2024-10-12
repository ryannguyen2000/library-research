const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.USER_CONFIRMED,
		to: CASH_FLOW_OBJECT.CASHIER,
		line: 24,
	},
	{
		from: CASH_FLOW_OBJECT.USER_CONFIRMED,
		to: CASH_FLOW_OBJECT.CASH_FUND,
		line: 25,
	},
	{
		from: CASH_FLOW_OBJECT.USER_CONFIRMED,
		to: CASH_FLOW_OBJECT.HOST_CASH_FUND,
		line: 26,
	},
	{
		from: CASH_FLOW_OBJECT.USER_CONFIRMED,
		to: CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND,
		line: 27,
	},
];

module.exports = {
	name: CASH_FLOW_OBJECT.USER_CONFIRMED,
	LINES,
};

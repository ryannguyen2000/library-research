const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND,
		to: CASH_FLOW_OBJECT.CASH_FUND,
		line: 67,
	},
	{
		from: CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND,
		to: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
		line: 68,
	},
];

module.exports = {
	name: CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND,
	LINES,
};

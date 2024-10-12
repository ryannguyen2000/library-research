const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
		to: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
		line: 20,
	},
	{
		from: CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
		to: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		line: 21,
	},
	{
		from: CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
		to: CASH_FLOW_OBJECT.CASH_FUND,
		line: 22,
	},
];

module.exports = {
	LINES,
	name: CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
};
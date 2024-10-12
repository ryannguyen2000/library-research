const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.B2B,
		to: CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT,
		line: 15,
	},
	{
		from: CASH_FLOW_OBJECT.B2B,
		to: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		line: 16,
	},
	{
		from: CASH_FLOW_OBJECT.B2B,
		to: CASH_FLOW_OBJECT.CASH_FUND,
		line: 17,
	},
	{
		from: CASH_FLOW_OBJECT.B2B,
		to: CASH_FLOW_OBJECT.HOST_CASH_FUND,
		line: 18,
	},
	{
		from: CASH_FLOW_OBJECT.B2B,
		to: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
		line: 19,
	},
];

module.exports = {
	LINES,
	name: CASH_FLOW_OBJECT.B2B,
};

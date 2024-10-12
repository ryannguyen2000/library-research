const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.SERVICES,
		line: 44,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.COMMISSION_OTA,
		line: 45,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.HOST_INCOME,
		line: 46,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.MANAGE_FEE,
		line: 47,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.MAINTENANCE,
		line: 48,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.BUY_EQUIPMENT,
		line: 49,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.OTHER_FEE,
		line: 50,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.TRANSACTION_FEE,
		line: 51,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.REFUND,
		line: 52,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
		line: 71,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.TAX,
		line: 77,
	},
	{
		from: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
		to: CASH_FLOW_OBJECT.COMMISSION_tb,
		line: 86,
	},
];

module.exports = {
	LINES,
	name: CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT,
};

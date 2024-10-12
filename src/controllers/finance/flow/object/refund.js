const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.REFUND,
		to: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
		line: 69,
	},
	{
		from: CASH_FLOW_OBJECT.REFUND,
		to: CASH_FLOW_OBJECT.GUEST_REFUNDED,
		line: 70,
	},
];

module.exports = {
	name: CASH_FLOW_OBJECT.REFUND,
	LINES,
};

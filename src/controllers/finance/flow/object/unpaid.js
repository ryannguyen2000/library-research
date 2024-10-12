const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.UNPAID,
		to: CASH_FLOW_OBJECT.BACKUP_CASH_FUND,
		line: 7,
	},
];

module.exports = {
	LINES,
	name: CASH_FLOW_OBJECT.UNPAID,
};

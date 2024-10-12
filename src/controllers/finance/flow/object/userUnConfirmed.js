const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.USER_UNCONFIRMED,
		to: CASH_FLOW_OBJECT.USER_CONFIRMED,
		line: 23,
	},
];

module.exports = {
	LINES,
	name: CASH_FLOW_OBJECT.USER_UNCONFIRMED,
};

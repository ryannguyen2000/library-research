const { CASH_FLOW_OBJECT } = require('@utils/const');

const LINES = [
	{
		from: CASH_FLOW_OBJECT.GUEST,
		to: CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM,
		line: 1,
	},
	{
		from: CASH_FLOW_OBJECT.GUEST,
		to: CASH_FLOW_OBJECT.OTA_COLLECT,
		line: 2,
	},
	{
		from: CASH_FLOW_OBJECT.GUEST,
		to: CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT,
		line: 3,
	},
	{
		from: CASH_FLOW_OBJECT.GUEST,
		to: CASH_FLOW_OBJECT.USER_CONFIRMED,
		line: 4,
	},
	{
		from: CASH_FLOW_OBJECT.GUEST,
		to: CASH_FLOW_OBJECT.B2B,
		line: 5,
	},
	{
		from: CASH_FLOW_OBJECT.GUEST,
		to: CASH_FLOW_OBJECT.USER_UNCONFIRMED,
		line: 6,
	},
];

module.exports = {
	LINES,
	name: CASH_FLOW_OBJECT.GUEST,
};

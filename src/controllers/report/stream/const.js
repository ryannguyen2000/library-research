const { Services, REPORT_STREAM_TRANSACTION_TYPES, REPORT_STREAM_SOURCES } = require('@utils/const');

const SERVICES_COMMISSION_LABEL = {
	[Services.Day]: 'Daily Commission Fee Revenue',
	[Services.Night]: 'Overnight Commission Fee Revenue',
	[Services.Hour]: 'Hourly Commission Fee Revenue',
	[Services.Month]: 'Monthly Commission Fee Revenue',
};

const REPORT_STREAM_TRANSACTION_TYPES_LABEL = {
	[REPORT_STREAM_TRANSACTION_TYPES.REVENUE_INFO]: 'Revenue of Hotel',
	[REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_INFO]: 'Cost of Hotel',
	[REPORT_STREAM_TRANSACTION_TYPES.PROFIT_INFO]: 'Profit of Hotel',
	// [REPORT_STREAM_TRANSACTION_TYPES.REVENUE_CALCULATION]: 'Profit of Cozrum',
	// [REPORT_STREAM_TRANSACTION_TYPES.OWNER_PROFIT]: 'Profit of Owner',
};

const REPORT_STREAM_TRANSACTION_SOURCES_LABEL = {
	[REPORT_STREAM_SOURCES.CZ]: 'Profit of Cozrum',
	[REPORT_STREAM_SOURCES.OWNER]: 'Profit of Owner',
};

module.exports = {
	SERVICES_COMMISSION_LABEL,
	REPORT_STREAM_TRANSACTION_TYPES_LABEL,
	REPORT_STREAM_TRANSACTION_SOURCES_LABEL,
};

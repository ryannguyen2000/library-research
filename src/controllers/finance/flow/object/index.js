// const { CASH_FLOW_OBJECT } = require('@utils/const');

// module.exports = {
// 	[CASH_FLOW_OBJECT.GUEST]: require('./guest'),
// 	[CASH_FLOW_OBJECT.UNPAID]: require('./unpaid'),
// 	[CASH_FLOW_OBJECT.OTA_COLLECT]: require('./otaCollect'),
// 	[CASH_FLOW_OBJECT.THIRD_PARTY_PAYMENT]: require('./thirdPartyPayment'),
// 	[CASH_FLOW_OBJECT.B2B]: require('./b2b'),
// 	[CASH_FLOW_OBJECT.USER_CONFIRMED]: require('./userConfirmed'),
// 	[CASH_FLOW_OBJECT.USER_UNCONFIRMED]: require('./userUnConfirmed'),
// 	[CASH_FLOW_OBJECT.CASHIER]: require('./cashier'),
// 	[CASH_FLOW_OBJECT.COMPANY_BANK_ACCOUNT]: require('./bankAccountCompany'),
// 	[CASH_FLOW_OBJECT.HOST_BANK_ACCOUNT]: require('./bankAccountHost'),
// 	[CASH_FLOW_OBJECT.CASH_FUND]: require('./cashFund'),
// 	[CASH_FLOW_OBJECT.SALARY_ADVANCE_FUND]: require('./salaryAdvFund'),
// 	[CASH_FLOW_OBJECT.WAIT_FOR_ACCOUNTANT_TO_CONFIRM]: require('./waitForAccountantConfirmation'),
// };

const fs = require('fs');

function loadOTAs() {
	const modules = {};

	fs.readdirSync(__dirname)
		.filter(n => n !== 'index.js')
		.forEach(name => {
			// const modelName = name.replace('.js', '');
			const module = require(`./${name}`);
			const moduleName = module.name || (module.LINES && module.LINES[0] && module.LINES[0].from);

			modules[moduleName] = module;
		});

	return modules;
}

module.exports = loadOTAs();

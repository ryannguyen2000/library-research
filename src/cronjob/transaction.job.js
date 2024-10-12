const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const models = require('@models');

async function transactionJob() {
	try {
		await models.BankAccount.getTransactions();
	} catch (e) {
		logger.error('transactionJob error', e);
	}
}

schedule.scheduleJob('*/20 * * * *', transactionJob);

const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const payoutAuto = require('@controllers/finance/auto');

async function runAutos() {
	try {
		await payoutAuto.runAutos();
	} catch (e) {
		logger.error('cronjob.runAutos', e);
	}
}

schedule.scheduleJob('*/10 * * * *', runAutos);

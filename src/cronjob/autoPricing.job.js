const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const { runAuto } = require('@controllers/pricing/newAuto');

async function runPricingAutos() {
	try {
		await runAuto();
	} catch (e) {
		logger.error('cronjob.runPricingAutos', e);
	}
}

schedule.scheduleJob('*/5 * * * *', runPricingAutos);

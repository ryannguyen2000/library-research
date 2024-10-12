const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const { runPromotionAutoTimer, runPromotionAutoDynamic } = require('@controllers/promotion/promotionAuto');

async function runTimerAutos() {
	try {
		await runPromotionAutoTimer();
	} catch (e) {
		logger.error('cronjob.runTimerAutos', e);
	}
}

async function runDynamicAutos() {
	try {
		await runPromotionAutoDynamic();
	} catch (e) {
		logger.error('cronjob.runDynamicAutos', e);
	}
}

schedule.scheduleJob('*/1 * * * *', runTimerAutos);
schedule.scheduleJob('*/1 * * * *', runDynamicAutos);

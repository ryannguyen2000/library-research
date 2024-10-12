const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const PayoutAuto = require('@controllers/finance/payoutGroupAuto');

async function job() {
	try {
		await PayoutAuto.createAutoReports().catch(e => {
			logger.error('createAutoReports.job', e);
		});

		await PayoutAuto.createAutoCollectorReports().catch(e => {
			logger.error('createAutoCollectorReports.job', e);
		});

		await PayoutAuto.confirmAutoReports().catch(e => {
			logger.error('confirmAutoReports.job', e);
		});

		await PayoutAuto.autoFiles().catch(e => {
			logger.error('autoFiles.job', e);
		});
	} catch (e) {
		logger.error('autoReport.job', e);
	}
}

schedule.scheduleJob('0 7 * * *', job);

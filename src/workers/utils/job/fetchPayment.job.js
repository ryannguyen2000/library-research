const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const payments = require('@controllers/ota_api/payments');

async function job() {
	await Object.values(payments)
		.filter(p => p.fetchAll)
		.asyncForEach(payment =>
			payment.fetchAll().catch(e => {
				logger.error(e);
			})
		);
}

schedule.scheduleJob('10 9,17 * * *', job);

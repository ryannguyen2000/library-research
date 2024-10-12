const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const models = require('@models');

async function clearJobPrice() {
	try {
		const dateClear = new Date();
		dateClear.setDate(dateClear.getDate() - 3);

		await models.JobPricing.deleteMany({
			done: true,
			createdAt: { $lte: dateClear },
		});
	} catch (e) {
		logger.error('job sys clearJobPrice error', e);
	}
}

schedule.scheduleJob('3 5 * * *', clearJobPrice);

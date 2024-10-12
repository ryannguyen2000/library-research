const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const { syncReviews } = require('@controllers/review/thread');

async function jobReview() {
	try {
		await syncReviews();
	} catch (e) {
		logger.error('jobReview', e);
	}
}

schedule.scheduleJob('0 6 * * 1', jobReview);

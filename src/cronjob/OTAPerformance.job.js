const schedule = require('node-schedule');
const { logger } = require('@utils/logger');
const { fetchPerformance } = require('@controllers/performance/ota');

schedule.scheduleJob('30 8 * * *', () => {
	fetchPerformance().catch(e => {
		logger.error('Run performance fetch automation', e);
	});
});

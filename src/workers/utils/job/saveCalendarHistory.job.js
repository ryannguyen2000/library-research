// const schedule = require('node-schedule');
// const moment = require('moment');
// const { logger } = require('@utils/logger');
// const models = require('@models');

// async function saveCalendarHistory() {
// 	try {
// 		const from = moment();
// 		const to = moment().add(60, 'day');

// 		const calendars = await models.BlockCalendar.aggregate([
// 			{
// 				$match: {
// 					date: {
// 						$gte: from.format('Y-MM-DD'),
// 						$lte: to.format('Y-MM-DD'),
// 					},
// 				},
// 			},
// 			{
// 				$project: {
// 					_id: 0,
// 					createdAt: 0,
// 					updatedAt: 0,
// 				},
// 			},
// 		]);
// 		const time = moment().format('Y-MM-DD-HH');
// 		await models.BlockCalendarHistory.insertMany(
// 			calendars.map(c => ({
// 				...c,
// 				time,
// 			}))
// 		);
// 	} catch (e) {
// 		logger.error(e);
// 	}
// }

// schedule.scheduleJob('3 */1 * * *', saveCalendarHistory);

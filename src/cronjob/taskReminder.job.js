const schedule = require('node-schedule');
const moment = require('moment');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { TaskStatus, TaskReminderType } = require('@utils/const');
const models = require('@models');
const { sendAutoTaskMessage } = require('@controllers/message/autoTask');

const LIMIT = 10;

async function runChunkedTasks(filters, page = 1) {
	const tasks = await models.Task.find(filters)
		.skip((page - 1) * LIMIT)
		.limit(LIMIT);

	if (!tasks.length) return;

	await tasks.asyncForEach(task => sendAutoTaskMessage(task, true));

	if (tasks.length === LIMIT) {
		await Promise.delay(1000);
		await runChunkedTasks(filters, page + 1);
	}
}

async function remindTasks() {
	try {
		const reminderTime = moment().format('HH:mm');

		const categories = await models.TaskCategory.find({ reminder: true, reminderTime }).select('_id reminderType');
		if (!categories.length) return;

		const groupCtgs = _.groupBy(categories, 'reminderType');

		const filters = {
			status: { $in: [TaskStatus.Confirmed, TaskStatus.Waiting, TaskStatus.Checked] },
			reminder: true,
			$and: [
				{
					$or: [
						{
							notificationType: { $ne: null },
						},
						{
							reminderNotificationType: { $ne: null },
						},
					],
				},
				{
					$or: _.entries(groupCtgs).map(([reminderType, ctgs]) => ({
						category: { $in: ctgs.map(c => c._id) },
						time:
							reminderType === TaskReminderType.AllTime
								? {
										$gte: moment().subtract(6, 'month').toDate(),
										$lte: new Date(`${moment().format('YYYY-MM-DD')}T23:59:59.000Z`),
								  }
								: {
										$gte: new Date(`${moment().format('YYYY-MM-DD')}T00:00:00.000Z`),
										$lte: new Date(`${moment().format('YYYY-MM-DD')}T23:59:59.000Z`),
								  },
					})),
				},
			],
		};

		const disabledBLocks = await models.Block.find({ disableReminderTask: true }).select('_id');
		if (disabledBLocks.length) {
			filters.blockId = { $nin: _.map(disabledBLocks, '_id') };
		}

		await runChunkedTasks(filters);
	} catch (e) {
		logger.error('job remindTasks', e);
	}
}

schedule.scheduleJob('*/1 * * * *', remindTasks);

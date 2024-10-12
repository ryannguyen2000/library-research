const schedule = require('node-schedule');
const moment = require('moment');
const _ = require('lodash');

const models = require('@models');
const { TaskStatus, TaskSource, TaskTags, TaskReason, TaskAutoCreateTimeType } = require('@utils/const');
const { logger } = require('@utils/logger');

const CHUNK_SIZE = 50;
const ALL_BLOCK = 'ALL_BLOCK';

function getTaskData({ taskCategory, blockId, time, note }) {
	const { _id, parent, departmentIds, notificationType, reminderNotificationType, reminder } = taskCategory;
	const category = parent ? { category: parent, subCategory: _id } : { category: _id };
	const data = {
		...category,
		time,
		status: TaskStatus.Waiting,
		blockId,
		departmentId: departmentIds[0],
		notificationType,
		reminderNotificationType,
		reminder,
		assigned: [],
		other: {},
		fee: {},
		assetIssueIds: [],
		roomIds: [],
		source: TaskSource.Auto,
		note,
	};

	if (taskCategory.tag === TaskTags.GUEST_REQUEST) data.reason = TaskReason.GuestRequest;

	return data;
}

function getConditions(time) {
	const hour = time.format('HH:mm');
	const dayOfWeek = time.day();
	const date = time.date();
	const conditions = [
		{ time: hour, type: TaskAutoCreateTimeType.DAILY },
		{ time: hour, day: dayOfWeek, type: TaskAutoCreateTimeType.WEEKLY },
		{ time: hour, date, type: TaskAutoCreateTimeType.MONTHLY },
	];

	const validate = param => {
		return conditions.some(cond => {
			const isValid = _.keys(cond).every(key => cond[key] === param[key]);
			return isValid;
		});
	};

	return { value: conditions, validate };
}

function getNotesGroupByBlockId(autoCreateConfigs, conditions) {
	const notesGroupByBlockId = { [ALL_BLOCK]: [] };

	autoCreateConfigs.forEach(autoCreateConfig => {
		const notes = autoCreateConfig.times.reduce((_notes, time) => {
			const isValid = conditions.validate(time);
			if (isValid) _notes.push(time.note);
			return _notes;
		}, []);

		if (!notes.length) return;

		const isBlockIdsEmpty = !_.get(autoCreateConfig, 'blockIds.length', 0);

		if (isBlockIdsEmpty) {
			notesGroupByBlockId[ALL_BLOCK].push(...notes);
			return;
		}

		autoCreateConfig.blockIds.forEach(blockId => {
			if (!notesGroupByBlockId[blockId]) notesGroupByBlockId[blockId] = [];
			notesGroupByBlockId[blockId].push(...notes);
		});
	});

	return notesGroupByBlockId;
}

async function autoCreateTask() {
	try {
		const present = moment();
		const conditions = getConditions(present);
		const filter = {
			autoCreate: true,
			'autoCreateConfigs.times': { $elemMatch: { $or: conditions.value } },
		};
		const taskCategories = await models.TaskCategory.find(filter).lean();
		if (!taskCategories.length) return;

		const blocks = await models.Block.find({ isProperty: true }).select('_id').lean();
		const blockIds = blocks.map(block => block._id.toString());

		const time = `${moment().format('YYYY-MM-DDTHH:mm:ss')}.000Z`;

		const tasks = taskCategories.reduce((_tasks, taskCategory) => {
			const notesGroupByBlockId = getNotesGroupByBlockId(taskCategory.autoCreateConfigs, conditions);

			_.entries(notesGroupByBlockId).forEach(elem => {
				const [blockId, notes] = elem;

				if (blockId === ALL_BLOCK) {
					notes.forEach(note => {
						const taskDatas = blockIds.map(_blockId =>
							getTaskData({ taskCategory, blockId: _blockId, time, note })
						);
						_tasks.push(...taskDatas);
					});
					return;
				}

				const taskDatas = notes.map(note => getTaskData({ taskCategory, blockId, time, note }));
				_tasks.push(...taskDatas);
			});

			return _tasks;
		}, []);

		const chunks = _.chunk(tasks, CHUNK_SIZE);
		await _.chunk(tasks, CHUNK_SIZE).asyncForEach(async (ctasks, index) => {
			await models.Task.create(ctasks);
			if (index < chunks.length - 1) await Promise.delay(1000);
		});
	} catch (e) {
		logger.error('job autoCreateTask', e);
	}
}

schedule.scheduleJob('*/1 * * * *', autoCreateTask);

const _ = require('lodash');
const moment = require('moment');

const { logger } = require('@utils/logger');
const { TaskStatus, TaskTags, ONE_MINUTE } = require('@utils/const');
const ZaloDB = require('@services/zalo/personal/database');
const Task = require('@controllers/task');
// const ZaloOtt = require('@ott/zalo');
const models = require('@models');

const DONE_KEYWORD = ['don luu xong', 'dọn lưu xong', 'luu xong', 'lưu xong', 'đã xong', 'xong', 'done'];
const CHECKED_KEYWORD = ['đã kiểm', 'da kiem', 'checked'];
const CANCELED_KEYWORD = ['đã huỷ', 'đã hủy', 'huỷ', 'hủy', 'huy', 'canceled', 'cancel'];
const UNDONE_KEYWORD = ['chưa xong', 'chua xong', 'không xong', 'khong xong'];
const START_KEYWORD = ['bdt', 'bđt'];

const DELAY_ASSIGN_TASK = ONE_MINUTE * 5;
const DELAY_ASSIGN_TASK_LONG = ONE_MINUTE * 30;

function validateKeywords({ message }) {
	const isUndone = UNDONE_KEYWORD.some(key => message.endsWith(key));
	const isDone = DONE_KEYWORD.some(key => message.endsWith(key));
	const isCanceled = CANCELED_KEYWORD.some(key => message.endsWith(key));
	const isChecked = CHECKED_KEYWORD.some(key => message.endsWith(key));
	const isDoing = START_KEYWORD.some(key => message.endsWith(key));

	const isConfirmed =
		!isDoing && !isUndone && !isDone && !isCanceled && !isChecked && _.compact(message.split(' ')).length === 2;

	return {
		isValid: true,
		keywords: isUndone
			? UNDONE_KEYWORD
			: isDone
			? DONE_KEYWORD
			: isCanceled
			? CANCELED_KEYWORD
			: isChecked
			? CHECKED_KEYWORD
			: isDoing
			? START_KEYWORD
			: [],
		validateData: {
			isUndone,
			isDone,
			isCanceled,
			isChecked,
			isConfirmed,
			isDoing,
		},
	};
}

async function findRefMessages(msgId) {
	if (!msgId) return [];

	const message = await ZaloDB.Message().findOne({ msgId }, { quote: 1 });

	if (!message) return [];

	if (message.quote && message.quote.globalMsgId)
		return [msgId, ...(await findRefMessages(_.toString(message.quote.globalMsgId)))];

	return [msgId];
}

async function findCategories(thread, user) {
	const filter = {
		canCompleteByMessage: { $ne: false },
	};

	if (thread.taskCategoryIds && thread.taskCategoryIds.length) {
		filter._id = thread.taskCategoryIds;
	} else if (thread.departmentId) {
		filter.departmentIds = thread.departmentId;
	} else {
		const depts = await models.Department.find({ roles: user.role }).select('_id');
		if (!depts.length) return [];

		filter.departmentIds = { $in: _.map(depts, '_id') };
	}

	const categories = await models.TaskCategory.find(filter).select('_id roomRequired');

	return categories;
}

async function findTasks({ validateData, msgDoc, ottName, thread, user, blockId, roomIds, time, hasPA }) {
	if (msgDoc.quote) {
		const msgIds = await findRefMessages(_.toString(msgDoc.quote.globalMsgId));

		const taskAuto = await models.TaskAutoMessage.findOne({
			ottName,
			messageId: { $in: msgIds },
		}).select('taskId');

		return taskAuto && taskAuto.taskId ? [taskAuto.taskId] : [];
	}

	const categories = await findCategories(thread, user);
	if (!categories.length) return [];

	const ingnoreStatus = [TaskStatus.Deleted];
	if (validateData.isConfirmed) {
		ingnoreStatus.push(TaskStatus.Done);
	}

	const taskFilter = {
		blockId,
		time: {
			$gte: new Date(`${moment(time).format('YYYY-MM-DD')}T00:00:00.000Z`),
			$lte: new Date(`${moment(time).format('YYYY-MM-DD')}T23:59:59.000Z`),
		},
		status: { $nin: ingnoreStatus },
		category: { $in: _.map(categories, '_id') },
	};
	if (hasPA) {
		const paCategory = await models.TaskCategory.findByTag(TaskTags.PA);
		taskFilter.$or = [
			{
				category: paCategory._id,
			},
			{
				roomIds: { $in: roomIds },
			},
		];
	} else if (roomIds) {
		taskFilter.roomIds = { $in: roomIds };
	} else if (categories.some(c => c.roomRequired)) {
		return [];
	}

	const tasks = await models.Task.find(taskFilter).select('_id');
	return tasks.map(task => task._id);
}

async function runJob(data) {
	const { validateData, user, time, ottId, ottName, ottAccount, msgDoc, msgInfo, thread } = data;

	if (!user) return;

	if (msgDoc.image_attachment_url && msgDoc.image_attachment_url.length) {
		const taskAuto = await checkAndAttachMediaToTask({
			msgInfo,
			msgDoc,
			ottName,
			ottAccount,
			ottId,
			thread,
			user,
			time,
		});
		return !!taskAuto;
	}
	if (
		!validateData.isDone &&
		!validateData.isCanceled &&
		!validateData.isChecked &&
		!validateData.isUndone &&
		!validateData.isDoing
	) {
		const taskAuto = await checkAndAttachNoteToTask({ msgDoc, ottName, ottAccount, ottId, thread, user, time });
		return !!taskAuto;
	}

	const tasks = await findTasks(data);
	if (!tasks.length) return;

	await tasks.asyncMap(async taskId => {
		try {
			const task = await Task.changeTaskStatus(taskId, user, {
				status: validateData.isCanceled
					? TaskStatus.Deleted
					: validateData.isDone
					? TaskStatus.Done
					: validateData.isChecked
					? TaskStatus.Checked
					: validateData.isDoing
					? TaskStatus.Doing
					: TaskStatus.Confirmed,
				source: ottName,
				time,
				description: msgDoc.message,
				fromGroupMsg: true,
			});

			if (validateData.isDone) {
				await models.Task.updateOne({ _id: taskId }, { $addToSet: { assigned: user._id } });
			}

			addLogActivity({
				user,
				blockId: task.blockId,
				roomIds: task.roomIds,
				type: 'TASK_CHANGE_STATUS_MSG',
				taskId: task._id,
			});

			await models.TaskAutoMessage.create({
				ottName,
				ottId,
				taskId,
				ottPhone: ottAccount,
				messageId: msgDoc.messageId,
				qMsgId: _.get(msgDoc.quote, 'globalMsgId'),
				messageTime: time,
				toOttId: thread && thread.threadId,
			});
		} catch (e) {
			logger.error('runJob changeTaskStatus error', e);
		}
	});

	return true;
}

async function checkAndAttachMediaToTask({ msgDoc, ottName, ottAccount, ottId, thread, user, time }) {
	const autoTask = await findPrevAutoTaskByMsg({ time, ottName, ottId, thread });
	if (!autoTask) return;

	const task = await models.Task.findById(autoTask.taskId).populate('category', 'hasCheckList').populate('checkList');

	if (task.attachments && task.attachments.includes(msgDoc.image_attachment_url[0])) {
		return;
	}

	const update = {
		$addToSet: {
			attachments: { $each: msgDoc.image_attachment_url },
		},
	};

	if (task.category.hasCheckList) {
		if (!task.checkList || !task.checkList.length) {
			const checkItem = await models.CheckItem.create({
				label: 'Check list 1',
				taskId: task._id,
				attachments: msgDoc.image_attachment_url,
				createdBy: user._id,
				createdAt: time,
			});

			update.$addToSet.checkList = checkItem._id;
		} else {
			const check =
				_.findLast(task.checkList, c => _.toString(c.createdBy) === user._id.toString()) ||
				_.last(task.checkList);

			await models.CheckItem.updateOne(
				{ _id: check._id },
				{
					$addToSet: {
						attachments: { $each: msgDoc.image_attachment_url },
					},
				}
			);
		}
	}

	await models.Task.updateOne({ _id: task._id }, update);

	addLogActivity({
		user,
		blockId: task.blockId,
		roomIds: task.roomIds,
		type: 'TASK_CHECKLIST_ADD_MEDIA_MSG',
		taskId: autoTask.taskId,
	});

	return await models.TaskAutoMessage.create({
		ottName,
		ottId,
		ottPhone: ottAccount,
		messageId: msgDoc.messageId,
		messageTime: time,
		qMsgId: _.get(msgDoc.quote, 'globalMsgId'),
		taskId: autoTask.taskId,
		toOttId: thread && thread.threadId,
		attachment: true,
	});
}

function findPrevAutoTaskByMsg({ time, ottName, ottId, thread }) {
	time = new Date(time);

	const diffTime = _.get(thread, 'taskCategoryIds.length') ? DELAY_ASSIGN_TASK_LONG : DELAY_ASSIGN_TASK;

	const filter = {
		ottName,
		ottId,
		messageTime: { $gte: new Date(time.valueOf() - diffTime) },
		taskId: { $ne: null },
		attachment: { $ne: true },
	};
	if (thread) {
		filter.toOttId = thread.threadId;
	}

	return models.TaskAutoMessage.findOne(filter).select('taskId').sort({ messageTime: -1 });
}

async function checkAndAttachNoteToTask({ msgDoc, ottName, ottAccount, ottId, thread, user, time }) {
	const autoTask = await findPrevAutoTaskByMsg({ time, ottName, ottId, thread });
	if (!autoTask) return;

	const task = await models.Task.findById(autoTask.taskId).populate('category', 'hasCheckList').populate('checkList');

	if (task.category && task.category.hasCheckList) {
		task.checkList = task.checkList || [];
		const hasExists = task.checkList.find(c => c.label === msgDoc.message);
		if (hasExists) return;

		const checkItem = await models.CheckItem.create({
			taskId: task._id,
			label: msgDoc.message,
			createdBy: user._id,
			createdAt: time,
		});
		task.checkList.push(checkItem._id);
	} else {
		if (task.note && msgDoc.message && task.note.includes(msgDoc.message)) {
			return;
		}

		task.note = _.compact([task.note, msgDoc.message]).join('\n');
	}

	await task.save();

	addLogActivity({
		user,
		blockId: task.blockId,
		roomIds: task.roomIds,
		type: 'TASK_CHECKLIST_ADD_TEXT_MSG',
		taskId: autoTask.taskId,
	});

	return await models.TaskAutoMessage.create({
		ottName,
		ottId,
		ottPhone: ottAccount,
		messageId: msgDoc.messageId,
		messageTime: time,
		qMsgId: _.get(msgDoc.quote, 'globalMsgId'),
		toOttId: thread && thread.threadId,
		taskId: autoTask.taskId,
		attachment: true,
	});
}

async function addLogActivity({ user, blockId, roomIds, type, taskId }) {
	const data = {
		username: user.username,
		action: `/${taskId}`,
		method: 'ZALO',
		data: JSON.stringify({ taskId }),
		type,
		blockId,
		roomId: roomIds && roomIds[0],
	};

	await models.UserLog.create(data).catch(e => {
		logger.error('taskState addLogActivity', data, e);
	});
}

module.exports = {
	validateKeywords,
	runJob,
};

const _ = require('lodash');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { CHECK_ITEM_STATUS, CHECK_LIST_LOGS, TaskStatus } = require('@utils/const');
const { getParseLog } = require('@utils/schema');
const { LOG_FIELDS_LABELS, LOG_VALUES_MAPPER } = require('./const/checkItem.const');

async function create(data, user) {
	const task = await models.Task.getTaskById(data.taskId);

	const checkListCategory = await models.CheckListCategory.findOne({
		_id: data.checkListCategoryId,
		taskCategoryIds: task.category,
	})
		.select('_id defaultLabel')
		.lean();
	if (!checkListCategory) throw new ThrowReturn('Check list category invalid').status(404);

	const doc = {
		...data,
		label: data.label || checkListCategory.defaultLabel || '',
		createdBy: user._id,
		histories: [{ description: CHECK_LIST_LOGS.CREATED, createdBy: user._id }],
	};

	const checkItem = await models.CheckItem.create(doc);

	task.checkList.push(checkItem._id);
	await task.save();

	return checkItem;
}

async function modify({ id, data, user }) {
	const checkItem = await models.CheckItem.findOneAndValidate(id);
	// if (checkItem.taskIds.length) throw new ThrowReturn('Can not modify');
	checkItem.set$localsForLogging(user._id);
	const modifyingData = _.pick(data, ['label', 'attachments', 'checkListCategoryId']);

	Object.assign(checkItem, modifyingData);

	await checkItem.save();
	return _.pick(checkItem, _.keys(modifyingData));
}

async function changeStatus({ id, data, user }) {
	const checkItem = await models.CheckItem.findOneAndValidate(id);
	if (checkItem.taskIds.length) throw new ThrowReturn('Can not change status');

	checkItem.set$localsForLogging(user._id);
	checkItem.status = data.status;

	await checkItem.save();
	return { status: data.status };
}

async function remove(id, user) {
	const checkItem = await models.CheckItem.findOneAndValidate(id);
	if (checkItem.taskIds.length) throw new ThrowReturn('Can not delete');

	checkItem.set$localsForLogging(user._id);
	checkItem.status = CHECK_ITEM_STATUS.DELETED;
	await checkItem.save();
}

async function syncCheckItemStatus(task, userId) {
	const checkItem = await models.CheckItem.findOneAndValidate(task.linked.checkItemId);
	checkItem.set$localsForLogging(userId);

	if (checkItem) {
		if (task.status === CHECK_ITEM_STATUS.DELETED) {
			await checkItem.removeTask(task._id, userId);
		}

		const statusList = await models.Task.getStatusListByTaskIds(checkItem.taskIds);
		const isProcessing = statusList.some(status =>
			[TaskStatus.Checked, TaskStatus.Waiting, TaskStatus.Confirmed].includes(status)
		);

		const newCheckItemStatus = isProcessing ? CHECK_ITEM_STATUS.FAIL : CHECK_ITEM_STATUS.PASS;
		checkItem.set$localsForLogging(userId);
		checkItem.status = newCheckItemStatus;
		await checkItem.save();
	}
}

async function getLogs(checkItemId) {
	const { logs } = await models.CheckItem.findById(checkItemId)
		.select('logs')
		.populate('logs.by', 'username name')
		.lean();
	if (!logs) return [];

	const parseLog = getParseLog(LOG_FIELDS_LABELS, LOG_VALUES_MAPPER);
	return logs.map(log => parseLog(log)).reverse();
}

module.exports = { create, modify, changeStatus, remove, syncCheckItemStatus, getLogs };

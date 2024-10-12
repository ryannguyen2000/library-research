const models = require('@models');
const _ = require('lodash');
const moment = require('moment');

const { logger } = require('@utils/logger');
const { TaskTags } = require('@utils/const');
const { TaskStatus, CHECK_LIST_LOGS, CHECK_ITEM_STATUS } = require('@utils/const');
const Task = require('@controllers/task');
const BlockConfig = require('@controllers/block/config');
const messageOTT = require('@controllers/message/ott');
const { PHASE, COMMAND, ERROR_MESSAGE } = require('./const');

const CHECK_ITEM_STATUS_TXT = {
	[CHECK_ITEM_STATUS.PASS]: 'Đạt',
	[CHECK_ITEM_STATUS.FAIL]: 'Chưa đạt',
};

const CHECK_ITEM_STATUS_SELECTOR = {
	PASS: 1,
	FAILT: 2,
};

const USER_LOG_TYPE = {
	TASK_ADD_CHECK_ITEM_MSG: 'TASK_ADD_CHECK_ITEM_MSG',
	UPDATE_CHECK_ITEM_MSG: 'UPDATE_CHECK_ITEM_MSG',
	CREATE_TASK_MSG: 'CREATE_TASK_MSG',
};

async function sendPCCCListMsg({
	task,
	autoTask,
	pcccTaskCategory,
	taskAutoMessageDefaultData,
	ottName,
	ottId,
	ottAccount,
}) {
	const checkListCategories = await BlockConfig.getCheckListCategories(autoTask.blockId, pcccTaskCategory._id);

	const checkList = task.checkList || [];
	const existCheckListCategoryIds = checkList.reduce((rs, checkItem) => {
		const haveCheckListCategory = !!checkItem.checkListCategoryId;
		if (haveCheckListCategory && checkItem.status !== CHECK_ITEM_STATUS.DELETED) {
			rs.push(checkItem.checkListCategoryId.toString());
		}
		return rs;
	}, []);

	const response = checkListCategories.map((category, index) => ({
		label: category.name,
		value: index + 1,
		data: {
			_id: category._id,
			name: category.name,
			defaultLabel: category.defaultLabel || '',
		},
	}));
	const getSelectedMark = checkListCategoryId =>
		existCheckListCategoryIds.includes(checkListCategoryId) ? '(✓)' : '';
	const content = checkListCategories
		.map((category, index) => `\t${index + 1}. ${category.name}. ${getSelectedMark(category._id.toString())}`)
		.join('\n');

	await Promise.all([
		models.TaskAutoMessage.create({
			...taskAutoMessageDefaultData,
			response,
			type: TaskTags.PCCC,
			phase: PHASE.SELECTOR,
		}),
		messageOTT.sendOTTMessage({
			sender: ottAccount,
			ottName,
			phone: ottId,
			text: `Chọn các số phía dưới để bắt đầu công việc PCCC:\n${content}`,
		}),
	]);
}

async function pcccSelectorPhaseProcessing({
	autoTask,
	pcccTaskCategory,
	taskAutoMessageDefaultData,
	ottName,
	ottId,
	msgDoc,
	task,
	user,
	ottAccount,
}) {
	const isHaveTask = !!autoTask.taskId;
	// Send check list category
	if (!isHaveTask) {
		await sendPCCCListMsg({
			task,
			autoTask,
			pcccTaskCategory,
			taskAutoMessageDefaultData,
			ottName,
			ottId,
			ottAccount,
		});
		return;
	}

	// Select check list category
	const msg = msgDoc.message;
	const checkListCategorySelected = autoTask.response.find(item => parseInt(msg) === item.value);

	if (!checkListCategorySelected) {
		await messageOTT.sendOTTMessage({
			sender: ottAccount,
			ottName,
			phone: ottId,
			text: ERROR_MESSAGE.INVALID_SELECTION,
		});
		return;
	}

	let checkItem = await models.CheckItem.findOne({
		taskId: task._id,
		checkListCategoryId: checkListCategorySelected.data._id,
		status: { $ne: CHECK_ITEM_STATUS.DELETED },
	});

	if (!checkItem) {
		checkItem = await models.CheckItem.create({
			taskId: task._id,
			label: _.get(checkListCategorySelected, 'data.defaultLabel', ''),
			checkListCategoryId: _.get(checkListCategorySelected, 'data._id', ''),
			createdBy: user._id,
			histories: [{ description: CHECK_LIST_LOGS.CREATED, createdBy: user._id }],
		});
	}

	const checkItemCategoryLabel = checkListCategorySelected.data.name;
	const note = `Hướng dẫn sử dụng:
\t- Hãy chụp hình, nhắn tin tất cả hoạt động của bạn trong hạng mục.
\t- Nếu đạt thì nhắn "${CHECK_ITEM_STATUS_SELECTOR.PASS}" (đạt). ( mặc định là đạt )
\t- Nếu có lỗi gì nhắn "${CHECK_ITEM_STATUS_SELECTOR.FAILT}" (chưa đạt).
\t- Nhắn "${COMMAND.NEXT_CHECK_ITEM}" để sang hạng mục khác.
\t- Nhắn "${COMMAND.EXIT}" để thoát tác vụ.`;

	const checkItemContent = `Hạng mục [ ${checkItemCategoryLabel} ]:\n\t- Trạng thái: ${
		CHECK_ITEM_STATUS_TXT[checkItem.status]
	}.\n\t- Nội dung báo cáo: ${checkItem.label || ''}.\n\t- Số lượng ảnh đính kèm: ${_.get(
		checkItem,
		'attachments.length',
		0
	)}.`;

	const content = `${checkItemContent}\n\n${note}`;

	const isCheckListIncludeCheckItem = task.checkList.some(_checkItem => _checkItem._id.equals(checkItem._id));
	if (!isCheckListIncludeCheckItem) task.checkList.push(checkItem._id);

	await Promise.all([
		models.TaskAutoMessage.create({
			...taskAutoMessageDefaultData,
			type: TaskTags.PCCC,
			checkItemId: checkItem._id,
			phase: PHASE.INPUT,
		}),
		messageOTT.sendOTTMessage({ sender: ottAccount, ottName, phone: ottId, text: content }),
		task.save(),
	]);

	if (!isCheckListIncludeCheckItem) {
		addLogActivity({
			user,
			blockId: task.blockId,
			roomIds: task.roomIds,
			type: USER_LOG_TYPE.TASK_ADD_CHECK_ITEM_MSG,
			taskId: task._id,
			checkItemId: checkItem._id,
		});
	}
}

async function pcccInputPhaseProcessing({ autoTask, msgDoc, taskAutoMessageDefaultData, user, task }) {
	const updated = {};
	if (msgDoc.message) {
		const isUpdateStatusMsg = [CHECK_ITEM_STATUS_SELECTOR.PASS, CHECK_ITEM_STATUS_SELECTOR.FAILT].includes(
			+msgDoc.message.trim()
		);
		if (!isUpdateStatusMsg) {
			updated.label = msgDoc.message;
		} else {
			const isFail = CHECK_ITEM_STATUS_SELECTOR.FAILT === +msgDoc.message.trim();
			updated.status = isFail ? CHECK_ITEM_STATUS.FAIL : CHECK_ITEM_STATUS.PASS;
		}
	}

	if (msgDoc.image_attachment_url && msgDoc.image_attachment_url.length) {
		updated.$addToSet = { attachments: { $each: msgDoc.image_attachment_url } };
	}

	await Promise.all([
		models.TaskAutoMessage.create({
			...taskAutoMessageDefaultData,
			type: TaskTags.PCCC,
			checkItemId: autoTask.checkItemId,
			phase: PHASE.INPUT,
		}),
		models.CheckItem.updateOne({ _id: autoTask.checkItemId }, updated),
	]);

	if (Object.values(updated).length) {
		addLogActivity({
			user,
			blockId: task.blockId,
			roomIds: task.roomIds,
			type: USER_LOG_TYPE.UPDATE_CHECK_ITEM_MSG,
			taskId: task._id,
			checkItemId: autoTask.checkItemId,
		});
	}
}

async function process({ autoTask, functionSelected, ...data }) {
	const { user, time, ottId, ottName, ottAccount, msgDoc, thread } = data;
	const ott = { ottId, ottName, ottAccount };
	const pcccTaskCategory = await models.TaskCategory.getPCCC();
	const msg = msgDoc.message;
	const defaultQuery = {
		blockId: autoTask.blockId,
		status: { $ne: TaskStatus.Deleted },
		category: pcccTaskCategory._id,
		time: {
			$gte: new Date(`${moment().startOf('month').format('YYYY-MM-DD')}T00:00:00.000Z`),
			$lte: new Date(`${moment().endOf('month').format('YYYY-MM-DD')}T23:59:59.000Z`),
		},
	};
	const query = autoTask.taskId ? { _id: autoTask.taskId, ...defaultQuery } : defaultQuery;

	let task = await models.Task.findOne(query).populate('checkList', 'checkListCategoryId status');

	if (!task) {
		task = await Task.createTask(user, {
			time: moment().add(7, 'hours').toDate(),
			status: 'waiting',
			assigned: [user._id],
			other: {},
			fee: {},
			assetActionId: null,
			assetIssueIds: [],
			blockId: autoTask.blockId,
			roomIds: [],
			category: pcccTaskCategory._id,
			subCategory: null,
			notificationType: null,
		});

		addLogActivity({
			user,
			blockId: task.blockId,
			roomIds: task.roomIds,
			type: USER_LOG_TYPE.CREATE_TASK_MSG,
			taskId: task._id,
		});
	}

	const taskAutoMessageDefaultData = {
		ottName,
		ottId,
		ottPhone: ottAccount,
		messageId: msgDoc.messageId,
		qMsgId: _.get(msgDoc.quote, 'globalMsgId'),
		messageTime: time,
		toOttId: thread && thread.threadId,
		taskId: task._id,
		blockId: task.blockId,
	};

	if (autoTask.phase === PHASE.SELECTOR) {
		await pcccSelectorPhaseProcessing({
			task,
			pcccTaskCategory,
			autoTask,
			taskAutoMessageDefaultData,
			msgDoc,
			user,
			...ott,
		});
		return;
	}

	const isInputPhase = autoTask.phase === PHASE.INPUT && autoTask.taskId && autoTask.checkItemId;

	if (!isInputPhase) return;

	if (msg === COMMAND.NEXT_CHECK_ITEM) {
		await sendPCCCListMsg({
			task,
			taskAutoMessageDefaultData,
			autoTask,
			pcccTaskCategory,
			...ott,
		});
		return;
	}

	await pcccInputPhaseProcessing({ autoTask, msgDoc, taskAutoMessageDefaultData, task, user });
}

async function addLogActivity({ user, blockId, type, taskId, checkItemId }) {
	const data = {
		username: user.username,
		action: `/${taskId}`,
		method: 'ZALO',
		data: JSON.stringify({ taskId, checkItemId }),
		type,
		blockId,
	};

	await models.UserLog.create(data).catch(e => {
		logger.error('pcccTask addLogActivity', data, e);
	});
}

module.exports = {
	process,
	addLogActivity,
};

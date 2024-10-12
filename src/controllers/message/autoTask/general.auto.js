const _ = require('lodash');

const models = require('@models');
const messageOTT = require('@controllers/message/ott');
const { TaskTags } = require('@utils/const');
const { COMMAND, DELAY_ASSIGN_TASK_LONG, DELAY_ASSIGN_TASK, PHASE, ERROR_MESSAGE } = require('./const');
const PCCC = require('./pccc');

async function getZaloDefaultSelectors() {
	const zaloDefaultSelectors = await models.Setting.getZaloDefaultSelectors();
	const content = zaloDefaultSelectors.reduce((rs, { value, label }) => {
		rs += `\t${value}. ${label}.\n`;
		return rs;
	}, '');

	return { response: zaloDefaultSelectors, content };
}

// This function validate: is msg trigger this auto fn
async function validateKeywords({ message, thread, user }) {
	if (!thread.isUser) return { isValid: false };

	const deps = await user.getDepartments({ 'config.zalo.generalEnable': true });
	if (!deps.length) return { isValid: false };

	message = _.toUpper(message).trim();
	const block = await findBlock(message, user);

	const isBlockPhase = !!block;
	const isExitCommand = message === COMMAND.EXIT;

	return {
		isValid: true,
		validateData: {
			isBlockPhase,
			isExitCommand,
		},
		block,
	};
}

async function findBlock(blockShortName, user) {
	const block = await models.Block.findOne({ 'info.shortName': blockShortName }).select('info').lean();
	if (!block) return;

	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: block._id });
	if (!blockIds.length) return;

	return block;
}

function findPrevAutoTaskByMsg({ time, ottName, ottId, thread }) {
	time = new Date(time);

	const diffTime = _.get(thread, 'taskCategoryIds.length') ? DELAY_ASSIGN_TASK_LONG : DELAY_ASSIGN_TASK;

	const filter = {
		ottName,
		ottId,
		messageTime: { $gte: new Date(time.valueOf() - diffTime) },
		phase: { $ne: null },
	};

	if (thread) {
		filter.toOttId = thread.threadId;
	}

	return models.TaskAutoMessage.findOne(filter)
		.select('blockId response messageId type phase taskId checkItemId isEndPhase')
		.sort({ messageTime: -1 });
}

async function runJob(data) {
	const { validateData, time, ottId, ottName, ottAccount, msgDoc, thread, block } = data;
	const { isBlockPhase, isExitCommand } = validateData;
	const sendMsg = msg => messageOTT.sendOTTMessage({ ottName, phone: ottId, text: msg, sender: ottAccount });
	const msg = msgDoc.message;

	// Block phase
	if (isBlockPhase) {
		// block data only exist on block phase
		const zaloDefaultSelector = await getZaloDefaultSelectors();
		await models.TaskAutoMessage.create({
			ottName,
			ottId,
			ottPhone: ottAccount,
			messageId: msgDoc.messageId,
			qMsgId: _.get(msgDoc.quote, 'globalMsgId'),
			messageTime: time,
			toOttId: thread && thread.threadId,
			response: zaloDefaultSelector.response,
			blockId: block._id,
			phase: PHASE.SELECTOR,
		});
		await sendMsg(
			`Chọn các số phía dưới để bắt đâu công việc cho nhà ${block.info.name}:\n${zaloDefaultSelector.content}`
		);
		return true;
	}

	const autoTask = await findPrevAutoTaskByMsg({ time, ottName, ottId, thread });
	if (!autoTask || autoTask.isEndPhase) return;

	if (isExitCommand) {
		autoTask.isEndPhase = true;
		await Promise.all([autoTask.save(), sendMsg('Thoát tác vụ thành công.')]);
		return true;
	}

	// Selector phase
	const autoTaskResponse = autoTask.response || [];
	const functionSelected =
		autoTask.type ||
		_.get(
			autoTaskResponse.find(item => item.value === parseInt(msg)),
			'type',
			''
		);

	if (!functionSelected) {
		await sendMsg(ERROR_MESSAGE.INVALID_SELECTION);
		return true;
	}

	if (functionSelected === TaskTags.PCCC) {
		await PCCC.process({ autoTask, functionSelected, ...data });
		return true;
	}
}

module.exports = {
	runJob,
	validateKeywords,
};

const _ = require('lodash');
const moment = require('moment');

const models = require('@models');
const { TaskStatus, CHECK_ITEM_STATUS, PETITION_STATUS, PETITION_LOGS } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const { getParseLog } = require('@utils/schema');
const { LOG_FIELDS_LABELS, LOG_VALUES_MAPPER } = require('./const/petition.const');
const { getTaskAndCheckItem } = require('./checkList');

async function getRemainPetition(taskId) {
	const task = await models.Task.findOne({ _id: taskId, status: { $ne: TaskStatus.Deleted } }).lean();

	const query = {
		time: { $lt: task.time },
		status: TaskStatus.Done,
		..._.pick(task, ['blockId', 'category']),
		linked: { $eq: null },
	};
	const preTasks = await models.Task.find(query)
		.sort({ time: -1 })
		.limit(1)
		.populate('checkListCategoryId')
		.populate({
			path: 'checkList',
			populate: [
				{ path: 'taskIds', match: { status: { $ne: TaskStatus.Deleted } }, select: 'status no time' },
				{ path: 'petitionIds', match: { status: { $ne: PETITION_STATUS.DELETED } } },
			],
		})
		.lean();
	const preTask = preTasks[0];
	if (!preTask) return {};

	const remain = preTask.checkList.reduce((_remain, checkItem) => {
		if (checkItem.status === CHECK_ITEM_STATUS.FAIL && checkItem.petitionIds.length) {
			_remain[checkItem.checkListCategoryId] = {
				category: checkItem.checkListCategoryId,
				petitionIds: checkItem.petitionIds,
				taskIds: checkItem.taskIds,
			};
		}
		return _remain;
	}, {});

	remain.currentTaskId = taskId;
	return remain;
}

async function getPetition(petitionId) {
	const petition = await models.Petition.findOne({
		_id: petitionId,
		// status: { $ne: PETITION_STATUS.DELETED },
	});
	if (!petition) throw new ThrowReturn('Petition does not exist');

	return petition;
}

async function view(petitionId) {
	const petition = await getPetition(petitionId);

	if (petition.taskId && petition.checkItemId) {
		const { task, checkItem } = await getTaskAndCheckItem(petition.taskId, petition.checkItemId, false);
		return {
			...petition.toJSON(),
			checkItemId: checkItem,
			taskId: task,
		};
	}
	await petition.populate('taskId').populate('createdBy', 'username name').execPopulate();

	return petition;
}

async function create({ taskId, checkItemId, user, ...data }) {
	const checkItem = await models.CheckItem.findOneAndValidate(checkItemId);
	if (!taskId && !checkItemId) throw new ThrowReturn('TaskId or checkItemId invalid');

	if (_.get(checkItem, 'status') === CHECK_ITEM_STATUS.PASS) throw new ThrowReturn('Check item was pass.');

	if (!data.expired) {
		data.expired = moment().add(1, 'months').toDate();
	} else if (data.expired < new Date().toISOString()) throw new ThrowReturn('Expired time invalid');

	const petition = await models.Petition.create({
		taskId,
		checkItemId,
		...data,
		createdBy: user._id,
		histories: [{ description: PETITION_LOGS.CREATED, createdBy: user._id }],
	});

	await checkItem.addPetition(petition._id, user._id);
	return petition;
}

async function modify(petitionId, data, user) {
	const petition = await getPetition(petitionId);
	// if (petition.status === PETITION_STATUS.DONE) {
	// 	throw new ThrowReturn('Petition was done');
	// }
	petition.set$localsForLogging(user._id);

	Object.assign(petition, _.pick(data, ['reportText', 'replyText', 'expired']));
	await petition.save();

	return _.pick(petition, _.keys(data));
}

async function remove(petitionId, user) {
	const petition = await getPetition(petitionId);
	petition.set$localsForLogging(user._id);

	await changeStatus({
		petitionId: petition,
		userId: user._id,
		status: PETITION_STATUS.DELETED,
		validateFullStatus: true,
	});

	if (petition.checkitemId) {
		const checkItem = await models.CheckItem.findOneAndValidate(petition.checkItemId);
		await checkItem.removePetition(petitionId, user._id);
	}
}

async function changeStatus({ petitionId, userId, status, validateFullStatus }) {
	const validStatus = validateFullStatus
		? _.values(PETITION_STATUS)
		: [PETITION_STATUS.WAITING, PETITION_STATUS.CONFIRMED];
	if (!validStatus.includes(status)) throw new ThrowReturn('Status invalid');

	const petition = _.get(petitionId, '_id') ? petitionId : await getPetition(petitionId);
	petition.set$localsForLogging(userId);

	// if (petition.status === PETITION_STATUS.DONE) {
	// 	throw new ThrowReturn('Petition was done');
	// }

	petition.status = status;

	if (status === PETITION_STATUS.DONE) {
		petition.doneAt = new Date();
		petition.doneBy = userId;
	}

	await petition.save();
}

function updateDoneStatus(petitionId, user) {
	return changeStatus({ petitionId, userId: user._id, status: PETITION_STATUS.DONE, validateFullStatus: true });
}

async function getLogs(petitionId) {
	const { logs } = await models.Petition.findById(petitionId)
		.select('logs')
		.populate('logs.by', 'username name')
		.lean();
	if (!logs) return [];

	const parseLog = getParseLog(LOG_FIELDS_LABELS, LOG_VALUES_MAPPER);
	return logs.map(log => parseLog(log)).reverse();
}

module.exports = {
	create,
	view,
	modify,
	remove,
	getPetition,
	getRemainPetition,
	updateDoneStatus,
	changeStatus,
	getLogs,
};

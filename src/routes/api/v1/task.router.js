const _ = require('lodash');

const router = require('@core/router').Router();
const models = require('@models');
const Task = require('@controllers/task');
const TaskSchedule = require('@controllers/task/schedule');
const { sendAutoTaskMessage } = require('@controllers/message/autoTask');
const CheckList = require('@controllers/task/checkList');
const Petition = require('@controllers/task/petition');
const CheckListCategory = require('@controllers/task/checkListCategory');
const TaskReport = require('@controllers/task/reports');
const TaskPayout = require('@controllers/task/payout');

async function getTasks(req, res) {
	const results = await Task.getTasks(req.query, req.decoded.user, req.language);

	res.sendData(results);
}

async function getTask(req, res) {
	const task = await Task.getTask(req.params.taskId, req.decoded.user);

	res.sendData(task);
}

async function createTask(req, res) {
	const task = await Task.createTask(req.decoded.user, req.body);

	res.sendData({ task });
}

function setReqData(req, task) {
	if (task && task.blockId) _.set(req, ['logData', 'blockId'], task.blockId._id || task.blockId);
	if (task && task.roomIds && task.roomIds.length) _.set(req, ['logData', 'roomId'], _.head(task.roomIds));
}

async function updateTask(req, res) {
	const task = await Task.updateTask(req.params.taskId, req.body, req.decoded.user);

	setReqData(req, task);

	res.sendData({ task: _.pick(task, _.keys(req.body)) });
}

async function changeStatus(req, res) {
	const task = await Task.changeTaskStatus(req.params.taskId, req.decoded.user, req.body);

	setReqData(req, task);

	res.sendData({ task: _.pick(task, ['status']) });
}

async function updateDoneStatus(req, res) {
	const { task, ...data } = await Task.updateDoneStatus(req.params.taskId, req.decoded.user, req.body);

	setReqData(req, task);

	res.sendData(data);
}

async function addNote(req, res) {
	const { task, ...data } = await Task.addNote(
		req.params.taskId,
		req.decoded.user._id,
		req.body.note,
		req.body.images
	);

	setReqData(req, task);

	res.sendData(data);
}

async function updateNote(req, res) {
	const { task, ...data } = await Task.updateNote(
		req.params.taskId,
		req.params.noteId,
		req.decoded.user._id,
		req.body.note,
		req.body.images
	);

	setReqData(req, task);

	res.sendData(data);
}

async function getSchedule(req, res) {
	const schedules = await TaskSchedule.getSchedule(req.query, req.decoded.user);

	res.sendData({ schedules });
}

async function createSchedule(req, res) {
	const data = await TaskSchedule.createSchedule(req.decoded.user, req.body.schedules);

	if (data.blockId) {
		_.set(req, ['logData', 'blockId'], data.blockId);
	}

	res.sendData(data);
}

async function getScheduleTask(req, res) {
	const task = await TaskSchedule.getScheduleTask(req.query.blockId, req.query.roomId, req.query.date);

	res.sendData(task);
}

async function getCategories(req, res) {
	const categories = await Task.getCategories(req.query, req.decoded.user);

	res.sendData(categories);
}

async function createCategory(req, res) {
	const category = await models.TaskCategory.create(req.body);

	res.sendData(category);
}

async function updateCategory(req, res) {
	const category = await models.TaskCategory.modify(req.params.id, req.body);

	res.sendData(_.pick(category, _.keys(req.body)));
}

async function getTaskStatus(req, res) {
	const result = await Task.getTaskStatus(req.query, req.decoded.user);

	res.sendData(result);
}

async function taskStatistic(req, res) {
	const rs = await Task.getStats(req.query, req.decoded.user);

	res.sendData(rs);
}

async function getScheduleFloor(req, res) {
	const data = await TaskSchedule.getScheduleFloor(req.query, req.decoded.user);

	res.sendData(data);
}

async function updateScheduleFloor(req, res) {
	await TaskSchedule.updateScheduleFloor(req.decoded.user, req.body);

	res.sendData();
}

async function updateTaskBooking(req, res) {
	const task = await Task.updateTaskBooking(req.params.taskId, req.body.otaBookingId);

	setReqData(req, task);

	res.sendData();
}

async function deleteTaskBooking(req, res) {
	const task = await Task.deleteTaskBooking(req.params.taskId, req.params.bookingId);

	setReqData(req, task);

	res.sendData();
}

async function updateTaskChecking(req, res) {
	await Task.updateTaskChecking(req.params.taskId, req.body.checking, req.decoded.user);

	res.sendData();
}

async function getTemplates(req, res) {
	const { departmentId, templateId } = req.query;

	const templates = await models.TaskTemplate.find(_.pickBy({ departmentId, templateId }));

	res.sendData({ templates });
}

async function quantityTaskStatistic(req, res) {
	const { from, to, blockId, category } = req.query;
	const rs = await Task.quantityStatistic({ from, to, blockId, category }, req.language);
	res.sendData(rs);
}

async function addAssetIssues(req, res) {
	const { taskId } = req.params;
	const { assetIssueIds } = req.body;
	const { user } = req.decoded;
	const rs = await Task.addAssetIssues({ assetIssueIds, taskId, user });
	res.sendData(rs);
}

async function removeAssetIssues(req, res) {
	const { taskId } = req.params;
	const { assetIssueIds } = req.body;
	const { user } = req.decoded;
	const rs = await Task.removeAssetIssues({ assetIssueIds, taskId, user });
	res.sendData(rs);
}

async function getReportTemplate(req, res) {
	const { user } = req.decoded;
	const results = await TaskReport.getReportTemplate({ ...req.query, ...req.params, ...req.data, user });
	res.sendData(results);
}

async function getReportTemplates(req, res) {
	const reportTemplates = await models.ReportTemplate.find();
	res.sendData({ reportTemplates });
}

async function reminderTask(req, res) {
	const { taskId } = req.params;

	const task = await models.Task.findById(taskId);
	await sendAutoTaskMessage(task, true);

	res.sendData();
}

async function createCheckItem(req, res) {
	const { user } = req.decoded;
	const checkList = await CheckList.create(req.body, user);
	res.sendData({ checkList });
}

async function updateCheckItem(req, res) {
	const { id } = req.params;
	const rs = await CheckList.modify({ id, data: req.body, user: req.decoded.user });
	res.sendData(rs);
}

async function updateCheckItemStatus(req, res) {
	const { id } = req.params;
	const { user } = req.decoded;
	const rs = await CheckList.changeStatus({ id, data: req.body, user });
	res.sendData(rs);
}

async function deleteCheckItem(req, res) {
	const { id } = req.params;
	const { user } = req.decoded;
	await CheckList.remove(id, user);
	res.sendData();
}

async function getPetition(req, res) {
	const petition = await Petition.view(req.params.id);
	res.sendData(petition);
}

async function createPetition(req, res) {
	const petition = await Petition.create({ ...req.body, user: req.decoded.user });
	res.sendData({ petition });
}

async function modifyPetition(req, res) {
	const update = await Petition.modify(req.params.id, req.body, req.decoded.user);
	res.sendData(update);
}

async function removePetition(req, res) {
	await Petition.remove(req.params.id, req.decoded.user);
	res.sendData();
}

async function getPetitionLog(req, res) {
	const logs = await Petition.getLogs(req.params.id);
	res.sendData(logs);
}

async function changePetitionStatus(req, res) {
	const { params, decoded, body } = req;
	await Petition.changeStatus({ petitionId: params.id, userId: decoded.user._id, status: body.status });
	res.sendData();
}

async function updateDonePetitionStatus(req, res) {
	await Petition.updateDoneStatus(req.params.id, req.decoded.user);
	res.sendData();
}

async function getRemainPetition(req, res) {
	const remainPetition = await Petition.getRemainPetition(req.params.taskId);
	res.sendData(remainPetition);
}

async function getCheckItemLogs(req, res) {
	const logs = await CheckList.getLogs(req.params.id);
	res.sendData(logs);
}

async function createCheckListCategory(req, res) {
	const { id: taskCategoryId } = req.params;
	const checkListCategory = await CheckListCategory.create({ taskCategoryId, ...req.body });
	res.sendData({ checkListCategory });
}

async function getCheckListCategories(req, res) {
	const checkListCategories = await CheckListCategory.list(req.params.id, req.query);
	res.sendData(checkListCategories);
}

async function modifyCheckListCategory(req, res) {
	const { checkListCategoryId } = req.params;
	const checkListCategory = await CheckListCategory.modify(checkListCategoryId, req.body);
	res.sendData(checkListCategory);
}

async function orderCheckListCategories(req, res) {
	const { id: taskCategoryId } = req.params;
	await CheckListCategory.sort(taskCategoryId, req.body.order);
	res.sendData();
}

async function getTaskFees(req, res) {
	const data = await TaskPayout.getPayouts({ taskId: req.params.taskId });

	res.sendData(data);
}

async function createTaskFee(req, res) {
	const data = await TaskPayout.createPayout({ taskId: req.params.taskId, data: req.body, user: req.decoded.user });

	res.sendData(data);
}

async function updateTaskFee(req, res) {
	const data = await TaskPayout.updatePayout({
		taskId: req.params.taskId,
		payoutId: req.params.payoutId,
		data: req.body,
		user: req.decoded.user,
	});

	res.sendData(data);
}

async function deleteTaskFee(req, res) {
	const data = await TaskPayout.deletePayout({
		taskId: req.params.taskId,
		payoutId: req.params.payoutId,
		user: req.decoded.user,
	});

	res.sendData(data);
}

router.getS('/', getTasks, true);
router.postS('/', createTask, true);

router.getS('/category', getCategories, true);
router.postS('/category', createCategory, true);
router.putS('/category/:id', updateCategory, true);
router.getS('/category/:id/check-list-category', getCheckListCategories, true);
router.postS('/category/:id/check-list-category', createCheckListCategory, true);
router.putS('/category/:id/check-list-category/order', orderCheckListCategories, true);
router.putS('/category/:id/check-list-category/:checkListCategoryId', modifyCheckListCategory, true);

router.getS('/template', getTemplates, true);

router.getS('/schedule', getSchedule, true);
router.postS('/schedule', createSchedule, true);
router.getS('/schedule/new_task', getScheduleTask, true);

router.getS('/scheduleFloor', getScheduleFloor, true);
router.postS('/scheduleFloor', updateScheduleFloor, true);

router.getS('/getTaskStatus', getTaskStatus, true);
router.getS('/stats', taskStatistic, true);
router.getS('/quantity-stats', quantityTaskStatistic, true);

router.getS('/reportTemplate', getReportTemplates, true);
router.getS('/reportTemplate/:id', getReportTemplate, true);

router.postS('/petition', createPetition, true);
router.getS('/petition/:id', getPetition, true);
router.postS('/petition/:id', modifyPetition, true);
router.deleteS('/petition/:id', removePetition, true);
router.getS('/petition/:id/logs', getPetitionLog, true);
router.putS('/petition/:id/status/change', changePetitionStatus, true);
router.putS('/petition/:id/status/done', updateDonePetitionStatus, true);

router.postS('/check-list', createCheckItem, true);
router.postS('/check-list/:id', updateCheckItem, true);
router.deleteS('/check-list/:id', deleteCheckItem, true);
router.putS('/check-list/:id/status', updateCheckItemStatus, true);
router.getS('/check-list/:id/logs', getCheckItemLogs, true);

router.getS('/:taskId', getTask, true);
router.putS('/:taskId', updateTask, true);

router.postS('/:taskId/booking', updateTaskBooking, true);
router.deleteS('/:taskId/booking/:bookingId', deleteTaskBooking, true);

router.postS('/:taskId/status', changeStatus, true);
router.putS('/:taskId/status/done', updateDoneStatus, true);
router.postS('/:taskId/checking', updateTaskChecking, true);
router.postS('/:taskId/note', addNote, true);
router.putS('/:taskId/note/:noteId', updateNote, true);

router.postS('/:taskId/asset-issue/assign', addAssetIssues, true);
router.deleteS('/:taskId/asset-issue/assign', removeAssetIssues, true);

router.postS('/:taskId/notification/reminder', reminderTask, true);

router.getS('/:taskId/check-list/petition/remain', getRemainPetition, true);

router.getS('/:taskId/payment', getTaskFees);
router.postS('/:taskId/payment', createTaskFee);
router.putS('/:taskId/payment/:payoutId', updateTaskFee);
router.deleteS('/:taskId/payment/:payoutId', deleteTaskFee);

const activity = {
	TASK_CREATE: {
		key: '/',
		exact: true,
	},
	TASK_SCHEDULE_CREATE: {
		key: '/schedule',
		exact: true,
	},
	TASK_SCHEDULE_FLOOR_CREATE: {
		key: '/scheduleFloor',
		exact: true,
	},
	TASK_UPDATE: {
		key: '/{id}',
		method: 'PUT',
		exact: true,
	},
	TASK_CATEGORY_CREATE: {
		key: '/category',
		exact: true,
	},
	TASK_CATEGORY_UPDATE: {
		key: '/category/{id}',
		method: 'PUT',
		exact: true,
	},
	TASK_UPDATE_BOOKING_ID: {
		key: '/{id}/booking',
		exact: true,
	},
	TASK_REMOVE_BOOKING_ID: {
		key: '/{id}/booking/{id}',
		method: 'DELETE',
		exact: true,
	},
	TASK_CHANGE_STATUS: {
		key: '/{id}/status',
		exact: true,
	},
	TASK_CHECKING_QUALITY: {
		key: '/{id}/checking',
		method: 'POST',
		exact: true,
	},
	TASK_CREATE_NOTE: {
		key: '/{id}/note',
		method: 'POST',
		exact: true,
	},
	TASK_UPDATE_NOTE: {
		key: '/{id}/note/{id}',
		method: 'PUT',
		exact: true,
	},
	TASK_ASSIGN_ASSET_ISSUE: {
		key: '/{id}/asset-issue/assign',
		method: 'POST',
		exact: true,
	},
	TASK_REMOVE_ASSET_ISSUE: {
		key: '/{id}/asset-issue/assign',
		method: 'DELETE',
		exact: true,
	},
	TASK_CREATE_CHECK_ITEM: {
		key: '/check-item',
		method: 'POST',
		exact: true,
	},
	TASK_UPDATE_CHECK_ITEM: {
		key: '/check-item/{id}',
		method: 'POST',
		exact: true,
	},
	TASK_UPDATE_CHECK_ITEM_STATUS: {
		key: '/check-item/{id}/status',
		method: 'PUT',
		exact: true,
	},
	TASK_DELETE_CHECK_ITEM: {
		key: '/check-item/{id}',
		method: 'DELETE',
		exact: true,
	},
	PETITION_CREATE: {
		key: '/petition',
		method: 'POST',
		exact: true,
	},
	PETITION_CHANGE_STATUS: {
		key: '/petition/{id}/status/change',
		method: 'POST',
		exact: true,
	},
	PETITION_STATUS_DONE: {
		key: '/task/petition/{id}/status/change',
		method: 'PUT',
		exact: true,
	},
	PETITION_UPDATE: {
		key: '/petition/{id}',
		method: 'POST',
		exact: true,
	},
	PETITION_DELETE: {
		key: '/petition/{id}',
		method: 'DELETE',
		exact: true,
	},
	TASK_PAYMENT_CREATE: {
		key: '/{id}/payment',
		exact: true,
	},
	TASK_PAYMENT_UPDATE: {
		key: '/{id}/payment/{id}',
		method: 'PUT',
		exact: true,
	},
	TASK_PAYMENT_DELETE: {
		key: '/{id}/payment/{id}',
		method: 'DELETE',
		exact: true,
	},
	TASK_REMIND: {
		key: '/{id}/notification/reminder',
		exact: true,
	},
};

module.exports = { router, activity };

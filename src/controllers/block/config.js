const _ = require('lodash');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');

async function get(blockId) {
	const blockConfig = await models.BlockConfig.findOne({ blockId })
		.populate({
			path: 'checkListCategoryConfigs.taskCategoryId',
			populate: { path: 'departmentIds' },
		})
		.populate('checkListCategoryConfigs.checkListCategories.checkListCategoryId')
		.select('-blockId')
		.lean();
	if (!blockConfig) throw new ThrowReturn('Block config does not exist');
	return blockConfig;
}

async function getCheckListCategories(blockId, taskCategoryId) {
	const { blockConfig, checkListCategoryConfig } = await models.BlockConfig.getCheckListCategories(
		blockId,
		taskCategoryId
	);

	const haveCheckListCategories = _.get(checkListCategoryConfig, 'checkListCategories.length', 0);
	if (haveCheckListCategories) {
		await blockConfig.populate('checkListCategoryConfigs.checkListCategories.checkListCategoryId').execPopulate();

		return checkListCategoryConfig.checkListCategories.map(item => ({
			..._.get(item, 'checkListCategoryId._doc', {}),
			order: item.order,
		}));
	}

	const defaultCheckListCategories = await models.CheckListCategory.find({
		taskCategoryIds: taskCategoryId,
		default: true,
	})
		.sort({ order: 1 })
		.lean();

	return defaultCheckListCategories;
}

async function addTaskCategory(blockId, taskCategoryId) {
	const isTaskCategoryExist = await models.TaskCategory.findOne({ _id: taskCategoryId, hasCheckList: true }).lean();
	if (!isTaskCategoryExist) throw new ThrowReturn('Task category does not exist');

	const { blockConfig, checkListCategoryConfig } = await models.BlockConfig.getCheckListCategories(
		blockId,
		taskCategoryId
	);

	const isTaskCategoryConfigured = !!checkListCategoryConfig.taskCategoryId;

	if (!isTaskCategoryConfigured) {
		blockConfig.checkListCategoryConfigs.push({
			taskCategoryId,
			checkListCategories: [],
		});
		return blockConfig.save();
	}
}

async function addCheckItemCategory(blockId, taskCategoryId, checkListCategoryId) {
	const isCheckListCategoryIdValid = await models.CheckListCategory.findOne({
		_id: checkListCategoryId,
		taskCategoryIds: taskCategoryId,
	}).lean();
	if (!isCheckListCategoryIdValid) throw new ThrowReturn('Check list category does not exist');

	const { blockConfig, checkListCategoryConfig } = await models.BlockConfig.getCheckListCategories(
		blockId,
		taskCategoryId
	);

	const isTaskCategoryConfigured = !!checkListCategoryConfig.taskCategoryId;

	if (!isTaskCategoryConfigured) {
		blockConfig.checkListCategoryConfigs.push({
			taskCategoryId,
			checkListCategories: [{ checkListCategoryId, order: 0 }],
		});
	} else {
		const order = _.get(checkListCategoryConfig, 'checkListCategories.length', 0);
		const isExistCheckListCategory = checkListCategoryConfig.checkListCategories.find(
			item => item.checkListCategoryId.toString() === checkListCategoryId
		);

		if (!isExistCheckListCategory) {
			checkListCategoryConfig.checkListCategories.push({ checkListCategoryId, order });
		}
	}

	return blockConfig.save();
}

async function removeCheckItemCategory(blockId, taskCategoryId, checkItemCategoryId) {
	const { blockConfig, checkListCategoryConfig } = await models.BlockConfig.getCheckListCategories(
		blockId,
		taskCategoryId
	);
	const haveCheckListCategories = _.get(checkListCategoryConfig, 'checkListCategories.length', 0);

	if (haveCheckListCategories) {
		checkListCategoryConfig.checkListCategories = checkListCategoryConfig.checkListCategories.filter(
			item => !item.checkListCategoryId.equals(checkItemCategoryId)
		);
		checkListCategoryConfig.checkListCategories.forEach((item, index) => {
			item.order = index;
		});

		return blockConfig.save();
	}
}

async function sortCheckListCategories(blockId, taskCategoryId, data = []) {
	const { blockConfig, checkListCategoryConfig } = await models.BlockConfig.getCheckListCategories(
		blockId,
		taskCategoryId
	);
	const orders = _.keyBy(data, 'id');
	const checkListCategories = checkListCategoryConfig.checkListCategories || [];

	if (checkListCategories.length < 2) return;

	checkListCategories.forEach(item => {
		item.order = _.get(orders, [item.checkListCategoryId, 'order'], 0);
	});
	checkListCategoryConfig.checkListCategories = checkListCategories.sort((a, b) => a.order - b.order);

	return blockConfig.save();
}

module.exports = {
	get,
	getCheckListCategories,
	addCheckItemCategory,
	addTaskCategory,
	removeCheckItemCategory,
	sortCheckListCategories,
};

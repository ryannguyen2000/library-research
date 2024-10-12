const _ = require('lodash');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');

async function create({ taskCategoryId, ...data }) {
	const category = await models.CheckListCategory.create({ taskCategoryIds: [taskCategoryId], ...data });
	return category;
}

async function list(taskCategoryId, query) {
	const filter = _.pickBy({
		taskCategoryIds: taskCategoryId ? { $in: [taskCategoryId] } : null,
	});

	if (['true', 'false'].includes(query.default)) filter.default = query.default === 'true';

	const checkListCategories = await models.CheckListCategory.find(filter).sort({ order: 1 }).lean();

	return checkListCategories;
}

async function modify(id, data) {
	const update = _.pick(data, ['description', 'name', 'blockIds', 'default', 'defaultLabel']);
	const doc = await models.CheckListCategory.findById(id);
	if (!doc) throw new ThrowReturn('Check list category does not exist');

	if (_.isBoolean(data.default) && doc.default !== data.default) {
		if (data.default) {
			const last = await models.CheckListCategory.findOne({
				default: true,
				taskCategoryIds: { $in: doc.taskCategoryIds },
			})
				.select('order')
				.sort({ order: -1 })
				.limit(1)
				.lean();
			const order = _.get(last, 'order', 0);
			update.order = order + 1;
		}
	}

	Object.assign(doc, update);
	return doc.save();
}

function sort(taskCategoryId, data = []) {
	const bulks = data.map(({ id, order }) => ({
		updateOne: { filter: { _id: id, default: true, taskCategoryIds: taskCategoryId }, update: { order } },
	}));
	return models.CheckListCategory.bulkWrite(bulks);
}

module.exports = {
	create,
	list,
	modify,
	sort,
};

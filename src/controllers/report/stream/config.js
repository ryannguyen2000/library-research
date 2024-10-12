const _ = require('lodash');

const { REPORT_STREAM_CTG_TYPES } = require('@utils/const');
const models = require('@models');
const ThrowReturn = require('@core/throwreturn');

async function getConfig(blockId) {
	if (!blockId) {
		return null;
	}

	const blockConfig = await models.BlockConfig.findOne({ blockId }).select('revenueStreams').lean();

	return { revenueStreams: _.get(blockConfig, 'revenueStreams', []) };
}

async function updateConfig(blockId, revenueStreams, user) {
	if (!blockId || !revenueStreams) {
		throw new ThrowReturn('Data cannot be blank');
	}

	let blockConfig = await models.BlockConfig.findOne({ blockId });

	revenueStreams.updatedBy = user._id;

	if (blockConfig) {
		blockConfig.revenueStreams = revenueStreams;
	} else {
		blockConfig = new models.BlockConfig({ revenueStreams });
	}

	await blockConfig.save();

	return { revenueStreams: blockConfig.revenueStreams };
}

async function getCategories({ type, isVirtual }) {
	const filter = {
		isVirtual: { $ne: true },
		parentId: null,
	};

	if (type) {
		filter.type = type;
	}
	if (isVirtual) {
		filter.isVirtual = Boolean(isVirtual);
	}

	const sorter = { order: 1, _id: 1 };

	const categories = await models.ReportStreamCategory.find(filter)
		.sort(sorter)
		.populate({
			path: 'children',
			sort: sorter,
			match: { isVirtual: { $ne: true } },
			populate: {
				path: 'children',
				sort: sorter,
				match: { isVirtual: { $ne: true } },
				populate: {
					path: 'children',
					match: { isVirtual: { $ne: true } },
					sort: sorter,
				},
			},
		});

	return {
		categories,
	};
}

async function getProjects() {
	const filter = {
		type: REPORT_STREAM_CTG_TYPES.REVENUE,
		isVirtual: false,
		parentId: null,
	};

	// REPORT_STREAM_CTG_TYPES

	// const projects = await models.ReportStreamProject.find(filter).select('name');
	const projects = await models.ReportStreamCategory.find(filter).select('name');

	return {
		projects,
	};
}

module.exports = {
	getConfig,
	updateConfig,
	getCategories,
	getProjects,
};

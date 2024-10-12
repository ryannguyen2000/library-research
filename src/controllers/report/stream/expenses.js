const _ = require('lodash');
const mongoose = require('mongoose');

const {
	REPORT_STREAM_TRANSACTION_TYPES,
	// REPORT_STREAM_VIRTUAL_CTG_TYPES,
	REPORT_STREAM_CTG_TYPES,
} = require('@utils/const');
const models = require('@models');
const { findChildCategoryIds, mapDataRanges, generateParentKey, parseParentKey, findByRanges } = require('./utils');

async function getCategory({ filter, ranges, category }) {
	const data = await findByRanges({ filter, ranges });

	const hasChild = !!_.get(category.children, 'length');
	const isParent = hasChild || !category.parentId;

	const revenueStream = [
		{
			key: generateParentKey({ categoryId: category._id }),
			label: category.name,
			data: mapDataRanges(data, ranges),
			hasChild,
			style: {
				bold: isParent,
				color: '#000',
			},
			labelStyle: {
				bold: isParent,
				color: isParent ? '#666666' : '#000',
			},
			chartStyle: category.chartColor && {
				color: category.chartColor,
			},
		},
	];

	return revenueStream;
}

async function getExpensesStream(query) {
	const { blockIds, source, ranges, parentKey, projectId } = query;

	const filter = {
		blockId: { $in: blockIds },
		type: {
			$in: [
				REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_CALCULATION,
				REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_TRANSACTION,
			],
		},
	};
	if (source) {
		filter.source = source;
	}
	if (projectId) {
		filter.projectId = mongoose.Types.ObjectId(projectId);
	}

	const categoryFilter = {
		type: REPORT_STREAM_CTG_TYPES.EXPENSES,
	};

	let keyData = null;

	if (parentKey) {
		keyData = parseParentKey(parentKey);
		categoryFilter.parentId = keyData.categoryId;
	} else {
		categoryFilter.parentId = null;
	}

	const categories = await models.ReportStreamCategory.find(categoryFilter)
		.select('totalChilds parentId name type virtualType chartColor')
		.sort({ order: 1, _id: 1 })
		.populate({
			path: 'children',
			populate: {
				path: 'children',
				populate: {
					path: 'children',
					populate: {
						path: 'children',
					},
				},
			},
		});

	const streamCtgs = await categories.asyncMap(async category => {
		const cfilter = {
			...filter,
			categoryId: { $in: findChildCategoryIds(category) },
		};

		return getCategory({
			ranges,
			category,
			filter: cfilter,
		});
	});

	return {
		expensesStream: _.flatten(streamCtgs),
		parentKey,
	};
}

module.exports = { getExpensesStream };

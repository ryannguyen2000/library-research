const _ = require('lodash');
const mongoose = require('mongoose');

const { REPORT_STREAM_VIRTUAL_CTG_TYPES, REPORT_STREAM_CTG_TYPES } = require('@utils/const');
const models = require('@models');
const { exec } = require('@utils/operator');
const {
	findChildCategoryIds,
	mapDataRanges,
	generateParentKey,
	parseParentKey,
	findByRanges,
	findRootCategoryId,
} = require('./utils');

async function getRevenue({ filter, ranges, category, projectId }) {
	const isVirtual = category.refIds && category.refIds.length;

	if (isVirtual) {
		const cFilter = {
			isVirtual: false,
			_id: { $in: category.refIds },
		};
		if (projectId) {
			_.set(cFilter, ['_id', '$eq'], projectId);
		}

		const categories = await models.ReportStreamCategory.find(cFilter)
			.select('parentId type virtualType isVirtual')
			.populate({
				path: 'children',
				populate: {
					path: 'children',
				},
			});

		const mapperIds = {};
		const categoryIds = [];

		categories.forEach(c => {
			mapperIds[c._id] = findChildCategoryIds(c);
			categoryIds.push(...mapperIds[c._id]);
		});

		const data = await findByRanges({
			filter: { ...filter, categoryId: { $in: categoryIds } },
			ranges,
		});

		return [
			{
				key: generateParentKey({
					categoryId: category._id,
					type: REPORT_STREAM_CTG_TYPES.REVENUE,
				}),
				label: category.name,
				data: mapDataRanges(data, ranges),
				hasChild: true,
				style: {
					bold: true,
					color: '#000',
				},
				labelStyle: {
					bold: true,
					color: '#666666',
				},
			},
		];
	}

	if (projectId) {
		if (_.toString(category._id) !== _.toString(projectId)) {
			return [];
		}
	}

	if (!category.isVirtual) {
		await models.ReportStreamCategory.populate(category, {
			path: 'children',
			populate: {
				path: 'children',
			},
		});
	}

	const data = await findByRanges({
		filter: {
			...filter,
			categoryId: { $in: category.isVirtual ? findRootCategoryId(category) : findChildCategoryIds(category) },
		},
		ranges,
	});

	const revenueStream = [
		{
			key: generateParentKey({ categoryId: category._id }),
			label: category.name,
			data: mapDataRanges(data, ranges),
			hasChild: false,
			style: {
				bold: false,
				color: '#777',
			},
			labelStyle: {
				bold: false,
				color: '#777',
			},
		},
	];

	return revenueStream;
}

async function getExpenses({ filter, ranges, category, projectId }) {
	const cFilter = {
		isVirtual: { $ne: true },
	};

	if (projectId) {
		filter = {
			...filter,
			projectId: mongoose.Types.ObjectId(projectId),
		};
	}

	if (category.refIds && category.refIds.length) {
		cFilter._id = category.refIds;

		const categories = await models.ReportStreamCategory.find(cFilter)
			.select('name parentId')
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

		const mapperIds = {};
		const categoryIds = [];

		categories.forEach(c => {
			mapperIds[c._id] = findChildCategoryIds(c);
			categoryIds.push(...mapperIds[c._id]);
		});

		const data = await findByRanges({
			filter: { ...filter, categoryId: { $in: categoryIds } },
			ranges,
			groupKey: 'categoryId',
		});

		const dataGroup = _.groupBy(data, 'categoryId');

		const expensesStream = categories.map(expCategory => {
			const hasChild = !!expCategory.children.length;
			const eData = _.flatten(mapperIds[expCategory._id].map(k => dataGroup[k] || []));

			const isParent = hasChild || !expCategory.parentId;

			return {
				key: generateParentKey({ categoryId: expCategory._id }),
				label: expCategory.name,
				data: mapDataRanges(eData, ranges),
				hasChild,
				style: {
					bold: isParent,
					color: isParent ? '#000' : '#777',
				},
				labelStyle: {
					bold: isParent,
					color: isParent ? '#666666' : '#777',
				},
			};
		});

		return expensesStream;
	}

	await models.ReportStreamCategory.populate(category, {
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

	const categoryIds = findChildCategoryIds(category);

	const data = await findByRanges({
		filter: { ...filter, categoryId: { $in: categoryIds } },
		ranges,
	});

	const hasChild = !!category.children && !!category.children.length;

	const expensesStream = [
		{
			key: generateParentKey({ categoryId: category._id }),
			label: category.name,
			data: mapDataRanges(data, ranges),
			hasChild,
			style: {
				bold: hasChild,
				color: hasChild ? '#000' : '#777',
			},
			labelStyle: {
				bold: hasChild,
				color: hasChild ? '#666666' : '#777',
			},
		},
	];

	return expensesStream;
}

async function getIncomeStatements(query) {
	const { blockIds, source, ranges, parentKey, projectId } = query;

	const filter = {
		blockId: { $in: blockIds },
	};
	if (source) {
		filter.source = source;
	}

	const categoryFilter = {};

	if (parentKey) {
		const keyData = parseParentKey(parentKey);

		if (keyData.type) {
			categoryFilter.type = keyData.type;
			categoryFilter.isVirtual = false;
			categoryFilter.parentId = null;
		} else if (keyData.categoryId) {
			categoryFilter.parentId = keyData.categoryId;
		}
	} else {
		categoryFilter.parentId = null;
		categoryFilter.type = REPORT_STREAM_CTG_TYPES.INCOME_STATMENT;
	}

	const categories = await models.ReportStreamCategory.find(categoryFilter).sort({ order: 1, _id: 1 });

	const streamCtgs = new Array(categories.length).fill(null);

	await categories.asyncMap(async (category, index) => {
		let data;

		if (
			category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.INCOME_REVENUE ||
			category.type === REPORT_STREAM_CTG_TYPES.REVENUE
		) {
			data = await getRevenue({
				ranges,
				category,
				filter,
				projectId,
			});
		} else if (
			category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.INCOME_EXPENSES ||
			category.type === REPORT_STREAM_CTG_TYPES.EXPENSES
		) {
			data = await getExpenses({
				ranges,
				category,
				filter,
				projectId,
			});
		}

		streamCtgs[index] = data;
	});

	if (categories.some(c => c.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.CALCULATION)) {
		const dataForCalculator = {};

		categories.forEach((c, index) => {
			const streams = streamCtgs[index];

			ranges.forEach((range, rangeIndex) => {
				_.set(
					dataForCalculator,
					[rangeIndex, c._id],
					streams ? _.sum(streams.map(str => str.data[rangeIndex].value)) : c.operation
				);
			});
		});

		categories.forEach((category, cIndex) => {
			if (category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.CALCULATION) {
				const rs = {
					data: [],
					key: generateParentKey({ categoryId: category._id }),
					hasChild: false,
					label: category.name,
					style: {
						bold: true,
						color: '#000',
					},
					suffix: category.suffix,
					labelStyle: {
						bold: true,
						color: '#666666',
					},
				};

				const rounded = category.suffix ? 2 : 0;

				ranges.forEach((range, rangeIndex) => {
					rs.data.push({
						...range,
						value: _.round(exec(category.operation, dataForCalculator[rangeIndex]), rounded) || 0,
					});
				});

				streamCtgs[cIndex] = rs;
			}
		});
	}

	return {
		incomeStatement: _.compact(_.flatten(streamCtgs)),
		showTotal: false,
		showChart: false,
		parentKey,
	};
}

module.exports = { getIncomeStatements };

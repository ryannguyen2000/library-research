const _ = require('lodash');

const {
	REPORT_STREAM_TRANSACTION_TYPES,
	REPORT_STREAM_VIRTUAL_CTG_TYPES,
	REPORT_STREAM_CTG_TYPES,
	TIMELINE_TYPES,
} = require('@utils/const');
const models = require('@models');
const {
	SERVICES_COMMISSION_LABEL,
	REPORT_STREAM_TRANSACTION_TYPES_LABEL,
	REPORT_STREAM_TRANSACTION_SOURCES_LABEL,
} = require('./const');
const {
	mapDataRanges,
	generateParentKey,
	parseParentKey,
	findByRanges,
	findChildCategoryIds,
	findRootCategoryId,
} = require('./utils');

async function getCategory({ filter, ranges, category }) {
	const data = await findByRanges({ filter, ranges });

	const revenueStream = [
		{
			key: generateParentKey({ categoryId: category._id }),
			label: category.name,
			data: mapDataRanges(data, ranges),
			hasChild: !!category.children && !!category.children.length,
			style: {
				bold: true,
				color: '#000',
			},
			labelStyle: {
				bold: true,
				color: '#666666',
			},
			chartStyle: {
				color: category.chartColor,
			},
		},
	];

	return revenueStream;
}

async function getLocations({ filter, ranges, category, locationId }) {
	const isDistrict = category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.DISTRICT;
	const key = isDistrict ? 'districtId' : 'provinceId';

	if (locationId && isDistrict) {
		filter.provinceId = locationId;
	}

	const data = await findByRanges({ ranges, filter, groupKey: key });

	const Model = isDistrict ? models.District : models.Province;

	const groupData = _.groupBy(data, key);
	const locations = await Model.find({ _id: _.keys(groupData) })
		.select('name')
		.lean();

	const style = {
		color: isDistrict ? '#434343' : '#38761d',
		bold: true,
	};

	const revenueStream = locations.map(c => {
		return {
			key: generateParentKey({ categoryId: category._id, locationId: c._id, type: category.virtualType }),
			label: c.name,
			data: mapDataRanges(groupData[c._id], ranges),
			hasChild: !!category.children && !!category.children.length,
			style,
		};
	});

	return revenueStream;
}

async function getHotelStats({ filter, ranges, category, locationId }) {
	if (locationId) {
		filter.districtId = locationId;
	}

	const isVer2 = category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL_STATS_2;

	const data = await findByRanges({ ranges, filter, groups: { blockIds: { $addToSet: '$blockId' } } });
	const blockIds = _.uniqBy(_.flatten(_.map(data, 'blockIds')), _.toString);
	const totalHotel = blockIds.length;
	const totalRoom = await models.Room.getTotalRooms({ blockId: blockIds });

	const groupData = _.groupBy(data, 'time');

	const style = {
		color: isVer2 ? '#5aae66' : '#134f5c',
		bold: false,
	};

	const revenueStream = [
		{
			key: generateParentKey({
				categoryId: category._id,
				locationId,
				type: REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL_COUNT,
			}),
			label: isVer2 ? 'Number of Hotel' : 'Total of Hotels',
			hasChild: !!category.children && !!category.children.length,
			data: ranges.map(r => ({
				time: r.time,
				timeFormatted: r.timeFormatted,
				value: totalHotel,
			})),
			labelStyle: { ...style, bold: !isVer2 },
			style,
		},
		{
			key: generateParentKey({
				categoryId: category._id,
				locationId,
				type: REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL_REVENUE_AVG,
			}),
			label: isVer2 ? 'Avg per Hotel' : 'Avg revenue per Hotel',
			hasChild: false,
			data: ranges.map(r => ({
				time: r.time,
				timeFormatted: r.timeFormatted,
				value: _.round(_.sumBy(groupData[r.time], 'value') / totalHotel) || 0,
			})),
			style,
		},
		{
			key: generateParentKey({
				categoryId: category._id,
				locationId,
				type: REPORT_STREAM_VIRTUAL_CTG_TYPES.ROOM_COUNT,
			}),
			label: isVer2 ? 'Number of Room' : 'Total of Rooms',
			hasChild: false,
			data: ranges.map(r => ({
				time: r.time,
				timeFormatted: r.timeFormatted,
				value: totalRoom,
			})),
			style,
		},
		{
			key: generateParentKey({
				categoryId: category._id,
				locationId,
				type: REPORT_STREAM_VIRTUAL_CTG_TYPES.ROOM_REVENUE_AVG,
			}),
			label: isVer2 ? 'Avg per Room' : 'Avg revenue per Room',
			hasChild: false,
			data: ranges.map(r => ({
				time: r.time,
				timeFormatted: r.timeFormatted,
				value: _.round(_.sumBy(groupData[r.time], 'value') / totalRoom) || 0,
			})),
			style,
		},
	];

	return revenueStream;
}

async function getHotelsList({ filter, ranges, category, locationId, types }) {
	if (locationId) {
		filter.districtId = locationId;
	}

	const data = await findByRanges({ ranges, filter, groupKey: 'blockId' });
	const groupData = _.groupBy(data, 'blockId');
	const blockIds = _.keys(groupData);

	const blocks = await models.Block.find({ _id: blockIds }).select('info.name');

	const isCoop =
		category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL_LIST_COOP &&
		types.includes(REPORT_STREAM_TRANSACTION_TYPES.REVENUE_CALCULATION);

	const revenueStream = await blocks.asyncMap(async block => {
		const totalRoom = await models.Room.getTotalRooms({ blockId: block._id });

		const style = {
			color: `#${block._id.toString().slice(-6)}`,
			bold: false,
		};

		const streams = [
			{
				key: generateParentKey({
					categoryId: category._id,
					locationId,
					blockId: block._id,
					type: REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL,
				}),
				label: block.info.name,
				data: mapDataRanges(groupData[block._id], ranges),
				hasChild: !!category.children && !!category.children.length,
				style,
			},
			{
				key: generateParentKey({
					categoryId: category._id,
					locationId,
					blockId: block._id,
					type: REPORT_STREAM_VIRTUAL_CTG_TYPES.ROOM_COUNT,
				}),
				label: 'Number of Room',
				data: ranges.map(r => ({
					time: r.time,
					timeFormatted: r.timeFormatted,
					value: totalRoom,
				})),
				style,
			},
		];

		if (isCoop) {
			const infoTypes = [
				REPORT_STREAM_TRANSACTION_TYPES.REVENUE_INFO,
				REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_INFO,
				REPORT_STREAM_TRANSACTION_TYPES.PROFIT_INFO,
			];

			const coopFilter = {
				...filter,
				blockId: block._id,
				type: {
					$in: infoTypes,
				},
			};
			delete coopFilter.source;

			const [coopData, revenueSource] = await Promise.all([
				findByRanges({
					ranges,
					filter: coopFilter,
					groupKey: 'type',
				}),
				findByRanges({
					ranges,
					filter: {
						...filter,
						blockId: block._id,
						type: REPORT_STREAM_TRANSACTION_TYPES.REVENUE_CALCULATION,
					},
					groupKey: 'source',
				}),
			]);

			_.forEach(_.groupBy(coopData, 'type'), (gdata, gkey) => {
				streams.push({
					key: generateParentKey({
						categoryId: category._id,
						locationId,
						blockId: block._id,
						type: gkey,
					}),
					label: REPORT_STREAM_TRANSACTION_TYPES_LABEL[gkey],
					data: mapDataRanges(gdata, ranges),
					style,
				});
			});

			_.forEach(_.groupBy(revenueSource, 'source'), (gdata, gkey) => {
				streams.push({
					key: generateParentKey({
						categoryId: category._id,
						locationId,
						blockId: block._id,
						source: gkey,
						type: gkey,
					}),
					label: REPORT_STREAM_TRANSACTION_SOURCES_LABEL[gkey],
					data: mapDataRanges(gdata, ranges),
					style,
				});
			});
		}

		return streams;
	});

	return _.flatten(revenueStream);
}

async function getOTAsCommission({ filter, ranges, category }) {
	const data = await findByRanges({ ranges, filter, groupKey: 'otaName' });
	const groupData = _.groupBy(data, 'otaName');

	const otas = await models.BookingSource.find({ name: _.keys(groupData) })
		.select('name label')
		.sort({ order: 1, name: 1 })
		.lean();

	const style = {
		bold: true,
		color: '#1155cc',
	};
	const labelStyle = {
		color: '#666666',
		bold: true,
	};

	const revenueStream = otas.map(c => {
		return {
			key: generateParentKey({ categoryId: category._id, otaName: c.name }),
			label: c.label,
			data: mapDataRanges(groupData[c.name], ranges),
			hasChild: !!category.children && !!category.children.length,
			style,
			labelStyle,
		};
	});

	return revenueStream;
}

async function getOTAsCommissionByServices({ filter, ranges, category, otaName }) {
	if (otaName) {
		filter.otaName = otaName;
	}

	const data = await findByRanges({ ranges, filter, groupKey: 'serviceType' });
	const groupData = _.groupBy(data, 'serviceType');
	const style = {
		color: '#134f80',
		bold: true,
	};
	const labelStyle = {
		color: '#666666',
		bold: true,
	};

	const revenueStream = _.entries(groupData).map(([serviceType, sdata]) => {
		return {
			key: generateParentKey({ categoryId: category._id, otaName, serviceType: Number(serviceType) }),
			label: SERVICES_COMMISSION_LABEL[serviceType] || serviceType,
			data: mapDataRanges(sdata, ranges),
			hasChild: !!category.children && !!category.children.length,
			style,
			labelStyle,
		};
	});

	return revenueStream;
}

async function getGMVTransaction({ filter, ranges, category, otaName, serviceType }) {
	if (otaName) {
		filter.otaName = otaName;
	}
	if (serviceType) {
		filter.serviceType = serviceType;
	}

	const data = await findByRanges({ ranges, filter, sumKey: 'gmv', groups: { total: { $sum: 1 } } });
	const group = _.groupBy(data, 'time');
	const style = {
		color: '#38761d',
		bold: false,
	};
	const labelStyle = {
		color: '#666666',
		bold: false,
	};

	const revenueStream = [
		{
			key: generateParentKey({
				categoryId: category._id,
				otaName,
				serviceType,
				type: REPORT_STREAM_VIRTUAL_CTG_TYPES.GMV_TRANSACTION,
			}),
			label: 'GMV of transactions',
			data: ranges.map(r => ({
				time: r.time,
				timeFormatted: r.timeFormatted,
				value: _.round(_.sumBy(group[r.time], 'value')) || 0,
			})),
			hasChild: !!category.children && !!category.children.length,
			style,
			labelStyle,
		},
		{
			key: generateParentKey({
				categoryId: category._id,
				otaName,
				serviceType,
				type: REPORT_STREAM_VIRTUAL_CTG_TYPES.GMV_TRANSACTION_TOTAL,
			}),
			label: 'Total of transactions',
			data: ranges.map(r => ({
				time: r.time,
				timeFormatted: r.timeFormatted,
				value: _.round(_.sumBy(group[r.time], 'total') || 0),
			})),
			hasChild: !!category.children && !!category.children.length,
			style,
			labelStyle,
		},
		{
			key: generateParentKey({
				categoryId: category._id,
				otaName,
				serviceType,
				type: REPORT_STREAM_VIRTUAL_CTG_TYPES.GMV_TRANSACTION_AVG,
			}),
			label: 'Avg GMV per transaction',
			data: ranges.map(r => ({
				time: r.time,
				timeFormatted: r.timeFormatted,
				value: _.round((_.sumBy(group[r.time], 'value') || 0) / (_.sumBy(group[r.time], 'total') || 1)),
			})),
			hasChild: !!category.children && !!category.children.length,
			style,
			labelStyle,
		},
	];

	return revenueStream;
}

async function getRevenueStream(query) {
	const { blockIds, source, ranges, parentKey, projectId, timelineType } = query;

	const types = [REPORT_STREAM_TRANSACTION_TYPES.REVENUE_TRANSACTION];

	if (
		timelineType === TIMELINE_TYPES.MONTHLY ||
		timelineType === TIMELINE_TYPES.QUARTERLY ||
		timelineType === TIMELINE_TYPES.YEARLY
	) {
		types.push(REPORT_STREAM_TRANSACTION_TYPES.REVENUE_CALCULATION);
	}

	const filter = {
		blockId: { $in: blockIds },
		type: {
			$in: types,
		},
	};
	if (source) {
		filter.source = source;
	}

	const categoryFilter = {
		type: REPORT_STREAM_CTG_TYPES.REVENUE,
	};

	let keyData = null;

	if (parentKey) {
		keyData = parseParentKey(parentKey);
		categoryFilter.parentId = keyData.categoryId;
	} else {
		categoryFilter.parentId = null;
		if (projectId) {
			categoryFilter._id = projectId;
		}
		if (source) {
			categoryFilter.sources = { $in: [source, null] };
		}
	}

	const categories = await models.ReportStreamCategory.find(categoryFilter)
		.select('parentId name type virtualType chartColor isVirtual')
		.sort({ order: 1, _id: 1 })
		.populate({
			path: 'parentId',
			populate: {
				path: 'parentId',
				populate: {
					path: 'parentId',
					populate: {
						path: 'parentId',
					},
				},
			},
		})
		.populate({
			path: 'children',
			populate: {
				path: 'children',
			},
		});

	const streamCtgs = await categories.asyncMap(async category => {
		const cfilter = {
			...filter,
			categoryId: category.isVirtual ? findRootCategoryId(category) : { $in: findChildCategoryIds(category) },
		};

		if (
			category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.PROVINCE ||
			category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.DISTRICT
		) {
			return getLocations({
				ranges,
				filter: cfilter,
				locationId: _.get(keyData, 'locationId'),
				category,
			});
		}

		if (
			category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL_STATS_1 ||
			category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL_STATS_2
		) {
			return getHotelStats({
				ranges,
				filter: cfilter,
				locationId: _.get(keyData, 'locationId'),
				category,
			});
		}

		if (
			category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL_LIST ||
			category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.HOTEL_LIST_COOP
		) {
			return getHotelsList({
				ranges,
				filter: cfilter,
				locationId: _.get(keyData, 'locationId'),
				category,
				types,
			});
		}

		if (category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.COMMISSION_OTA) {
			return getOTAsCommission({
				ranges,
				filter: cfilter,
				category,
			});
		}

		if (category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.COMMISSION_OTA_BY_SERVICE) {
			return getOTAsCommissionByServices({
				ranges,
				filter: cfilter,
				category,
				otaName: _.get(keyData, 'otaName'),
			});
		}

		if (category.virtualType === REPORT_STREAM_VIRTUAL_CTG_TYPES.GMV_TRANSACTION) {
			return getGMVTransaction({
				ranges,
				filter: cfilter,
				category,
				otaName: _.get(keyData, 'otaName'),
				serviceType: _.get(keyData, 'serviceType'),
			});
		}

		return getCategory({
			ranges,
			category,
			filter: cfilter,
			source,
		});
	});

	return {
		revenueStream: _.flatten(streamCtgs),
		parentKey,
	};
}

module.exports = { getRevenueStream };

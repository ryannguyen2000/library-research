const _ = require('lodash');
const moment = require('moment');

const { atob, btoa } = require('@utils/func');
const ThrowReturn = require('@core/throwreturn');
const { REPORT_STREAM_SOURCES, TIMELINE_TYPES } = require('@utils/const');
const models = require('@models');

function findChildCategoryIds(category) {
	return [category._id, ..._.flatten(_.map(category.children, findChildCategoryIds))];
}

function findRootCategoryId(category) {
	if (category.parentId && category.parentId._id && category.isVirtual) return findRootCategoryId(category.parentId);
	return category._id;
}

function mapDataRanges(data, ranges) {
	const objData = _.groupBy(data, 'time');

	return ranges.map(r => {
		const value = _.round(_.sumBy(objData[r.time], rv => rv.value || 0) || 0);
		return {
			time: r.time,
			timeFormatted: r.timeFormatted,
			value,
		};
	});
}

function generateParentKey(obj) {
	return btoa(JSON.stringify(obj));
}

function parseParentKey(key) {
	const data = JSON.parse(atob(key));
	return data;
}

async function findByRanges({ ranges, filter, groupKey, groups = null, sumKey = 'amount' }) {
	if (ranges[0].date) {
		const group = {
			_id: { date: '$date' },
			value: { $sum: `$${sumKey}` },
			...groups,
		};
		const project = {
			_id: 0,
			value: 1,
			time: '$_id.date',
			..._.mapValues(groups, () => 1),
		};
		if (groupKey) {
			project[groupKey] = `$_id.${groupKey}`;
			group._id[groupKey] = `$${groupKey}`;
		}

		return models.ReportStreamTransaction.aggregate()
			.match({
				...filter,
				date: { $gte: ranges[0].date, $lte: _.last(ranges).date },
			})
			.group(group)
			.project(project);
	}

	return _.flatten(
		await ranges.asyncMap(async range => {
			const group = await models.ReportStreamTransaction.aggregate()
				.match({
					...filter,
					date: { $gte: range.startDate, $lte: range.endDate },
				})
				.group({
					_id: groupKey ? `$${groupKey}` : null,
					value: { $sum: `$${sumKey}` },
					...groups,
				});

			if (!group) return [];

			return group.map(g => {
				const rs = {
					time: range.time,
					...g,
				};
				if (groupKey) {
					rs[groupKey] = g._id;
				}

				delete rs._id;

				return rs;
			});
		})
	);
}

function parseTime({ from, to, timelineType }) {
	let format = '';
	let unit = '';
	let labelFormat = '';

	if (timelineType === TIMELINE_TYPES.YEARLY) {
		format = 'YYYY';
		unit = 'Y';
		labelFormat = 'YYYY';
	} else if (timelineType === TIMELINE_TYPES.QUARTERLY) {
		format = 'YYYY-Q';
		unit = 'Q';
		labelFormat = q => `Q${q.format('Q-YYYY')}`;
	} else if (timelineType === TIMELINE_TYPES.MONTHLY) {
		format = 'YYYY-MM';
		unit = 'M';
		labelFormat = 'MM/YYYY';
	} else if (timelineType === TIMELINE_TYPES.WEEKLY) {
		format = 'YYYY-WW';
		unit = 'W';
		labelFormat = q => `${moment(q).startOf('W').format('DD/MM')} - ${moment(q).endOf('W').format('DD/MM')}`;
	} else {
		format = 'YYYY-MM-DD';
		unit = 'd';
		labelFormat = 'DD/MM';
	}

	const mfrom = moment(from, format, true);
	const mto = moment(to, format, true);

	if (!mfrom.isValid() || !mto.isValid()) {
		throw new ThrowReturn('Invalid time!');
	}

	const ranges = [];

	while (mfrom.isSameOrBefore(mto, unit)) {
		const range = {
			time: mfrom.format(format),
			timeFormatted: typeof labelFormat === 'string' ? mfrom.format(labelFormat) : labelFormat(mfrom),
		};

		if (unit === 'D') {
			range.date = mfrom.format('Y-MM-DD');
		} else {
			range.startDate = moment(mfrom.toDate()).startOf(unit).format('Y-MM-DD');
			range.endDate = moment(mfrom.toDate()).endOf(unit).format('Y-MM-DD');
		}

		ranges.push(range);

		mfrom.add(1, unit);
	}

	return ranges;
}

function parseQuery(query) {
	query.source = parseInt(query.source) || REPORT_STREAM_SOURCES.CZ;
	query.timelineType = query.timelineType || TIMELINE_TYPES.DAILY;

	return query;
}

module.exports = {
	findChildCategoryIds,
	findRootCategoryId,
	mapDataRanges,
	generateParentKey,
	parseParentKey,
	findByRanges,
	parseTime,
	parseQuery,
};

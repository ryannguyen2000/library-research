const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { getArray } = require('@utils/query');
const { getRanges } = require('@utils/date');
const { USER_SYS_NAME } = require('@utils/const');

const SYS_USERS = {
	[USER_SYS_NAME.GUEST]: 'Khách hàng',
	[USER_SYS_NAME.SYSTEM]: 'Hệ thống',
};

const StatisticActivitiesView = {
	byMonths: 'byMonths',
	byDays: 'byDays',
	byHours: 'byHours',
};

const UNIT_OF_TIME = {
	[StatisticActivitiesView.byHours]: { overview: 'day', detail: 'hour' },
	[StatisticActivitiesView.byDays]: { overview: 'month', detail: 'day' },
	[StatisticActivitiesView.byMonths]: { overview: 'year', detail: 'month' },
};

async function getAuthFilters({ username, user }) {
	const filters = {};

	const group = await models.UserGroup.findOne({ _id: user.groupIds });

	if (!group.primary) {
		const userFilter = {
			groupIds: { $in: user.groupIds },
		};
		if (username) {
			userFilter.username = { $in: getArray(username) };
		}
		const users = await models.User.find(userFilter).select('username').lean();

		filters.username = { $in: _.map(users, 'username') };
	} else if (username) {
		filters.username = { $in: getArray(username) };
	}

	return filters;
}

async function getUserActivities(user, query) {
	let { username, start, limit, type, from, to, blockId, roomId, showTotal } = query;

	const filters = await getAuthFilters({ username, user });

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	if (from) {
		_.set(filters, ['createdAt', '$gte'], new Date(from));
	} else {
		_.set(filters, ['createdAt', '$gte'], moment().startOf('day').toDate());
	}
	if (to) {
		_.set(filters, ['createdAt', '$lte'], new Date(to));
	}
	if (type) {
		filters.type = type;
	}
	if (blockId) {
		filters.blockId = blockId;
	}
	if (roomId) {
		filters.roomId = roomId;
	}

	const data = await models.UserLog.find(filters)
		.sort({ createdAt: -1 })
		.skip(start)
		.limit(limit)
		.populate('user', 'name username')
		.populate('blockId', 'info.name info.shortName')
		.populate('roomId', 'info.roomNo')
		.lean();

	let total;
	if (showTotal !== 'false') {
		total = await models.UserLog.countDocuments(filters);
	}

	data.forEach(doc => {
		try {
			if (!doc.user) {
				doc.user = {
					username: doc.username,
					name: SYS_USERS[doc.username] || doc.username,
				};
			}

			doc.data = JSON.parse(doc.data);
			if (doc.type === 'INBOX_READ') {
				doc.messageId = _.last(doc.action.split('/'));
			}
		} catch (e) {
			//
		}
	});

	return {
		data,
		total,
	};
}

async function getActivitiyStatistics(user, query) {
	let { view, blockId, type, from, to, username } = query;
	if (!StatisticActivitiesView[view]) throw new ThrowReturn('View type invalid');

	const unitOfTime = UNIT_OF_TIME[view];
	from = from || moment().startOf(unitOfTime.overview);
	to = to || moment().endOf(unitOfTime.overview);

	const afilters = await getAuthFilters({ username, user });

	const filters = _.pickBy({
		...afilters,
		type,
		blockId: blockId ? mongoose.Types.ObjectId(blockId) : null,
	});

	const ranges = getRanges(from, to, unitOfTime.detail);

	const logAmounts = await ranges.asyncMap(range => {
		const createdAt = {
			$gte: moment(range.value).startOf(unitOfTime.detail),
			$lte: moment(range.value).endOf(unitOfTime.detail),
		};
		return models.UserLog.countDocuments({ ...filters, createdAt });
	});

	const statistics = ranges.map((range, index) => ({
		label: range.label,
		total: logAmounts[index],
		datetime: range.value,
	}));

	return statistics;
}

async function getDetailedActivitiyStatistic(user, query) {
	let { view, blockId, type, datetime, username } = query;
	if (!StatisticActivitiesView[view]) throw new ThrowReturn('View type invalid');

	const unitOfTime = UNIT_OF_TIME[view].detail;
	const from = moment(datetime).startOf(unitOfTime).toDate();
	const to = moment(datetime).endOf(unitOfTime).toDate();

	const afilters = await getAuthFilters({ username, user });

	const filters = _.pickBy({
		...afilters,
		createdAt: { $gte: from, $lte: to },
		type,
		blockId: blockId ? mongoose.Types.ObjectId(blockId) : null,
	});

	const statistics = await models.UserLog.aggregate([
		{ $match: filters },
		{
			$group: { _id: '$type', total: { $sum: 1 } },
		},
		{
			$project: { _id: 0, total: 1, type: '$_id' },
		},
		{ $sort: { total: -1 } },
	]).allowDiskUse(true);

	return statistics;
}

async function getWorkLog(user, { start, limit, blockId, from, to, state }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;

	const query = { blockId };

	if (state) {
		query.state = state;
	}

	if (from) {
		_.set(query, 'time.$gte', new Date(from).minTimes());
	}
	if (to) {
		_.set(query, 'time.$lte', new Date(to).maxTimes());
	}

	const [data, total] = await Promise.all([
		models.WorkLog.find(_.pickBy(query))
			.populate([
				{
					path: 'userId',
					select: 'name username',
				},
			])
			.skip(start)
			.limit(limit)
			.sort({ createdAt: -1 })
			.lean(),
		models.WorkLog.countDocuments(_.pickBy(query)),
	]);
	return { data, total };
}

async function getWorkLogHistory({ from, to, blockId }, user) {
	const filter = {};

	if (blockId) {
		filter.blockId = mongoose.Types.ObjectId(blockId);
	}

	if (from) _.set(filter, 'time.$gte', new Date(from).minTimes());
	if (to) _.set(filter, 'time.$lte', new Date(to).maxTimes());

	const users = await models.User.find({ enable: true, groupIds: { $in: user.groupIds } }).select('name role');

	const userIds = users.map(item => {
		return item._id;
	});

	const workLogs = await models.WorkLog.aggregate([
		{ $match: { userId: { $in: userIds }, ...filter } },
		{ $sort: { time: 1 } },
		{
			$group: {
				_id: {
					userId: '$userId',
					date: { $dateToString: { format: '%d-%m-%Y', date: '$time', timezone: '+07:00' } },
				},
				minStart: { $first: '$time' },
				maxEnd: { $last: '$time' },
				startBlock: { $first: '$blockId' },
				endBlock: { $last: '$blockId' },
			},
		},
		{
			$group: {
				_id: '$_id.userId',
				dates: {
					$push: {
						date: '$_id.date',
						minStart: '$minStart',
						maxEnd: '$maxEnd',
						startBlock: '$startBlock',
						endBlock: '$endBlock',
					},
				},
			},
		},
	]);

	const blocks = await models.Block.find({ isProperty: true, active: true }).select('_id info.shortName').lean();
	const blockIdsMapper = _.keyBy(blocks, '_id');
	const userIdsMappper = _.keyBy(users, '_id');

	const results = workLogs.map(item => {
		const name = _.get(userIdsMappper, [item._id, 'name']);
		const newDates = item.dates.map(date => {
			const startBlock = blockIdsMapper[date.startBlock];
			const endBlock = blockIdsMapper[date.endBlock];
			return {
				...date,
				startBlock,
				endBlock,
			};
		});
		return { ...item, name, dates: newDates };
	});

	return { logs: results };
}

module.exports = {
	getUserActivities,
	getActivitiyStatistics,
	getDetailedActivitiyStatistic,
	getWorkLogHistory,
	getWorkLog,
};

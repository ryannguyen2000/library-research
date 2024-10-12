const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { ASSET_ISSUE_STATUS, ASSET_ISSUE_LOGS, LANGUAGE, ASSET_ISSUE_UNAVAILABLE_STATUS } = require('@utils/const');
const { getArray } = require('@utils/query');
const { removeAccents } = require('@utils/generate');
const { rangeMonth } = require('@utils/date');

const { ObjectId } = mongoose.Types;
const DAY = 1000 * 60 * 60 * 24;
const UNIT = {
	day: 'day',
	week: 'week',
	month: 'month',
};
const TO_MILLISECOND = {
	day: DAY,
	week: DAY * 7,
	month: DAY * 30,
};
const REMAIN_OUTPUT = {
	day: [10, 20, 30],
	week: [1, 2, 3],
	month: [1, 2, 3],
};
const $SWITCH_DATA = {
	day: {
		branches: [
			{ $lte: 10, result: 10 },
			{ $lte: 20, result: 20 },
		],
		defaultValue: 30,
	},
	week: {
		branches: [
			{ $lte: 1, result: 1 },
			{ $lte: 2, result: 2 },
		],
		defaultValue: 3,
	},
	month: {
		branches: [
			{ $lte: 1, result: 1 },
			{ $lte: 2, result: 2 },
		],
		defaultValue: 3,
	},
};

async function create(req, res) {
	const { blockId, assetHistoryIds, taskIds } = req.body;
	const { user } = req.decoded;

	const block = await models.Block.findById(blockId).select('_id').lean();
	if (!block) throw new ThrowReturn('Block does not exist');
	// const room = await models.Room.findById(roomId).select('_id').lean();
	// if (!room) throw new ThrowReturn('Room does not exist');
	// if (!_.get(assets, 'length', 0)) throw new ThrowReturn('Asset does not exist');

	const assetIssue = await models.AssetIssue.create({
		...req.body,
		createdBy: user._id,
		histories: [{ description: `Create issue`, action: ASSET_ISSUE_LOGS.CREATE, createdBy: user._id }],
	});

	if (assetHistoryIds && assetHistoryIds.length) {
		await assetHistoryIds.asyncMap(historyId =>
			models.AssetIssueHistory.add({ assetIssueId: assetIssue._id, historyId, userId: user._id })
		);
	}

	if (taskIds && taskIds.length) {
		await taskIds.asyncMap(taskId =>
			models.AssetIssueTask.add({ assetIssueId: assetIssue._id, taskId, userId: user._id })
		);
	}

	res.sendData(assetIssue);
}

async function list(req, res) {
	const {
		start,
		limit,
		assets,
		status,
		kind,
		includeDeleted,
		blockId,
		roomIds,
		name,
		excludeTaskIds,
		excludeHistoryIds,
		from,
		to,
		excludeBlockId,
		no,
		...query
	} = req.query;
	const { user } = req.decoded;
	const _start = parseInt(start) || 0;
	const _limit = parseInt(limit) || 10;
	const excludeAssetIssueIds = [];

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
		roomKey: 'roomId',
	});

	const filter = _.pickBy({
		$text: name ? { $search: removeAccents(name) } : null,
		assets: assets ? { $in: getArray(assets) } : null,
		kind: kind ? { $in: getArray(kind) } : null,
		no: parseInt(no) || null,
		...filters,
		...query,
	});

	if (roomIds) {
		_.set(filter, 'roomId.$in', getArray(roomIds));
	}
	if (from) {
		_.set(filter, ['time', '$gte'], from);
	}
	if (to) {
		_.set(filter, ['time', '$lte'], to);
	}
	if (excludeTaskIds) {
		const assetIssueTask = await models.AssetIssueTask.find({
			taskId: { $in: getArray(excludeTaskIds) },
			deleted: false,
		})
			.select('assetIssueId')
			.lean();
		excludeAssetIssueIds.push(...assetIssueTask.map(ait => ait.assetIssueId));
	}

	if (excludeHistoryIds) {
		const assetIssueHistorys = await models.AssetIssueHistory.find({
			historyId: { $in: getArray(excludeHistoryIds) },
			deleted: false,
		})
			.select('assetIssueId')
			.lean();
		excludeAssetIssueIds.push(...assetIssueHistorys.map(aih => aih.assetIssueId));
	}

	if (excludeAssetIssueIds.length) filter._id = { $nin: excludeAssetIssueIds };

	const ninStatus = includeDeleted === 'true' ? [] : ASSET_ISSUE_UNAVAILABLE_STATUS;
	_.set(filter, 'status.$nin', ninStatus);

	if (status) filter.status.$in = getArray(status);

	const [assetIssues, total] = await Promise.all([
		models.AssetIssue.find(filter)
			.sort(_.pickBy({ score: name ? { $meta: 'textScore' } : null, createdAt: -1 }))
			.select(
				_.pickBy({
					score: name ? { $meta: 'textScore' } : null,
					name: 1,
					source: 1,
					time: 1,
					priority: 1,
					reason: 1,
					no: 1,
					status: 1,
				})
			)
			.populate('blockId', 'info.name')
			.populate('roomId', 'info.name info.roomNo')
			.populate('createdBy', 'username name')
			.populate('reporter', 'username name')
			.populate('assets', 'label name')
			.populate('kind')
			.skip(_start)
			.limit(_limit)
			.lean(),
		models.AssetIssue.countDocuments(filter),
	]);

	res.sendData({ assetIssues, total });
}

async function getTasks(req, res) {
	const { id } = req.params;
	const start = parseInt(req.query.start) || 0;
	const limit = parseInt(req.query.limit) || 10;

	const [taskIds, total] = await Promise.all([
		models.AssetIssueTask.find({ assetIssueId: id, deleted: false })
			.skip(start)
			.limit(limit)
			.select('taskId')
			.sort({ createdAt: -1 })
			.lean(),
		models.AssetIssueTask.countDocuments({ assetIssueId: id, deleted: false }),
	]);

	const data = await models.Task.find({ _id: { $in: taskIds.map(i => i.taskId) } })
		.populate({
			path: 'category',
			select: 'name nameEn',
			transform: doc => {
				return req.language === LANGUAGE.EN ? { name: doc.nameEn } : doc;
			},
		})
		.populate('createdBy assigned', 'name username')
		.populate('bookingId', 'price from to otaName otaBookingId numberAdults numberChilden')
		.lean();

	res.sendData({ data, total });
}

async function getHistories(req, res) {
	const { id } = req.params;
	const start = parseInt(req.query.start) || 0;
	const limit = parseInt(req.query.limit) || 10;

	const [historyIds, total] = await Promise.all([
		models.AssetIssueHistory.find({ assetIssueId: id, deleted: false })
			.skip(start)
			.limit(limit)
			.sort({ createdAt: -1 })
			.select('historyId')
			.lean(),
		models.AssetIssueHistory.countDocuments({ assetIssueId: id, deleted: false }),
	]);

	const data = await models.History.find({ _id: { $in: historyIds.map(i => i.historyId) } })
		.populate('createdBy performedby', 'username name role departmentIds')
		.lean();

	res.sendData({ data, total });
}

async function view(req, res) {
	const { id } = req.params;
	const [assetIssue, assetIssueState] = await Promise.all([
		models.AssetIssue.findById(id)
			.populate('reporter', 'username name')
			.populate('blockId', 'info.name')
			.populate('roomId', 'info.name info.roomNo')
			.populate('createdBy', 'username name')
			.populate('assets', 'label name')
			.populate('kind')
			.populate('histories.createdBy', 'username name')
			.lean(),
		models.AssetIssue.isInUse(id),
	]);

	if (!assetIssue) throw new ThrowReturn().status(404);
	assetIssue.enableUpdateProperty = !assetIssueState.isInUse;

	res.sendData({ assetIssue });
}

async function modify(req, res) {
	const docs = _.omit(req.body, ['status']);

	// if (!_.get(docs, 'assets.length', 1)) throw new ThrowReturn('Assets is empty');
	const assetIssue = await models.AssetIssue.findOne({
		_id: req.params.id,
		status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
	});
	if (!assetIssue) throw new ThrowReturn().status(404);

	Object.assign(assetIssue, docs);

	const isModifiedProperty = ['blockId', 'roomId', 'assets'].some(key => assetIssue.isModified(key));

	if (isModifiedProperty) {
		const { isInUse, msg } = await models.AssetIssue.isInUse(assetIssue._id);
		if (isInUse) throw new ThrowReturn(msg);
	}

	await assetIssue.save();

	res.sendData({ asset_issue: _.pick(assetIssue, _.keys(docs)) });
}

async function del(req, res) {
	const { user } = req.decoded;
	const assetIssue = await models.AssetIssue.findById(req.params.id);
	if (!assetIssue) throw new ThrowReturn().status(404);

	const { isInUse, msg } = await models.AssetIssue.isInUse(assetIssue._id);
	if (isInUse) throw new ThrowReturn(msg);

	assetIssue.status = ASSET_ISSUE_STATUS.DELETED;
	assetIssue.histories.push({
		description: `${ASSET_ISSUE_LOGS.DELETE}: Issue`,
		action: ASSET_ISSUE_LOGS.DELETE,
		createdBy: user._id,
	});
	await assetIssue.save();
	res.sendData();
}

async function changeStatus(req, res) {
	const { status } = req.body;
	const { user } = req.decoded;
	const assetIssue = await models.AssetIssue.findOne({
		_id: req.params.id,
		status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
	});

	if (!assetIssue) throw new ThrowReturn().status(404);
	if (ASSET_ISSUE_UNAVAILABLE_STATUS.includes(status)) throw new ThrowReturn('Invalid status');

	assetIssue.histories.push({
		description: `Status updated: ${assetIssue.status} -> ${status}`,
		action: ASSET_ISSUE_LOGS.UPDATE_STATUS,
		createdBy: user._id,
	});
	assetIssue.status = status;
	await assetIssue.save();
	res.sendData();
}

async function merge(req, res) {
	const { id } = req.params;
	const { assetIssueIds } = req.body;
	const { user } = req.decoded;

	const assetIssue = await models.AssetIssue.findOne({
		_id: id,
		status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
	});

	if (!assetIssue) throw new ThrowReturn().status(404);

	const assetIssues = await models.AssetIssue.find(
		_.pickBy({
			_id: assetIssueIds,
			status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
			blockId: assetIssue.blockId,
			roomId: assetIssue.roomId,
			assets: assetIssue.assets && assetIssue.assets.length ? { $in: assetIssue.assets } : [],
		})
	)
		.select('_id no')
		.lean();

	if (assetIssueIds.length !== assetIssues.length) {
		const invalidId = _.difference(
			assetIssueIds,
			_.map(assetIssues, i => i._id.toString())
		);
		throw new ThrowReturn(`Asset issue ${invalidId} invalid`);
	}

	const taskIds = await models.AssetIssueTask.find({ assetIssueId: assetIssueIds, deleted: false })
		.select('taskId')
		.lean();
	const historyIds = await models.AssetIssueHistory.find({ assetIssueId: assetIssueIds, deleted: false })
		.select('historyId')
		.lean();

	const AITasks = [];
	const AIHistories = [];

	_.uniqBy(historyIds, i => i.historyId.toString()).forEach(history =>
		AIHistories.push({ assetIssueId: id, historyId: history.historyId })
	);
	_.uniqBy(taskIds, i => i.taskId.toString()).forEach(task =>
		AITasks.push({ assetIssueId: id, taskId: task.taskId })
	);

	assetIssue.histories.push({
		description: `Merge asset issues: ${assetIssueIds.join(',')}`,
		action: ASSET_ISSUE_LOGS.MERGE,
		createdBy: user._id,
	});

	const update = {
		status: ASSET_ISSUE_STATUS.MERGED,
		$push: {
			histories: [
				{
					description: `Merge to asset issue no ${assetIssues.no}`,
					action: ASSET_ISSUE_LOGS.MERGE,
					createdBy: user._id,
				},
			],
		},
	};

	await Promise.all([
		assetIssue.save(),
		models.AssetIssue.updateMany({ _id: assetIssueIds }, update),
		models.AssetIssueTask.insertMany(AITasks),
		models.AssetIssueHistory.insertMany(AIHistories),
	]);

	res.sendData();
}

// Statictis
async function getTypeStatictis(filter) {
	filter.status = { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS };

	return models.AssetIssue.aggregate()
		.match(filter)
		.project({ status: 1, kind: 1, time: 1 })
		.group({
			_id: '$kind',
			done: { $sum: { $cond: [{ $ne: ['$status', 'done'] }, 1, 0] } },
			notYet: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
			total: { $sum: 1 },
		})
		.lookup({
			from: 'asset_issue_type',
			let: { id: '$_id' },
			pipeline: [{ $match: { $expr: { $eq: ['$$id', '$_id'] } } }],
			as: 'kind',
		})
		.project({
			done: 1,
			notYet: 1,
			total: 1,
			name: { $arrayElemAt: ['$kind.name', 0] },
		});
}

function getRemainOperation(unit = 'month') {
	if (!_.values(UNIT).includes(unit)) return '$remain';

	const { branches, defaultValue } = $SWITCH_DATA[unit];
	return {
		$switch: {
			branches: branches.map(_case => ({
				case: { $lte: ['$remain', _case.$lte] },
				then: _case.result,
			})),
			default: defaultValue,
		},
	};
}

async function getRemainStatictis(filter, unit = 'month') {
	if (!_.keys(UNIT).includes(unit)) throw new ThrowReturn('Unit invalid');
	const present = new Date();
	const millisecond = TO_MILLISECOND[unit];
	filter.status = { $nin: [ASSET_ISSUE_STATUS.MERGED, ASSET_ISSUE_STATUS.DELETED, ASSET_ISSUE_STATUS.DONE] };

	const rs = await models.AssetIssue.aggregate()
		.match(filter)
		.project({
			status: 1,
			kind: 1,
			time: 1,
			remain: { $floor: { $divide: [{ $subtract: [present, '$time'] }, millisecond] } },
		})
		.lookup({
			from: 'asset_issue_type',
			let: { kind: '$kind' },
			pipeline: [{ $match: { $expr: { $eq: ['$$kind', '$_id'] } } }],
			as: 'kind',
		})
		.addFields({ remain: getRemainOperation(unit) })
		.group({
			_id: {
				_id: '$remain',
				kind: { $arrayElemAt: ['$kind._id', 0] },
				name: { $arrayElemAt: ['$kind.name', 0] },
			},
			count: { $sum: 1 },
		})
		.group({
			_id: '$_id._id',
			kinds: {
				$push: {
					id: '$_id.kind',
					name: '$_id.name',
					total: '$count',
				},
			},
			total: { $sum: '$count' },
		})
		.addFields({ remain: { value: '$_id', unit } })
		.sort({ _id: 0 });

	_.difference(
		REMAIN_OUTPUT[unit],
		rs.map(i => i.remain.value)
	).forEach(i =>
		rs.push({
			_id: i,
			kinds: [],
			total: 0,
			remain: {
				value: i,
				unit: 'month',
			},
		})
	);

	return _.sortBy(rs, i => i._id);
}

async function getTimeStatictis({ filter, from, to }) {
	filter.status = { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS };
	if (!from || !to) {
		from = moment().startOf('year').toDate();
		to = moment().endOf('year').toDate();
		filter.time = { $gte: from, $lte: to };
	}

	const rs = await models.AssetIssue.aggregate()
		.match(filter)
		.project({
			status: 1,
			kind: 1,
			time: 1,
			date: { $dateToString: { format: '%m-%Y', date: '$time' } },
			isDone: { $cond: { if: { $eq: ['$status', 'done'] }, then: true, else: false } },
		})
		.lookup({
			from: 'asset_issue_type',
			let: { kind: '$kind' },
			pipeline: [{ $match: { $expr: { $eq: ['$$kind', '$_id'] } } }],
			as: 'kind',
		})
		.group({
			_id: {
				_id: '$date',
				kind: { $arrayElemAt: ['$kind._id', 0] },
				name: { $arrayElemAt: ['$kind.name', 0] },
				isDone: '$isDone',
			},
			count: { $sum: 1 },
		})
		.group({
			_id: { date: '$_id._id', isDone: '$_id.isDone' },
			kinds: {
				$push: { id: '$_id.kind', name: '$_id.name', total: '$count' },
			},
			total: { $sum: '$count' },
		})
		.group({
			_id: '$_id.date',
			done: {
				$push: { $cond: [{ $eq: ['$_id.isDone', true] }, { kinds: '$kinds', total: '$total' }, '$$REMOVE'] },
			},
			notYet: {
				$push: { $cond: [{ $eq: ['$_id.isDone', false] }, { kinds: '$kinds', total: '$total' }, '$$REMOVE'] },
			},
		})
		.sort({ _id: 1 });

	const ranges = rangeMonth(from, to);
	const missingWeeks = _.difference(
		ranges,
		rs.map(i => i._id)
	);
	rs.push(...missingWeeks.map(i => ({ _id: i, done: [], notYet: [] })));

	return _.sortBy(rs, item => item._id);
}

async function statictis(req, res) {
	const { blockId, roomId, assetIds, kind, priority, from, to, unit, type, excludeBlockId } = req.query;
	const { user } = req.decoded;

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
		roomKey: 'roomId',
	});

	const filter = {
		...filters,
	};

	if (from) _.set(filter, 'time.$gte', new Date(from));
	if (to) _.set(filter, 'time.$lte', new Date(to));
	if (roomId) {
		_.set(filter, 'roomId.$eq', ObjectId(roomId));
	}

	if (assetIds) filter.assets = { $in: getArray(assetIds).toMongoObjectIds() };
	if (kind) filter.kind = { $in: getArray(kind).toMongoObjectIds() };
	if (priority) filter.priority = { $in: getArray(priority).map(i => parseInt(i)) };
	let rs;

	const kinds = await models.AssetIssueType.find().select('color').lean();
	const kindColors = kinds.reduce((colors, _kind) => {
		colors[_kind._id] = _kind.color;
		return colors;
	}, {});

	switch (type) {
		case 'kind': {
			rs = await getTypeStatictis(filter);
			break;
		}
		case 'remain': {
			rs = await getRemainStatictis(filter, unit);
			break;
		}
		case 'time': {
			rs = await getTimeStatictis({ filter, from, to });
			break;
		}
		default: {
			rs = [];
		}
	}
	res.sendData({ statictis: rs, kindColors });
}

module.exports = {
	create,
	list,
	view,
	modify,
	del,
	changeStatus,
	getTasks,
	getHistories,
	merge,
	statictis,
};

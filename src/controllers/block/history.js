const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { HISTORY_TYPE } = require('@utils/const');
const models = require('@models');

async function getHistories(user, { start, limit, blockId, from, to, roomIds }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;
	blockId = blockId === 'undefined' ? null : blockId;

	const { filters } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockId });
	const query = {
		roomIds: roomIds ? { $all: roomIds.split(',') } : null,
		type: HISTORY_TYPE.BLOCK,
		...filters,
	};
	if (from && moment(from).isValid()) {
		_.set(query, 'createdAt.$gte', moment(from).startOf('date').toDate());
	}
	if (to && moment(to).isValid()) {
		_.set(query, 'createdAt.$lte', moment(to).endOf('date').toDate());
	}

	const [data, total] = await Promise.all([
		models.History.find(_.pickBy(query))
			.populate([
				{ path: 'createdBy deletedBy', select: 'username name' },
				{
					path: 'blockId',
					select: 'info.name',
				},
			])
			.skip(start)
			.limit(limit)
			.sort({ createdAt: -1 })
			.lean(),
		models.History.countDocuments(query),
	]);

	return { data, total };
}

async function createHistory(user, body) {
	const history = await models.History.create({ ...body, createdBy: user._id });
	return { history };
}

async function updateHistory(historyId, body) {
	const history = await models.History.findById(historyId);
	if (!history) throw new ThrowReturn('History not found', historyId);
	_.assign(history, body);
	await history.save();

	return { history };
}

async function deleteHistory(historyId, user) {
	const history = await models.History.findOneAndUpdate(
		{ _id: historyId },
		{
			deleted: true,
			deletedBy: user._id,
		}
	);
	if (!history) throw new ThrowReturn('History not found', historyId);
	return { history };
}

module.exports = {
	getHistories,
	updateHistory,
	deleteHistory,
	createHistory,
};

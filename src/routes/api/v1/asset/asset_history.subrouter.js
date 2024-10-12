const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');

const ThrowReturn = require('@core/throwreturn');
const { HISTORY_TYPE } = require('@utils/const');
const { logger } = require('@utils/logger');
const fetch = require('@utils/fetch');
const { getLocalUri } = require('@utils/file');
const models = require('@models');

async function getHistoryDates(req, res) {
	const { blockId, roomId } = req.query;

	const filter = {
		blockId: mongoose.Types.ObjectId(blockId),
		type: HISTORY_TYPE.ASSET_REPORT,
	};
	if (roomId !== undefined) {
		filter.roomIds = roomId ? mongoose.Types.ObjectId(roomId) : [];
	}

	const dates = await models.History.aggregate()
		.match(filter)
		.group({
			_id: null,
			dates: {
				$addToSet: {
					$dateToString: {
						date: '$ownerTime',
						format: '%Y-%m-%d',
					},
				},
			},
		});

	res.sendData({ dates: (_.get(dates, [0, 'dates']) || []).sort().reverse() });
}

async function getHistories(req, res) {
	const { blockId, roomId, assetId, date, from, to, image, start, limit, skipPanigation } = req.query;

	const filter = {
		blockId,
		type: HISTORY_TYPE.ASSET_REPORT,
	};
	if (roomId !== undefined) {
		filter.roomIds = roomId || { $eq: [] };
	}
	if (assetId) {
		filter.assetIds = mongoose.Types.ObjectId(assetId);
	}
	if (date) {
		filter.ownerTime = { $gte: moment(date).startOf('date').toDate(), $lte: moment(date).endOf('date').toDate() };
	} else {
		if (from) _.set(filter, ['ownerTime', '$gte'], moment(from).startOf('date').toDate());
		if (to) _.set(filter, ['ownerTime', '$lte'], moment(to).endOf('date').toDate());
	}
	if (image === 'true') {
		filter.images = { $ne: [] };
	}

	const pipe = models.History.find(filter).sort({ createdAt: -1 });

	if (skipPanigation !== 'true') {
		if (start) {
			pipe.skip(parseInt(start) || 0);
		}
		if (limit) {
			pipe.limit(parseInt(limit) || 20);
		}
	}

	const [histories, total] = await Promise.all([
		pipe.populate('createdBy performedby', 'username name role departmentIds').lean(),
		models.History.countDocuments(filter),
	]);

	res.sendData({ histories, total });
}

async function assignAssetToHistory(req, res) {
	const { assetId, historyId } = req.params;

	const history = await models.History.findOneAndUpdate({ _id: historyId }, { $addToSet: { assetIds: assetId } });
	if (history && history.blockId) {
		_.set(req, ['logData', 'blockId'], history.blockId);
	}

	res.sendData();
}

async function removeAssetFromHistory(req, res) {
	const { assetId, historyId } = req.params;

	const history = await models.History.findOneAndUpdate({ _id: historyId }, { $pull: { assetIds: assetId } });
	if (history && history.blockId) {
		_.set(req, ['logData', 'blockId'], history.blockId);
	}

	res.sendData();
}

async function deleteHistory(req, res) {
	const { historyId } = req.params;

	const history = await models.History.findOneAndDelete({ _id: historyId, type: HISTORY_TYPE.ASSET_REPORT });
	if (!history) throw new ThrowReturn('Không tìm thấy lịch sử!');

	res.sendData();
}

async function updateHistory(req, res) {
	const { historyId } = req.params;
	const data = req.body;

	const history = await models.History.findOneAndUpdate({ _id: historyId, type: HISTORY_TYPE.ASSET_REPORT }, data);
	if (!history) throw new ThrowReturn('Không tìm thấy lịch sử!');

	res.sendData(history);
}

async function dowloadHistories(req, res) {
	const { blockId, roomId, assetId, date, from, to } = req.query;
	const { room } = req.data;

	const filter = {
		blockId,
		type: HISTORY_TYPE.ASSET_REPORT,
		images: { $ne: [] },
	};
	if (roomId !== undefined) {
		filter.roomIds = roomId || { $eq: [] };
	}
	if (assetId) {
		filter.assetIds = mongoose.Types.ObjectId(assetId);
	}
	if (date) {
		filter.ownerTime = { $gte: moment(date).startOf('date').toDate(), $lte: moment(date).endOf('date').toDate() };
	} else {
		if (from) _.set(filter, ['ownerTime', '$gte'], moment(from).startOf('date').toDate());
		if (to) _.set(filter, ['ownerTime', '$lte'], moment(to).endOf('date').toDate());
	}

	const histories = await models.History.find(filter).sort({ createdAt: -1 }).select('images').lean();
	const images = _.flatten(_.map(histories, 'images'));

	if (!images.length) {
		throw new ThrowReturn('Dữ liệu không tồn tại!');
	}

	const archive = archiver('zip', { zlib: { level: 9 } });
	archive.on('error', err => {
		logger.error(err);
		res.end();
	});
	archive.on('finish', () => {
		res.end();
	});

	await images.asyncMap(async url => {
		const localUri = getLocalUri(url);
		if (localUri) {
			const stream = fs.createReadStream(localUri);
			stream.on('error', err => logger.error(err));
			archive.append(stream, { name: path.basename(localUri) });
		} else {
			const data = await fetch(url)
				.then(response => response.body)
				.catch(err => {
					logger.error(err);
				});

			if (data) {
				archive.append(data, { name: path.basename(url) });
			}
		}
	});

	res.setHeader('Content-Disposition', `attachment; filename=${_.get(room, 'info.roomNo', roomId)}_${date}.zip`);
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Accept-Ranges', 'bytes');

	archive.pipe(res);
	archive.finalize();
}

async function getAssetIssues(req, res) {
	const { historyId } = req.params;
	const assetIssues = await models.AssetIssue.getAssetIssueByHistory(historyId);
	res.sendData({ assetIssues });
}

async function addAssetIssues(req, res) {
	const { historyId } = req.params;
	const { user } = req.decoded;
	const { assetIssueIds } = req.body;
	if (!_.get(assetIssueIds, 'length', 0)) res.sendData({ assetIssueIds });

	const history = await models.History.findById(historyId).select('roomIds blockId').lean();
	if (!history) throw new ThrowReturn('History does not exist');

	const { isErr, msg } = await models.AssetIssue.validate(assetIssueIds, {
		blockId: history.blockId,
		roomIds: history.roomIds,
	});
	if (isErr) throw new ThrowReturn(msg);

	await assetIssueIds.asyncMap(assetIssueId =>
		models.AssetIssue.addHistory({ assetIssueId, history, userId: user._id, isValidate: false })
	);

	res.sendData({ assetIssueIds });
}

async function removeAssetIssues(req, res) {
	const { historyId } = req.params;
	const { user } = req.decoded;
	const { assetIssueIds } = req.body;
	if (!_.get(assetIssueIds, 'length', 0)) res.sendData({ assetIssueIds });

	const history = await models.History.findById(historyId).select('roomIds blockId').lean();
	if (!history) throw new ThrowReturn('History does not exist');

	const { isErr, msg } = await models.AssetIssue.validate(assetIssueIds, {
		blockId: history.blockId,
		roomIds: history.roomIds,
	});
	if (isErr) throw new ThrowReturn(msg);

	await assetIssueIds.asyncMap(assetIssueId =>
		models.AssetIssue.removeHistory({ assetIssueId, history, userId: user._id, isValidate: false })
	);

	res.sendData({ assetIssueIds });
}

module.exports = {
	getHistoryDates,
	getHistories,
	assignAssetToHistory,
	removeAssetFromHistory,
	deleteHistory,
	updateHistory,
	dowloadHistories,
	getAssetIssues,
	addAssetIssues,
	removeAssetIssues,
};

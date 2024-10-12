const _ = require('lodash');
const moment = require('moment');

const { URL_CONFIG } = require('@config/setting');
const { logger } = require('@utils/logger');
const fetch = require('@utils/fetch');
const { HISTORY_TYPE } = require('@utils/const');
const models = require('@models');

async function sendAssetsToFamiroom(filteredHistories, block, room) {
	const groups = _.groupBy(filteredHistories, h => moment(h.time).format('DD-MM-Y'));

	const body = [
		{
			folder: 'Nhật kí tài sản',
			children: [
				{
					folder: block.info.name,
					children: [
						{
							folder: _.get(room, 'info.roomNo') || 'Không gian chung',
							children: _.entries(groups).map(([date, items]) => {
								return {
									folder: date,
									files: _.chain(items).map('attachments').flatten().compact().value(),
								};
							}),
						},
					],
				},
			],
		},
	];

	return fetch(`${URL_CONFIG.FAMIROOM}/hook/resource`, {
		method: 'POST',
		body: JSON.stringify(body),
		headers: {
			'content-type': 'application/json',
		},
	})
		.then(res => res.json())
		.catch(e => {
			logger.error(e);
		});
}

async function addAssetHistories(
	{ histories, ottName, ottAccount, assetIds, block, room },
	user,
	checkDuplicated = true
) {
	if (checkDuplicated) {
		const filter = {
			type: HISTORY_TYPE.ASSET_REPORT,
			blockId: block._id,
			ottAccount,
			ottName,
			ottMessageId: { $in: _.map(histories, 'messageId') },
		};
		if (room) {
			filter.roomIds = room._id;
		}

		const existsHistories = await models.History.find(filter)
			.select('ottMessageId')
			.lean()
			.then(rs => _.keyBy(rs, 'ottMessageId'));

		histories = _.filter(histories, h => !existsHistories[h.messageId]);
	}

	if (!histories.length) {
		return;
	}

	sendAssetsToFamiroom(histories, block, room);

	const ottIds = _.uniq(_.map(histories, 'userId'));
	const users = await models.User.find({
		'otts.ottName': ottName,
		'otts.ottId': { $in: ottIds },
	}).select('_id otts');

	const usersObj = _.keyBy(users, u =>
		_.get(
			u.otts.find(uOtt => ottIds.includes(uOtt.ottId)),
			'ottId'
		)
	);

	return await models.History.insertMany(
		histories.map(history => ({
			blockId: block._id,
			roomIds: room ? [room._id] : [],
			description: history.message,
			createdBy: user && user._id,
			images: history.attachments,
			ownerTime: new Date(history.time),
			ottName,
			ottMessageId: history.messageId,
			performedby: _.get(usersObj, [history.userId, '_id']),
			type: HISTORY_TYPE.ASSET_REPORT,
			assetIds,
		}))
	);
}

module.exports = {
	addAssetHistories,
};

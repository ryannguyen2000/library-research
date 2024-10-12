const { ONE_MINUTE, MessageGroupInternalType } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
// const ZaloOtt = require('@ott/zalo');
const { addAssetHistories } = require('../asset_history');

const DELAY = ONE_MINUTE * 5;
const PRIORITY = 1;

function validateKeywords({ thread }) {
	return {
		isValid: !!thread && thread.internalGroupType === MessageGroupInternalType.ASSET_REPORT,
	};
}

async function runJob({ blockId, roomIds, msgDoc, ottName, ottAccount, time, ottId, msgInfo, user }) {
	if (blockId && msgDoc.message) {
		await models.TaskAutoMessage.create({
			blockId,
			roomIds,
			ottName,
			ottId,
			ottPhone: ottAccount,
			messageId: msgDoc.messageId,
			messageTime: time,
		});
		return true;
	}

	const timeValue = time.valueOf();
	const filter = {
		ottName,
		ottId,
		ottPhone: ottAccount,
		blockId: { $ne: null },
		messageTime: { $gte: new Date(timeValue - DELAY), $lt: time },
	};

	const msg = await models.TaskAutoMessage.findOne(filter).sort({ createdAt: -1 });
	if (!msg) return;

	const block = await models.Block.findById(msg.blockId).select('info.name');
	const room = msg.roomIds && msg.roomIds[0] && (await models.Room.findById(msg.roomIds[0]).select('info.roomNo'));

	const histories = [
		{
			time,
			messageId: msgDoc.messageId,
			userId: ottId,
			attachments: msgDoc.image_attachment_url,
			message: msgDoc.message,
		},
	];

	const result = await addAssetHistories(
		{
			histories,
			ottName,
			ottAccount,
			block,
			room,
		},
		null,
		false
	);

	addLogActivity({
		user,
		blockId,
		roomIds,
		result,
	});

	return true;
}

async function addLogActivity({ user, blockId, roomIds, result }) {
	const data = {
		username: user && user.username,
		method: 'ZALO',
		data: result && JSON.stringify(result),
		type: 'ASSET_HISTORY_MSG_NOTIFICATION',
		blockId,
		roomId: roomIds && roomIds[0],
	};

	await models.UserLog.create(data).catch(e => {
		logger.error('addLogActivity', data, e);
	});
}

module.exports = {
	validateKeywords,
	runJob,
	PRIORITY,
};

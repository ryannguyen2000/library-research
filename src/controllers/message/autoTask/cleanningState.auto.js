const { logger } = require('@utils/logger');
const { CLEANING_STATE } = require('@utils/const');
const models = require('@models');

const CLEANING_VC_KEYWORD = ['vc', 'phòng sạch', 'phong sach', 'lưu sạch', 'luu sach', 'sạch', 'sach'];
const CLEANING_VD_KEYWORD = ['vd', 'phòng dơ', 'phong do', 'dơ', 'do'];
const PRIORITY = 4;

function validateKeywords({ message }) {
	const isCleaningStateVC = CLEANING_VC_KEYWORD.some(key => message.endsWith(key));
	const isCleaningStateVD = CLEANING_VD_KEYWORD.some(key => message.endsWith(key));

	return {
		isValid: isCleaningStateVC || isCleaningStateVD,
		keywords: isCleaningStateVC ? CLEANING_VC_KEYWORD : isCleaningStateVD ? CLEANING_VD_KEYWORD : [],
		validateData: {
			state: isCleaningStateVC ? CLEANING_STATE.VC : CLEANING_STATE.VD,
		},
	};
}

async function runJob({ validateData, blockId, roomIds, user, time }) {
	if (!blockId || !user) return;

	await models.BlockNotes.updateCleaningState({
		blockId,
		roomIds,
		date: time,
		user,
		state: validateData.state,
	});

	addLogActivity({
		user,
		blockId,
		roomIds,
		state: validateData.state,
		time,
	});

	return true;
}

async function addLogActivity({ user, blockId, roomIds, state, time }) {
	const type = 'CALENDAR_UPDATE_CLEANING_STATE_MSG';

	const data = {
		username: user.username,
		method: 'ZALO',
		data: JSON.stringify({
			state,
			time,
		}),
		type,
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

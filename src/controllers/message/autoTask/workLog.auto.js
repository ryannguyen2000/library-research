const moment = require('moment');
const _ = require('lodash');
const models = require('@models');

const START_KEYWORD = ['bdn', 'bđn'];
const END_KEYWORD = ['ktn'];
const PRIORITY = 1;

async function validateKeywords({ removedAllMentionsMsg, msgDoc, user, time }) {
	const isStart = START_KEYWORD.some(key => removedAllMentionsMsg.startsWith(key));
	const isEnd = END_KEYWORD.some(key => removedAllMentionsMsg.startsWith(key));

	let prevLog;

	if (!isStart && !isEnd && msgDoc.image_attachment_url && msgDoc.image_attachment_url.length) {
		prevLog = await models.WorkLog.findOne({
			userId: user._id,
			time: { $gte: moment(time).subtract(5, 'minute').toDate() },
		}).sort({ time: -1 });
	}

	return {
		isValid: isStart || isEnd || !!prevLog,
		validateData: {
			isStart,
			isEnd,
			prevLog,
		},
	};
}

async function runJob({ validateData, user, time, msgDoc, ottName, ottId, ottAccount, blockId }) {
	if (!user) return;

	const { isStart, prevLog } = validateData;

	if (prevLog) {
		await models.WorkLog.updateOne(
			{ _id: prevLog._id },
			{
				$addToSet: {
					attachments: { $each: msgDoc.image_attachment_url },
				},
			}
		);
	} else {
		await models.WorkLog.updateOne(
			{ userId: user._id, time },
			{
				state: isStart ? 'start' : 'end',
				description: _.toString(msgDoc.message),
				ottName,
				ottId,
				ottPhone: ottAccount,
				msgId: msgDoc.messageId,
				blockId,
			},
			{
				upsert: true,
			}
		);
	}

	return true;
}

module.exports = {
	validateKeywords,
	runJob,
	PRIORITY,
};

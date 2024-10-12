const _ = require('lodash');

const { logger } = require('@utils/logger');
const { MessageSentType } = require('@utils/const');
const { eventEmitter, EVENTS } = require('@utils/events');
const models = require('@models');

const AWNSER_KEYWORDS = [
	{ keyword: '1', value: true },
	{ keyword: '2', value: false },
];
const PRIORITY = 2;

function validateKeywords({ message, removedAllMentionsMsg }) {
	const msg = removedAllMentionsMsg || message;
	const awnser = AWNSER_KEYWORDS.find(aws => msg === aws.keyword);

	return {
		isValid: !!awnser,
		validateData: awnser,
	};
}

async function runJob({ validateData, ottName, ottId, user, msgDoc, time }) {
	if (!user) return;

	const userOtt = user.otts.find(o => o.ottName === ottName && o.ottId === ottId);

	const filter = {
		ottName,
		sender: userOtt.ottPhone,
		// messageType: { $in: _.values(MessageSentType) },
	};
	const quoteMsgId = _.toString(_.get(msgDoc, 'quote.globalMsgId'));
	if (quoteMsgId) {
		filter.messageId = quoteMsgId;
	} else {
		filter.toId = ottId;
		filter.time = { $lt: time };
	}

	const qMsg = await models.OTTMessage.findOne(filter).sort({ time: -1 }).lean();
	if (!qMsg || !_.values(MessageSentType).includes(qMsg.messageType)) return;

	const data = {
		...qMsg,
		user,
		userOtt,
		confirmed: validateData.value,
		toId: msgDoc.toUid,
		fromId: msgDoc.userId,
	};

	eventEmitter.emit(EVENTS.RECEIVED_PAYOUT_CONFIRMATION, data);

	addLogActivity({
		user,
		payoutId: qMsg.payoutId,
		messageType: qMsg.messageType,
	});

	return true;
}

async function addLogActivity({ user, payoutId, messageType }) {
	try {
		const type = _.toUpper(`${messageType}_MSG`);

		const payout = await models.Payout.findById(payoutId)
			.select('bookingId blockIds roomIds')
			.populate('bookingId', 'blockId reservateRooms');

		const data = {
			username: user.username,
			method: 'ZALO',
			data: JSON.stringify({
				payoutId,
				messageType,
			}),
			type,
			blockId: _.get(payout, 'bookingId.blockId') || _.get(payout, 'blockIds[0]'),
			roomId: _.get(payout, 'bookingId.reservateRooms[0]') || _.get(payout, 'roomIds[0]'),
		};

		await models.UserLog.create(data).catch(e => {
			logger.error('addLogActivity', data, e);
		});
	} catch (e) {
		logger.error('payment auto addLogActivity', e);
	}
}

module.exports = {
	validateKeywords,
	runJob,
	PRIORITY,
};

const _ = require('lodash');
const { OTT_CONFIG, URL_CONFIG } = require('@config/setting');
const { logger } = require('@utils/logger');
const { MessageUser } = require('@utils/const');
const { Message, User } = require('./database');

const OTT_NAME = 'whatsapp';

async function getStats({ from, to, fromMe, ottPhones }) {
	const query = {};

	if (from) {
		_.set(query, ['data.messagetimestamp', '$gte'], _.round(from.valueOf() / 1000));
	}
	if (to) {
		_.set(query, ['data.messagetimestamp', '$lte'], _.round(to.valueOf() / 1000));
	}
	if (_.isBoolean(fromMe)) {
		_.set(query, ['data.key.fromme'], fromMe);
	}
	if (ottPhones) {
		_.set(query, 'account.$in', ottPhones);
	}

	return Message()
		.aggregate([
			{
				$match: query,
			},
			{
				$group: {
					_id: '$dateString',
					totalMessage: { $sum: 1 },
					user: { $addToSet: '$jid' },
				},
			},
			{
				$project: {
					_id: 0,
					date: '$_id',
					totalMessage: 1,
					totalUser: { $size: '$user' },
				},
			},
			{
				$addFields: {
					avgMessage: {
						$divide: ['$totalMessage', '$totalUser'],
					},
				},
			},
			{
				$sort: {
					date: 1,
				},
			},
		])
		.toArray();
}

const STUBTYPE = {
	UNKNOWN: 0,
	REVOKE: 1,
	CIPHERTEXT: 2,
	FUTUREPROOF: 3,
	NON_VERIFIED_TRANSITION: 4,
	UNVERIFIED_TRANSITION: 5,
	VERIFIED_TRANSITION: 6,
	VERIFIED_LOW_UNKNOWN: 7,
	VERIFIED_HIGH: 8,
	VERIFIED_INITIAL_UNKNOWN: 9,
	VERIFIED_INITIAL_LOW: 10,
	VERIFIED_INITIAL_HIGH: 11,
	VERIFIED_TRANSITION_ANY_TO_NONE: 12,
	VERIFIED_TRANSITION_ANY_TO_HIGH: 13,
	VERIFIED_TRANSITION_HIGH_TO_LOW: 14,
	VERIFIED_TRANSITION_HIGH_TO_UNKNOWN: 15,
	VERIFIED_TRANSITION_UNKNOWN_TO_LOW: 16,
	VERIFIED_TRANSITION_LOW_TO_UNKNOWN: 17,
	VERIFIED_TRANSITION_NONE_TO_LOW: 18,
	VERIFIED_TRANSITION_NONE_TO_UNKNOWN: 19,
	GROUP_CREATE: 20,
	GROUP_CHANGE_SUBJECT: 21,
	GROUP_CHANGE_ICON: 22,
	GROUP_CHANGE_INVITE_LINK: 23,
	GROUP_CHANGE_DESCRIPTION: 24,
	GROUP_CHANGE_RESTRICT: 25,
	GROUP_CHANGE_ANNOUNCE: 26,
	GROUP_PARTICIPANT_ADD: 27,
	GROUP_PARTICIPANT_REMOVE: 28,
	GROUP_PARTICIPANT_PROMOTE: 29,
	GROUP_PARTICIPANT_DEMOTE: 30,
	GROUP_PARTICIPANT_INVITE: 31,
	GROUP_PARTICIPANT_LEAVE: 32,
	GROUP_PARTICIPANT_CHANGE_NUMBER: 33,
	BROADCAST_CREATE: 34,
	BROADCAST_ADD: 35,
	BROADCAST_REMOVE: 36,
	GENERIC_NOTIFICATION: 37,
	E2E_IDENTITY_CHANGED: 38,
	E2E_ENCRYPTED: 39,
	CALL_MISSED_VOICE: 40,
	CALL_MISSED_VIDEO: 41,
	INDIVIDUAL_CHANGE_NUMBER: 42,
	GROUP_DELETE: 43,
};

function parseMessagesTubType(messageStubType) {
	switch (messageStubType) {
		case STUBTYPE.CALL_MISSED_VIDEO: {
			return '[ Missed video call ]';
		}
		case STUBTYPE.CALL_MISSED_VOICE: {
			return '[ Missed voice call ]';
		}
		case STUBTYPE.REVOKE: {
			return '[ This message was deleted ]';
		}
		case STUBTYPE.E2E_ENCRYPTED: {
			return '';
		}

		default: {
			logger.warn(`Not parse for type ${messageStubType}`);
			return '';
		}
	}
}

function parseMessage({ data: message, url: mediaUrl, phone }) {
	const messageTimestamp = _.get(message, 'messageTimestamp') || _.get(message, 'messagetimestamp');
	const status = _.get(message, 'status');

	const messageId = _.get(message, 'key.id') || _.get(message, 'key.ID');
	const oFromMe = _.get(message, 'key.fromMe');
	const fromMe = oFromMe !== undefined ? oFromMe : _.get(message, 'key.fromme');
	const imageMessage = _.get(message, 'message.imageMessage') || _.get(message, 'message.imagemessage');

	const time = new Date(messageTimestamp * 1000).toJSON();
	const user = fromMe ? undefined : MessageUser.GUEST;

	let conversation =
		_.get(message, 'message.conversation') ||
		_.get(imageMessage, 'caption') ||
		_.get(message, 'message.extendedTextMessage.text') ||
		_.get(message, 'message.extendedtextmessage.text') ||
		'';

	const messageStubType = _.get(message, 'messageStubType') || _.get(message, 'messagestubtype');

	if (messageStubType) {
		conversation += parseMessagesTubType(messageStubType);
	}

	const messageResponse = {
		image_attachment_url: mediaUrl ? [`${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${OTT_NAME}/${mediaUrl}`] : [],
		image: imageMessage,
		message: conversation,
		messageId,
		time,
		user,
		status,
		fromMe,
		phoneNumber: fromMe ? undefined : phone,
		ottId: _.get(message, 'key.remotejid') || _.get(message, 'key.remoteJID'),
	};

	// if (imageMessage) {
	// 	messageResponse.image = imageMessage;
	// }
	// else if (conversation) {
	// 	//
	// } else {
	// 	const msg = _.get(message, 'message', {});
	// 	messageResponse.raw = msg;
	// }

	return messageResponse;
}

async function getMessage({ messageId, parsed = true }) {
	const msg = await Message().findOne({ mid: messageId });

	if (parsed && msg) {
		return parseMessage(msg);
	}

	return msg;
}

async function findUserByPhone({ phone, account }) {
	const normPhone = phone.replace(/^\+/, '');

	const filter = { phone: { $in: [normPhone, `+${normPhone}`] }, jid: { $ne: null } };
	if (account) {
		filter.account = _.isArray(account) ? { $in: account } : account;
	}

	const user = await User().findOne(filter);
	if (!user) return null;

	return {
		ottId: user.jid,
	};
}

module.exports = {
	getStats,
	parseMessage,
	getMessage,
	findUserByPhone,
};

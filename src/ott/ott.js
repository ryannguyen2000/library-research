const _ = require('lodash');
const moment = require('moment');

const { OTT_CONFIG, URL_CONFIG } = require('@config/setting');
const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { normPhone } = require('@utils/phone');
const { InboxType, OTAs, MessageUser, USER_CONTACT_TYPE } = require('@utils/const');
const { MessageLock } = require('@utils/lock');
const { compressImage } = require('@utils/compress');
const { checkFolder } = require('@utils/file');
const models = require('@models');
const inbox = require('@controllers/inbox');

const OTTs = {
	[OTAs.Zalo]: require('./zalo'),
};
if (process.env.NODE_ENV === 'production') {
	Object.assign(OTTs, {
		[OTAs.WhatsApp]: require('./whatsapp'),
		[OTAs.Zalo]: require('./zalo'),
		[OTAs.Facebook]: require('./facebook'),
		[OTAs.SMS]: require('./sms'),
		[OTAs.Telegram]: require('./telegram'),
		[OTAs.ZaloOA]: require('./zalo_oa'),
		[OTAs.Line]: require('./line'),
	});
}

function getGuestInfo(data, ottName, msg) {
	return _.pickBy({
		name:
			_.get(msg.data, 'user.info.zaloName') ||
			_.get(msg.data, 'info.displayName') ||
			_.get(msg.data, 'info.name') ||
			_.get(data, 'info.displayName') ||
			_.get(data, 'info.name') ||
			data.phoneNumber,
		ota: ottName,
		otaId: _.get(msg.data, 'info.psid') || data.phoneNumber || data.ottId,
		avatar:
			_.get(msg.data, 'user.info.avatar') ||
			_.get(msg.data, 'info.avatar') ||
			_.get(data, 'info.avatar') ||
			_.get(msg, 'data.info.pictureUrl'),
		phone: data.phoneNumber && data.phoneNumber.length >= 15 ? null : data.phoneNumber,
		[`ottIds.${ottName}`]: data.ottId,
	});
}

async function syncGuestInfo(ottName, ottId, phone) {
	const parsedPhone = normPhone(phone);
	if (parsedPhone) {
		const ott = `ottIds.${ottName}`;
		await models.Guest.updateMany(
			{
				phone: parsedPhone,
				[ott]: null,
			},
			{
				[ott]: ottId,
			}
		);
		await models.Guest.updateMany(
			{
				phone: null,
				[ott]: ottId,
			},
			{
				phone: parsedPhone,
			}
		);
	}
}

async function receiveMessagesHandler(data, ottName, msg) {
	const isGroup = _.get(msg.data, 'user.info.isGroup');
	if (data.fromMe && !isGroup) return;

	// if (ottName === OTAs.WhatsApp) {
	// 	logger.info('receiveMessagesHandler', ottName, data, msg);
	// }

	const threadId = data.phoneNumber || data.ottId;
	if (!threadId) {
		logger.error('receiveMessagesHandler Not found threadId', ottName, data, msg);
		return;
	}

	const ottPhone = msg.sender && msg.sender.replace(/^\+/, '');
	const ott = await models.Ott.findOne({ phone: ottPhone, active: true }).select('groupIds');
	if (!ott) {
		logger.error('receiveMessagesHandler Not found ott', ottName, data, msg);
		return;
	}

	const guestInfo = getGuestInfo(data, ottName, msg);
	guestInfo.isGroup = isGroup;
	guestInfo.groupIds = ott.groupIds;

	if (guestInfo.phone && data.ottId && !isGroup) {
		await syncGuestInfo(ottName, data.ottId, guestInfo.phone);
	}

	const inboxData = {
		ottPhone,
		isGroup,
		subTitle: _.truncate(_.get(data, 'message.title') || _.get(data, 'message') || 'Send an image'),
		inboxType: InboxType.MESSAGE,
		ottSource: ottName,
		phone: data.phoneNumber,
		image_attachment_url: data.image_attachment_url,
		groupIds: ott.groupIds,
	};
	if (isGroup) {
		inboxData.userType = USER_CONTACT_TYPE.GROUP;
	}

	const guests = await models.Guest.findWithPhoneNumber(inboxData.groupIds, threadId, true);
	if (!guests.length) {
		const guest = await models.Guest.findGuest(guestInfo);
		const thread = await models.Messages.createMessagesThread({
			threadId,
			isGroup,
			otaName: ottName,
			guestId: guest._id,
			inquiry: !isGroup,
			groupIds: inboxData.groupIds,
			userType: inboxData.userType,
			inquiryDetails: {
				ott: ottName,
			},
		});
		guest.messages = thread._id;
		inboxData.messageId = thread._id;
		inboxData.inquiry = thread.inquiry;
		inboxData.mthread = thread;
		inboxData.guestId = guest._id;
		await guest.save();
	} else {
		if (!isGroup) {
			const guestIds = _.map(guests, '_id');

			const bookings = await models.Booking.findBestMatchBookings({
				match: {
					$or: [{ guestId: { $in: guestIds } }, { guestIds: { $in: guestIds } }],
				},
				project: 'guestId guestIds blockId messages',
				limit: 1,
			});

			const booking = _.get(bookings, 0);

			if (booking) {
				inboxData.guestId = guestIds.includesObjectId(booking.guestId)
					? booking.guestId
					: _.find(booking.guestIds, g => guestIds.includesObjectId(g));

				if (booking.messages && (await models.Block.isActive(booking.blockId))) {
					inboxData.messageId = booking.messages;
				} else {
					const newThread = await models.Messages.createMessagesThread({
						threadId,
						isGroup,
						inquiry: !isGroup,
						otaName: ottName,
						guestId: inboxData.guestId,
						groupIds: inboxData.groupIds,
						userType: inboxData.userType,
						inquiryDetails: {
							ott: ottName,
						},
					});
					inboxData.messageId = newThread._id;
					inboxData.mthread = newThread;
					inboxData.inquiry = newThread.inquiry;

					await models.Guest.updateOne({ _id: inboxData.guestId }, { messages: newThread._id });
				}
			}
		}

		inboxData.messageId = inboxData.messageId || guests[0].messages;
		inboxData.guestId = inboxData.guestId || guests[0]._id;
	}

	if (data.messageId) {
		models.OTTMessage.updateOne(
			{
				ottName,
				messageId: data.messageId,
				sender: ottPhone,
			},
			{
				toId: data.ottId || threadId,
				time: new Date(data.time),
				fromMe: data.fromMe,
				event: InboxType.MESSAGE,
			},
			{
				upsert: true,
			}
		).catch(e => {
			logger.error(e);
		});
	}

	await inbox.updateInbox(inboxData, msg);
}

async function receiveMessage(data, ottName, msg) {
	try {
		await MessageLock.acquire(
			`${ottName}_${msg.sender}_${data.phoneNumber || data.ottId}_ott_received_handler`,
			() => receiveMessagesHandler(data, ottName, msg)
		);
	} catch (e) {
		logger.error('receiveMessage', ottName, data, e);
	}
}

async function sendMessage({ ottName, sender, phone, text, attachments, mentions, qmsgId, ...opts }) {
	if (!OTTs[ottName] || !OTTs[ottName].sendMessage) {
		throw new ThrowReturn(`Hiện chưa hỗ trợ gửi tin nhắn qua ${_.upperFirst(ottName)}`);
	}

	let files = [];

	if (attachments && attachments.length) {
		const fpath = `${ottName}/${moment().format('YYYY/MM/DD')}/${sender.phone}/${phone}`;
		const folder = await checkFolder(`${OTT_CONFIG.STATIC_RPATH}/${fpath}`);

		files = await attachments.asyncMap(async file => {
			if (file.mv) {
				let fileName = await compressImage(file, folder);
				if (!fileName) {
					await file.mv(`${folder}/${file.name}`);
					fileName = file.name;
				}
				return {
					url: `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${fpath}/${fileName}`,
					localPath: `${folder}/${fileName}`,
					type: file.mimetype,
					name: file.name,
				};
			}
			return {
				url: file.url,
				type: file.mimetype,
				name: file.name,
			};
		});
	}

	return OTTs[ottName].sendMessage(sender, phone, text, files, mentions, qmsgId, opts);
}

async function getMessages({ ottName, sender, phone, start, limit, ...q }) {
	if (!OTTs[ottName] || !OTTs[ottName].getMessages) throw new ThrowReturn('Not supported');

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	const data = await OTTs[ottName].getMessages(sender, phone, start, limit, q);

	const messages = _.map(_.get(data, 'data.messages'), msg => ({
		...msg,
		user: msg.fromMe ? MessageUser.ME : MessageUser.GUEST,
		time: new Date(msg.time),
		message: msg.message && typeof msg.message === 'object' ? msg.message.title : msg.message,
	}));
	_.unset(data, 'data.messages');

	return { messages, other: data.data };
}

function getMessage({ ottName, ...params }) {
	if (!OTTs[ottName] || !OTTs[ottName].getMessage) return null;
	return OTTs[ottName].getMessage(params);
}

async function checkExists({ ottName, sender, phone, recheck }) {
	if (!OTTs[ottName] || !OTTs[ottName].checkExists) throw new ThrowReturn('Not supported');

	const data = await OTTs[ottName].checkExists(sender, phone, recheck);
	const info = _.get(data, 'data.info');

	if (recheck && !_.isEmpty(info)) {
		const fName = info.name || info.displayName;

		const guests = await models.Guest.find(
			info.isGroup
				? {
						[`ottIds.${ottName}`]: phone,
				  }
				: {
						displayName: { $in: [null, ''] },
						$or: [
							{
								phone,
							},
							{
								[`ottIds.${ottName}`]: phone,
							},
						],
				  }
		);

		await guests.asyncMap(g => {
			g.displayName = fName;
			g.fullName = fName;
			g.name = info.first_name || fName;
			g.avatar = info.avatar;
			return g.save();
		});
	}

	return data;
}

async function login(ottName, phone, ottDoc) {
	if (!OTTs[ottName] || !OTTs[ottName].login) throw new ThrowReturn('Not supported');

	const result = await OTTs[ottName].login(phone, ottDoc);
	if (result.error_code) {
		throw new ThrowReturn(result.error_msg).error_code(result.error_code);
	}

	return result;
}

function addFriend({ ottName, sender, phone, text }) {
	if (!OTTs[ottName] || !OTTs[ottName].addFriend) throw new ThrowReturn('Not supported');

	return OTTs[ottName].addFriend(sender, phone, text);
}

async function loginStatus(ottName, loginId, ottDoc) {
	if (!OTTs[ottName] || !OTTs[ottName].loginStatus) {
		throw new ThrowReturn('Not supported');
	}

	const data = await OTTs[ottName].loginStatus(loginId, ottDoc);
	return data;
}

function getTemplates({ ottName, sender, ...data }) {
	if (!OTTs[ottName] || !OTTs[ottName].getTemplates) throw new ThrowReturn('Not supported');

	return OTTs[ottName].getTemplates({ sender, ...data });
}

function getTemplate({ ottName, sender, ...data }) {
	if (!OTTs[ottName] || !OTTs[ottName].getTemplate) throw new ThrowReturn('Not supported');

	return OTTs[ottName].getTemplate({ sender, ...data });
}

function sendTemplate({ ottName, sender, templateId, messageId, guestId }) {
	if (!OTTs[ottName] || !OTTs[ottName].sendTemplate) throw new ThrowReturn('Not supported');

	return OTTs[ottName].sendTemplate(sender, templateId, messageId, guestId);
}

async function getOauthUrl(params) {
	if (!OTTs[params.ottName] || !OTTs[params.ottName].getOauthUrl) throw new ThrowReturn('Not supported');

	return OTTs[params.ottName].getOauthUrl(params);
}

async function getUsers({ ottName, sender, start, limit, keyword, isGroup }) {
	if (!OTTs[ottName] || !OTTs[ottName].getUsers) throw new ThrowReturn('Not supported');

	return OTTs[ottName].getUsers(sender, start, limit, keyword, isGroup);
}

async function forwardOTTMessages({ sender, ottName, phone, msgIds, toIds, msg }) {
	if (!OTTs[ottName] || !OTTs[ottName].forwardOTTMessages) throw new ThrowReturn('Not supported');

	return OTTs[ottName].forwardOTTMessages(sender, phone, msgIds, toIds, msg);
}

function connect(app, conversationRouter) {
	Object.values(OTTs).forEach(ott => {
		if (ott.addReceiveMessageHandle) {
			ott.addReceiveMessageHandle(receiveMessage);
		}
		ott.connect(app, conversationRouter);
	});
}

module.exports = {
	connect,
	sendMessage,
	getMessages,
	getMessage,
	checkExists,
	login,
	addFriend,
	loginStatus,
	getTemplates,
	getTemplate,
	sendTemplate,
	getOauthUrl,
	getUsers,
	forwardOTTMessages,
	OTTs,
};

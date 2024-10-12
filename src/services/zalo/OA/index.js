const _ = require('lodash');
const moment = require('moment');

const { logger } = require('@utils/logger');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');
const { Api } = require('./api');
const helper = require('./helper');
const { User, Message } = require('./database');

async function getUser(api, user_id, app_id, user_id_by_app, conversation_id = null) {
	let user = await User().findOne({ user_id, app_id });
	let isNew = !user;

	if (!user) {
		user = user || {};
		user.user_id = user_id;
		user.user_id_by_app = user_id_by_app;
		user.conversation_id = conversation_id;
		user.app_id = api.appId;

		const remoteUser = await api.getUser(user_id);
		if (remoteUser) {
			user.data = remoteUser;
		}

		await User().updateOne({ user_id, app_id }, { $set: user }, { upsert: true });
	}

	return { user, isNew };
}

// function saveAttachments(data) {
// 	helper
// 		.saveAttachments(data)
// 		.then(links => {
// 			if (links && links.length) {
// 				return Message().updateOne(
// 					{
// 						msg_id: data.msg_id,
// 					},
// 					{
// 						$set: {
// 							local_attachments: links,
// 						},
// 					}
// 				);
// 			}
// 		})
// 		.catch(e => {
// 			logger.error(e);
// 		});
// }

async function updateMessage(sender, user, data, from_me) {
	data.from_me = from_me;
	data.timestamp = Number(data.timestamp);
	data.created_at = new Date();
	data.msg_id = data.message.msg_id;
	data.user_id = from_me ? data.recipient.id : data.sender.id;
	data.date_string = new Date(data.timestamp).toDateMysqlFormat();

	const rs = await Message().updateOne(
		{
			app_id: data.app_id,
			user_id: data.user_id,
			msg_id: data.msg_id,
		},
		{ $set: data },
		{ upsert: true }
	);

	// saveAttachments(data);

	if (rs.upsertedId) {
		ottEventEmitter.emit(OTT_EVENTS.MESSAGE_RECEIVED_ZALO_OA, sender, user, data);
	}

	return data;
}

function getUserId(data, isUserSent) {
	return (
		_.get(data.follower, 'id') ||
		data.user_id ||
		(isUserSent ? _.get(data.sender, 'id') : _.get(data.recipient, 'id'))
	);
}

async function updateUserIdZNS(api, user) {
	try {
		const conversations = await api.getConversations(user.user_id, 0, 10);
		const updateData = {};

		const msgEvents = conversations.filter(c => c.type === 'nosupport');
		if (msgEvents.length) {
			const messageHasTemplate = await Message().findOne({
				msg_id: { $in: _.map(msgEvents, 'message_id') },
				template_id: { $ne: null },
				user_id: /^\+/,
			});
			if (messageHasTemplate) {
				const phone = messageHasTemplate.user_id.replace(/\D/g, '');

				await Message().updateMany(
					{ user_id: messageHasTemplate.user_id },
					{ $set: { user_id: user.user_id } }
				);
				await User().deleteMany({ user_id: messageHasTemplate.user_id });
				updateData.phone = phone;
			}
		}

		const guestMessage = conversations.find(c => c.src === 1);
		if (guestMessage) {
			updateData['data.avatar'] = guestMessage.from_avatar;
			updateData['data.display_name'] = guestMessage.from_display_name;
		}

		if (!_.isEmpty(updateData)) {
			await User().updateOne({ user_id: user.user_id }, { $set: updateData });
			_.forEach(updateData, (value, key) => {
				_.set(user, key, value);
			});
		}
	} catch (e) {
		logger.error(e);
	}
}

async function onReceiveWebHook(sender, data) {
	// logger.info('receive zalo-webhook', JSON.stringify(data, ' ', 4));

	const isUserSent = helper.isUserEvent(data.event_name);
	const userId = getUserId(data, isUserSent);

	if (!userId) return;

	const api = new Api(sender.zalo_oaInfo);
	const { user, isNew } = await getUser(
		api,
		userId,
		data.app_id,
		data.user_id_by_app,
		_.get(data.message, 'conversation_id')
	);

	if (helper.isMessageEvent(data.event_name)) {
		if (isNew) {
			await updateUserIdZNS(api, user, data);
		}
		return await updateMessage(sender, user, data, !isUserSent);
	}

	// hook for user received ZNS
	if (data.event_name === 'user_received_message') {
		const message = await Message().findOne({ msg_id: data.message.msg_id });

		if (message) {
			message.message.delivery_time = data.message.delivery_time;
			message.event_name = data.event_name;
			message.recipient = data.recipient;
			await Message().updateOne({ _id: message._id }, { $set: message });
		} else {
			await updateMessage(sender, user, data, !isUserSent);
		}
	}
}

async function checkExists(sender, user_id, recheck) {
	let user = await User().findOne({ user_id, app_id: sender.zalo_oaInfo.appId });
	const api = new Api(sender.zalo_oaInfo);

	if ((!user || !user.data) && recheck && helper.isUserId(user_id)) {
		const remoteUser = await api.getUser(user_id);
		if (remoteUser) {
			user = user || {};
			user.user_id = user_id;
			user.user_id_by_app = remoteUser.user_id_by_app;
			user.conversation_id = null;
			user.app_id = sender.zalo_oaInfo.appId;
			user.data = remoteUser;
			await User().updateOne({ user_id, app_id: user.app_id }, { $set: user }, { upsert: true });
		}
	}
	if (user && recheck) {
		await syncMessages(api, sender, user);
	}

	return user;
}

async function syncMessages(api, sender, user) {
	const conversations = await api.getConversations(user.user_id, 0, 50);

	const messages = conversations
		.map(conversation => helper.sampleToAdvMessage(conversation, api.appId))
		.filter(m => m);

	const rs = await Message().bulkWrite(
		messages.map(message => {
			return {
				updateOne: {
					filter: {
						msg_id: message.msg_id,
						app_id: message.app_id,
					},
					update: {
						$setOnInsert: {
							...message,
							created_at: new Date(),
							date_string: message.timestamp && new Date(message.timestamp).toDateMysqlFormat(),
						},
					},
					upsert: true,
				},
			};
		})
	);

	rs.result.upserted.forEach(u => {
		ottEventEmitter.emit(OTT_EVENTS.MESSAGE_RECEIVED_ZALO_OA, sender, user, messages[u.index]);
	});
}

async function getMessage({ messageId, parsed = true }) {
	const msg = await Message().findOne({ msg_id: messageId });

	if (parsed && msg) {
		return helper.parseMessage(msg);
	}

	return msg;
}

async function getMessages(sender, user_id, start = 0, limit = 20) {
	const user = await User().findOne({ user_id, app_id: sender.zalo_oaInfo.appId });
	if (!user) {
		return Promise.reject(`User ${user_id} not found!`);
	}

	const filter = {
		user_id,
		app_id: sender.zalo_oaInfo.appId,
	};

	const [messages, total] = await Promise.all([
		Message().find(filter).sort({ timestamp: -1 }).skip(start).limit(limit).toArray(),
		Message().countDocuments(filter),
	]);

	return { user, messages: messages.reverse(), total, start, limit };
}

async function sendMessage(sender, user_id, text, attachments) {
	const user = await User().findOne({ user_id, app_id: sender.zalo_oaInfo.appId });
	if (!user) {
		return Promise.reject(`User ${user_id} not found!`);
	}

	const api = new Api(sender.zalo_oaInfo);
	let attachment;

	if (attachments && attachments.length) {
		const uploadedItems = await attachments.asyncMap(file => api.upload(file));
		if (attachments[0].type.includes('image')) {
			attachment = {
				type: 'template',
				payload: {
					template_type: 'media',
					elements: uploadedItems.map(item => ({
						media_type: 'image',
						attachment_id: item.attachment_id,
					})),
				},
			};
		} else {
			attachment = {
				type: 'file',
				payload: {
					token: uploadedItems[0].token,
				},
			};
		}
	}

	const [message] = await Message()
		.find({ user_id, app_id: sender.zalo_oaInfo.appId, from_me: false })
		.sort({ timestamp: -1 })
		.limit(1)
		.toArray();

	const rs = await api.sendMessage(user, message, text, attachment);
	return rs;
}

function getZNSTemplates(sender) {
	const api = new Api(sender.zalo_oaInfo);
	return api.getZNSTemplates();
}

function getZNSTemplate(sender, template_id) {
	const api = new Api(sender.zalo_oaInfo);
	return api.getZNSTemplate(template_id);
}

async function sendZNSTemplate(sender, template, user_id, params) {
	if (sender.zalo_oaInfo.znsMaxTime || sender.zalo_oaInfo.znsMinTime) {
		const now = moment().format('HH:mm');
		if (now >= sender.zalo_oaInfo.znsMaxTime || now < sender.zalo_oaInfo.znsMinTime) {
			return Promise.reject(
				`Không hỗ trợ gửi ZNS trong khung giờ ${sender.zalo_oaInfo.znsMaxTime} - ${sender.zalo_oaInfo.znsMinTime}`
			);
		}
	}

	const exists = await Message().findOne({
		app_id: sender.zalo_oaInfo.appId,
		template_id: template.templateId,
		'message.tracking_id': params.tracking_id,
	});
	const templateName = template.name || template.templateName;

	if (exists) {
		return Promise.reject(`Bạn đã gửi template *${templateName}* cho khách hàng này rồi!`);
	}

	const api = new Api(sender.zalo_oaInfo);

	const data = await api.sendZNSTemplate(params);

	if (data && data.msg_id) {
		const phone = params.phone.replace(/\D/g, '');
		let user = { user_id };

		if (!user_id) {
			user = (await User().findOne({ phone })) || {};
		}

		user.phone = phone;
		user.user_id = user.user_id || params.phone;
		user.app_id = api.appId;

		const timestamp = Number(data.sent_time);
		const tempMessage = {
			app_id: user.app_id,
			timestamp,
			date_string: new Date(timestamp).toDateMysqlFormat(),
			message: {
				msg_id: data.msg_id,
				text: `<i>Sent template <b>${templateName}</b></i>`,
				tracking_id: params.tracking_id,
			},
			recipient: {
				id: user.user_id,
			},
			sender: {
				id: sender.zalo_oaInfo.oaId,
			},
			template_id: params.template_id,
			template_data: params.template_data,
		};

		const message = await updateMessage(sender, user, tempMessage, true);
		await User().updateOne({ user_id: user.user_id, app_id: user.app_id }, { $set: user }, { upsert: true });

		return message;
	}
}

function onReceiveOauth(config, data) {
	const api = new Api(config.zalo_oaInfo);

	return api.updateToken({
		code: data.code,
		// code_verifier: helper.genCodeVerifier(data.code_challenge),
		// code_verifier: data.code_challenge,
		grant_type: 'authorization_code',
	});
}

async function getStats({ from, to, fromMe, ottPhones }) {
	const query = {};

	if (from) {
		_.set(query, ['timestamp', '$gte'], from.valueOf());
	}
	if (to) {
		_.set(query, ['timestamp', '$lte'], to.valueOf());
	}
	if (_.isBoolean(fromMe)) {
		_.set(query, ['from_me'], fromMe);
	}
	if (ottPhones) {
		query.$or = [
			{
				from_me: false,
				'recipient.id': { $in: ottPhones },
			},
			{
				from_me: true,
				'sender.id': { $in: ottPhones },
			},
		];
	}

	return Message()
		.aggregate([
			{
				$match: query,
			},
			{
				$group: {
					_id: '$date_string',
					totalMessage: { $sum: 1 },
					user: { $addToSet: '$user_id' },
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

async function findUserByPhone({ phone }) {
	const normPhone = phone.replace(/^\+/, '');

	const user = await User().findOne({ phone: { $in: [normPhone, `+${normPhone}`] } });
	if (!user || !user.user_id) return null;

	return {
		ottId: user.user_id,
	};
}

module.exports = {
	onReceiveWebHook,
	checkExists,
	getMessages,
	sendMessage,
	getZNSTemplate,
	getZNSTemplates,
	sendZNSTemplate,
	onReceiveOauth,
	getStats,
	getMessage,
	findUserByPhone,
};

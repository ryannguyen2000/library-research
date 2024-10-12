/* eslint-disable prefer-destructuring */
/* eslint-disable class-methods-use-this */
const fetch = require('node-fetch');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const uri = require('@utils/uri');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');

const { CMD_TYPE, GRAPH_URI } = require('./const');
const { User, Message } = require('./database');
const { getFileType, parseAttachment, parseMessage } = require('./utils');

class FacebookPage {
	constructor(config) {
		this.setConfig(config);
	}

	setConfig(config) {
		this.config = config;
		this.accessToken = this.config.never_expired_access_token || this.config.access_token;
		this.subscribeWebhook();
	}

	async callAPI(endpoint, options = {}) {
		try {
			const { params = {}, headers, body, ...opts } = options;
			params.access_token = this.accessToken;

			const cheaders = _.merge(
				{
					'content-type': 'application/json',
				},
				headers
			);

			const res = await fetch(
				uri(`${GRAPH_URI}/${endpoint}`, params),
				_.pickBy({
					headers: cheaders,
					body: body
						? cheaders['content-type'] === 'application/json' && typeof body !== 'string'
							? JSON.stringify(body)
							: body
						: undefined,
					...opts,
				})
			);
			const json = await res.json();

			if (json.success === false) {
				throw json;
			}

			if (_.get(json.error, 'message')) {
				throw json.error.message;
			}

			return json;
		} catch (err) {
			logger.error(`Facebook Messenger callAPI err -> ${endpoint}`, options.body, err);
			return Promise.reject(err);
		}
	}

	subscribeWebhook() {
		return this.callAPI(`${this.config.id}/subscribed_apps`, {
			params: {
				subscribed_fields: 'messages,message_echoes',
			},
			method: 'POST',
		}).catch(e => {
			logger.error('Facebook subscribeWebhook', this.config, e);
		});
	}

	unSubscribeWebhook() {
		return this.callAPI(`${this.config.id}/subscribed_apps`, {
			params: {
				subscribed_fields: '',
			},
			method: 'DELETE',
		}).catch(e => {
			logger.error('Facebook unSubscribeWebhook', this.config, e);
		});
	}

	async checkExists({ psid, recheck }) {
		const info = await User().findOne({ pageId: this.config.id, psid }, { _id: 0 });
		if (recheck && info) {
			await this.syncMessages(psid, info);
		}

		return { exists: !!info, psid, info };
	}

	async syncMessages(user_id, info) {
		const pageId = this.config.id;
		const data = await this.callAPI(`${pageId}/conversations`, {
			params: {
				fields: `messages.limit(1000){created_time,from,message,attachments,id},id,name`,
				user_id,
				platform: 'messenger',
			},
		});

		if (data && data.data) {
			const msgs = data.data[0].messages.data.map(msg => {
				return {
					pageId,
					psid: user_id,
					messageId: msg.id,
					fromMe: msg.from.id === pageId,
					time: msg.created_time,
					dateString: new Date(msg.created_time).toDateMysqlFormat(),
					message: msg.message,
					attachments: msg.attachments && _.map(msg.attachments.data, parseAttachment),
				};
			});

			const bulkResult = await Message().bulkWrite(
				msgs.map(msg => ({
					updateOne: {
						filter: {
							messageId: msg.messageId,
						},
						update: {
							$setOnInsert: msg,
						},
						upsert: true,
					},
				}))
			);
			const { name } = this.config;

			_.forEach(bulkResult.result.upserted, u => {
				const upsertedMsg = { ...msgs[u.index], _id: u._id };

				const rs = {
					data: {
						info,
						message: upsertedMsg,
						page: {
							name,
							id: pageId,
						},
					},
					sender: pageId,
					type: CMD_TYPE.FB_SENT,
				};

				ottEventEmitter.emit(OTT_EVENTS.MESSAGE_RECEIVED_FB, rs);
			});
		} else {
			logger.error('FB syncMessages', data);
		}
	}

	async getMessages({ psid, start, limit }) {
		start = parseInt(start) || 0;
		limit = parseInt(limit) || 20;

		const pageId = this.config.id;
		const info = await this.getUserInfo(psid);

		const cursor = Message().find({ pageId, psid }, { _id: 0 });

		const total = await cursor.count();
		const messages = await cursor.sort({ time: -1 }).skip(start).limit(limit).toArray();
		// messages.forEach(message => {
		// 	message.image_attachment_url = _.map(message.attachments, (attachment, index) => {
		// 		const local = _.get(message.localAttachments, index);
		// 		if (local) {
		// 			return getUrlAttachment(local);
		// 		}
		// 		return _.get(attachment.payload, 'url') || attachment.url;
		// 	}).filter(i => i);
		// });

		const page = {
			name: this.config.name,
			id: pageId,
		};

		return {
			info,
			page,
			total,
			start,
			limit,
			messages: messages.map(parseMessage).reverse(),
		};
	}

	getUserInfoFromFacebook(psid, retry = 0) {
		const params = {
			fields: `id,name,first_name,last_name,profile_pic${
				retry ? '' : ',ids_for_apps{app,id},ids_for_pages{id,page}'
			}`,
		};

		return this.callAPI(psid, params)
			.then(data => ({
				...data,
				avatar: data && data.profile_pic,
				locale: '',
			}))
			.catch(() => {
				if (retry < 1) {
					return this.getUserInfoFromFacebook(psid, retry + 1);
				}
			});
	}

	getUserInfoFromDatabase(psid) {
		return User().findOne({ pageId: this.config.id, psid }, { _id: 0 });
	}

	async getUserInfo(psid) {
		let info = await this.getUserInfoFromDatabase(psid);
		if (!info) {
			info = await this.getUserInfoFromFacebook(psid);
			if (!info) return;

			info.psid = psid;
			info.pageId = this.config.id;
			info.id = `${info.pageId}.${psid}`;
			delete info.profile_pic;

			await User().updateOne({ id: info.id }, { $set: info }, { upsert: true });
		}

		delete info._id;
		return info;
	}

	sendMessage(type, senderID, payload) {
		switch (type) {
			case 'image':
				return this.sendImageMessage(senderID, payload);
			case 'audio':
				return this.sendAudioMessage(senderID, payload);
			case 'video':
				return this.sendVideoMessage(senderID, payload);
			case 'file':
				return this.sendFileMessage(senderID, payload);
			case 'template':
				return this.sendTemplateMessage(senderID, payload);
			case 'quick_reply':
				return this.sendQuickReply(senderID, payload);
			case 'read_receipt':
				return this.sendReadReceipt(senderID, payload);
			case 'typing_on':
				return this.sendTypingOn(senderID, payload);
			case 'typing_off':
				return this.sendTypingOff(senderID, payload);
			case 'text':
				return this.sendTextMessage(senderID, payload);
			default:
				logger.error('NOT FOUND TYPE', type);
		}
	}

	async postMessage({ psid, text, attachments }) {
		const result = [];

		if (text) {
			const messsage = await this.sendMessage('text', psid, text);
			result.push(messsage);
		}
		if (attachments && attachments.length) {
			const messages = await attachments.asyncMap(file => {
				const type = getFileType(file.type);
				return this.sendMessage(type, psid, { url: file.url });
			});
			result.push(...messages);
		}

		const ids = result.map(r => _.get(r, 'message_id')).filter(r => r);
		if (!ids.length) {
			logger.error('FB postMessage error', { psid, text, attachments }, this.config, JSON.stringify(result));

			return Promise.reject('Gửi tin nhắn lỗi');
		}

		return { messageId: ids[0] };
	}

	onMessage(pageEntry) {
		// Iterate over each messaging event
		return pageEntry.messaging.asyncMap(messagingEvent => {
			if (messagingEvent.optin) {
				return this.receivedAuthentication(messagingEvent);
			}
			if (messagingEvent.message) {
				return this.receivedMessage(messagingEvent);
			}
			if (messagingEvent.delivery) {
				return;
			}
			if (messagingEvent.postback) {
				return this.receivedPostback(messagingEvent);
			}
			if (messagingEvent.read) {
				return this.receivedMessageRead(messagingEvent);
			}
			if (messagingEvent.account_linking) {
				return this.receivedAccountLink(messagingEvent);
			}
			logger.info('Webhook received unknown messagingEvent: ', messagingEvent);
		});
	}

	/*
	 * Authorization Event
	 *
	 * The value for 'optin.ref' is defined in the entry point. For the "Send to
	 * Messenger" plugin, it is the 'data-ref' field. Read more at
	 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
	 *
	 */
	async receivedAuthentication(event) {
		const senderID = event.sender.id;
		const recipientID = event.recipient.id;
		const timeOfAuth = event.timestamp;

		// The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
		// The developer can set this to an arbitrary value to associate the
		// authentication callback with the 'Send to Messenger' click event. This is
		// a way to do account linking when the user clicks the 'Send to Messenger'
		// plugin.
		const passThroughParam = event.optin.ref;
		logger.info(
			'Received authentication for user %d and page %d with pass through param %s at %d',
			senderID,
			recipientID,
			passThroughParam,
			timeOfAuth
		);

		// When an authentication is received, we'll send a message back to the sender
		// to let them know it was successful.
		await this.sendTextMessage(senderID, 'Authentication successful');
	}

	/*
	 * Message Event
	 *
	 * This event is called when a message is sent to your page. The 'message'
	 * object format can vary depending on the kind of message that was received.
	 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
	 *
	 * For this example, we're going to echo any text that we get. If we get some
	 * special keywords ('button', 'generic', 'receipt'), then we'll send back
	 * examples of those bubbles to illustrate the special message bubbles we've
	 * created. If we receive a message with an attachment (image, video, audio),
	 * then we'll simply confirm that we've received the attachment.
	 *
	 */
	async receivedMessage(event) {
		const senderID = event.sender.id;
		const recipientID = event.recipient.id;
		const message = event.message;
		const fromMe = !!message.is_echo;
		const messageId = message.mid;
		const metadata = message.metadata;
		const attachments = message.attachments;
		const quickReply = message.quick_reply;
		const psid = fromMe ? recipientID : senderID;
		const time = new Date(event.timestamp);
		const pageId = fromMe ? senderID : recipientID;

		const info = await this.getUserInfo(psid);
		const msg = {
			pageId,
			psid,
			messageId,
			fromMe,
			metadata,
			quickReply,
			time: time.toJSON(),
			message: message.text,
			attachments,
			dateString: time.toDateMysqlFormat(),
		};
		const data = {
			info,
			message: msg,
			page: {
				name: this.config.name,
				id: this.config.id,
			},
		};

		await Message().updateOne({ messageId: msg.messageId }, { $set: msg }, { upsert: true });

		// saveAttachments(msg)
		// 	.then(localAttachments => {
		// 		if (localAttachments && localAttachments.length) {
		// 			return Message().updateOne({ messageId: msg.messageId }, { $set: { localAttachments } });
		// 		}
		// 	})
		// 	.catch(e => {
		// 		logger.error(e);
		// 	});

		const rs = {
			data,
			sender: this.config.id,
			type: CMD_TYPE.FB_SENT,
		};
		ottEventEmitter.emit(OTT_EVENTS.MESSAGE_RECEIVED_FB, rs);

		return rs;
	}

	/*
	 * Postback Event
	 *
	 * This event is called when a postback is tapped on a Structured Message.
	 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
	 *
	 */
	receivedPostback(event) {
		const senderID = event.sender.id;
		const recipientID = event.recipient.id;
		const timeOfPostback = event.timestamp;

		// The 'payload' param is a developer-defined field which is set in a postback
		// button for Structured Messages.
		const payload = event.postback.payload;

		logger.info(
			'Received postback for user %d and page %d with payload `%s` at %d',
			senderID,
			recipientID,
			payload,
			timeOfPostback
		);

		// When a postback is called, we'll send a message back to the sender to
		// let them know it was successful
		return this.sendTextMessage(senderID, 'Postback called');
	}

	/*
	 * Message Read Event
	 *
	 * This event is called when a previously-sent message has been read.
	 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
	 *
	 */
	receivedMessageRead(event) {}

	/*
	 * Account Link Event
	 *
	 * This event is called when the Link Account or UnLink Account action has been
	 * tapped.
	 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
	 *
	 */
	receivedAccountLink(event) {}

	/*
	 * Send an image using the Send API.
	 *
	 */
	sendImageMessage(recipientId, payload) {
		const messageData = {
			recipient: { id: recipientId },
			message: {
				attachment: { type: 'image', payload },
			},
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Send audio using the Send API.
	 *
	 */
	sendAudioMessage(recipientId, payload) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			message: {
				attachment: { type: 'audio', payload },
			},
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Send a video using the Send API.
	 *
	 */
	sendVideoMessage(recipientId, payload) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			message: {
				attachment: { type: 'video', payload },
			},
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Send a file using the Send API.
	 *
	 */
	async sendFileMessage(recipientId, payload) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			message: {
				attachment: { type: 'file', payload },
			},
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Send a text message using the Send API.
	 *
	 */
	async sendTextMessage(recipientId, text) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			message: {
				text,
				metadata: 'DEVELOPER_DEFINED_METADATA',
			},
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Send a Structured Message using the Send API.
	 *
	 */
	async sendTemplateMessage(recipientId, payload) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			message: {
				attachment: {
					type: 'template',
					payload,
				},
			},
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Send a message with Quick Reply buttons.
	 *
	 */
	sendQuickReply(recipientId, message) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			message,
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Send a read receipt to indicate the message has been read
	 *
	 */
	sendReadReceipt(recipientId) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			sender_action: 'mark_seen',
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Turn typing indicator on
	 *
	 */
	sendTypingOn(recipientId) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			sender_action: 'typing_on',
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Turn typing indicator off
	 *
	 */
	sendTypingOff(recipientId) {
		const messageData = {
			recipient: {
				id: recipientId,
			},
			sender_action: 'typing_off',
		};

		return this.callSendAPI(messageData);
	}

	/*
	 * Call the Send API. The message data goes in the body. If successful, we'll
	 * get the message id in a response
	 *
	 */
	async callSendAPI(data, retry = 0) {
		try {
			const response = await this.callAPI('me/messages', {
				method: 'POST',
				body: data,
			});

			return response;
		} catch (e) {
			if (retry < 1 && _.get(e, 'error.code') === 10) {
				data.messaging_type = 'MESSAGE_TAG';
				data.tag = 'POST_PURCHASE_UPDATE';
				return this.callSendAPI(data, retry + 1);
			}
			return Promise.reject(_.get(e, 'error.message') || 'Unknown Error!');
		}
	}
}

module.exports = {
	FacebookPage,
};

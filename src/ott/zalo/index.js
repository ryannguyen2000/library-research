const { v1: uuidv1 } = require('uuid');
const WebSocket = require('ws');
const _ = require('lodash');
const fs = require('fs');

const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const models = require('@models');
const zaloApi = require('@services/zalo/personal');
const { parseMessage, parseResources } = require('@services/zalo/personal/utils');
const {
	CONNECTION_TYPE,
	ZALO_SENT,
	SEND_TEXT,
	SEND_IMAGE,
	USER_LOGIN,
	LOGIN,
	ADD_FRIEND,
	CHECK_EXISTS,
	CHECK_LOGIN,
	USER_LOGIN_STATUS,
	FORWARD_MSGS,
	OTT_NAME,
} = require('@services/zalo/personal/const');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');

const PORT = 8657;
const TIMEOUT = 15 * 1000;

const _WaitForResponse = {};
const _WaitForResponseExt = {};
const _ReceiveMessageHandle = [];

/**
 * @type {Websocket}
 */
let _WebsocketClient = null;

/**
 * Message
 * @typedef {Object} Message
 * @property {Object} image - image
 * @property {string[]} image_attachment_url - message
 * @property {string} message - message
 * @property {string} messageId - messageId
 * @property {string} time - time
 * @property {string} id - id
 * @property {string} user - user
 * @property {STATUS} status - status. ERROR = 0; PENDING = 1; SERVER_ACK = 2; DELIVERY_ACK = 3; READ = 4; PLAYED = 5;
 * @property {boolean} fromMe - fromMe
 * @property {string} phoneNumber - phoneNumber
 * @property {Object} raw - raw
 */

/**
 * ServerResponseMesage
 * @typedef {Object} ServerResponseMesage
 * @property {string} id - id
 * @property {Object} data - data
 * @property {number} error_code - ErrorCode
 * @property {string} error_msg - ErrorMsg
 */

/**
 * @callback HandleCallbackFunction
 * @param {Message} message message
 */

function getMessageId() {
	return uuidv1();
}

function getUserId(phoneOrId) {
	return phoneOrId && phoneOrId.length >= 15 ? phoneOrId : undefined;
}

function connect() {
	const wss = new WebSocket.Server({ port: PORT });
	wss.on('connection', onZaloWebsocketConnection);
}

function onZaloWebsocketConnection(ws) {
	_WebsocketClient = ws;
	_WebsocketClient.on('message', onMessage);
	_WebsocketClient.on('close', onWebsocketClose);
	_WebsocketClient.on('error', onWebsocketError);
}

function onWebsocketClose(code, reason) {
	const error_msg = `Websocket close with code: ${code} and reason: ${reason}.`;
	const error_code = 99;

	Object.keys(_WaitForResponse).forEach(id => {
		sendResponse({ id, error_msg, error_code });
	});
}

function onWebsocketError() {
	const error_msg = `Websocket error`;
	const error_code = 999;

	Object.keys(_WaitForResponse).forEach(id => {
		sendResponse({ id, error_msg, error_code });
	});
}

function sendResponse(msg) {
	const done = _WaitForResponse[msg.id];
	if (done && typeof done === 'function') {
		done(msg);
	} else {
		logger.error('Done Error', msg);
	}

	delete _WaitForResponse[msg.id];
}

function sendExtResponse(msg) {
	const done = _WaitForResponseExt[msg.id];
	if (done && typeof done === 'function') {
		done(msg);
	} else {
		logger.error('Done Error', msg);
	}

	delete _WaitForResponse[msg.id];
}

ottEventEmitter.on(OTT_EVENTS.MESSAGE_RECEIVED_ZALO, onMessageExt);

function onMessageExt(msg) {
	try {
		if (msg.type === ZALO_SENT) {
			return onZaloSent(msg);
		}

		if (msg.id) {
			sendExtResponse(msg);
		}
	} catch (err) {
		logger.error('<- received: \n%s', msg);
	}
}

function onMessage(message) {
	try {
		const msg = typeof message === 'string' ? JSON.parse(message) : message;

		if (msg.data && typeof msg.data === 'string') {
			msg.data = JSON.parse(msg.data);
		}
		if (msg.type === LOGIN) {
			return onLoginMsg(msg);
		}
		if (msg.type === USER_LOGIN) {
			return onUserLoginMsg(msg);
		}
		if (msg.type === ZALO_SENT) {
			return onZaloSent(msg);
		}

		if (msg.id) {
			sendResponse(msg);
		}
	} catch (err) {
		logger.error('<- received: \n%s', message);
	}
}

function onLoginMsg(msg) {
	const { data } = msg;

	if (data.ZaloID && typeof data.ZaloID === 'string') {
		data.phoneNumber = data.ZaloID.replace(/@.*/g, '');
	}

	sendResponse(msg);
}

function onUserLoginMsg(msg) {
	const { data } = msg;
	const { phoneNumber: phone, avatar, name } = data;

	return models.Ott.findOneAndUpdate(
		{ phone },
		{
			phone,
			active: true,
			zalo: true,
			'zaloInfo.avatar': avatar,
			'zaloInfo.name': name,
		},
		{ upsert: true }
	).catch(() => {});
}

function createResourceCrawlers(msgs) {
	try {
		const bulks = [];
		const TIME_EXP = 24 * 60 * 60 * 1000 * 7;
		const now = Date.now();

		msgs.forEach(msg => {
			if (msg.localFiles && msg.localFiles.length) return;
			if (now - Number(msg.sendDttm) > TIME_EXP) return;

			const resouces = parseResources(msg);

			if (resouces.length) {
				bulks.push(
					...resouces.map(resouce => ({
						updateOne: {
							filter: {
								from: OTT_NAME,
								url: resouce.url,
								localPath: resouce.localPath,
							},
							update: {
								$set: {
									fileName: resouce.fileName,
								},
								$setOnInsert: {
									done: false,
									retried: 0,
								},
							},
							upsert: true,
						},
					}))
				);
			}
		});

		if (bulks.length) {
			models.FileCrawler.bulkWrite(bulks).catch(e => logger.error('createResourceCrawlers', OTT_NAME, e));
		}
	} catch (e) {
		logger.error('createResourceCrawlers', OTT_NAME, e);
	}
}

function onZaloSent(msg) {
	_ReceiveMessageHandle.forEach(async ([callback, thisArgs]) => {
		if (callback && typeof callback === 'function') {
			createResourceCrawlers([msg.data.message]);

			msg.data.message = await parseMessage(msg.data.message);

			const data = msg.data.message;
			data.ottId = _.get(msg.data.user, 'info.userId') || data.toUid;
			data.phoneNumber = _.get(msg.data.user, 'phone') || _.get(msg.data.user, 'info.phoneNumber');

			callback.call(thisArgs, data, OTT_NAME, msg);
		} else {
			logger.error('Handle error', callback);
		}
	});
}

function waitForResponse(msg, opts = {}) {
	const timeout = opts.timeout || TIMEOUT;

	return new Promise((res, reject) => {
		const timer = setTimeout(() => {
			reject(new ThrowReturn(`${OTT_NAME} timeout ${msg.type}!`));
			delete _WaitForResponse[msg.id];
		}, timeout);

		function done(data) {
			clearTimeout(timer);
			res(data);
		}
		_WaitForResponse[msg.id] = done;
	});
}

function wairForExtResponse(msg, opts = {}) {
	const timeout = opts.timeout || TIMEOUT;

	return new Promise((res, reject) => {
		const timer = setTimeout(() => {
			reject(new ThrowReturn(`${OTT_NAME} timeout ${msg.type}!`));
			delete _WaitForResponseExt[msg.id];
		}, timeout);

		function done(data) {
			clearTimeout(timer);
			if (data.error) reject(new ThrowReturn(data.error));
			else res(data);
		}

		_WaitForResponseExt[msg.id] = done;
	});
}

async function getWSClient() {
	let n = 0;

	while (n++ < 10 && (!_WebsocketClient || _WebsocketClient.readyState !== WebSocket.OPEN)) {
		await Promise.delay(500);
	}

	if (!_WebsocketClient) {
		throw new ThrowReturn('Zalo websocket client not connected.');
	}

	if (_WebsocketClient.readyState !== WebSocket.OPEN) {
		throw new ThrowReturn(`Zalo websocket not ready ${_WebsocketClient.readyState}`);
	}

	return _WebsocketClient;
}

async function sendText(msg, opts) {
	if (msg.connectionType === CONNECTION_TYPE.EXTENSION) {
		ottEventEmitter.emit(OTT_EVENTS.MESSAGE_REQUEST_ZALO, msg);

		return wairForExtResponse(msg, opts);
	}

	const ws = await getWSClient();
	ws.send(JSON.stringify(msg));

	return waitForResponse(msg, opts);
}

async function sendMessage(sender, phone, text = '', attachments, mentions, qmsgId, opts) {
	try {
		const id = getMessageId();
		const userId = getUserId(phone);
		const data = {
			phone,
			userId,
			text,
			qmsgId,
			images: attachments.map(a => a.url),
			attachments,
		};

		const type = attachments.length ? SEND_IMAGE : SEND_TEXT;
		const msg = {
			id,
			type,
			data,
			sender: sender.phone,
			connectionType: sender.zaloInfo.connectionType,
		};

		if (qmsgId) {
			data.qmsg = await zaloApi.getMessage({ messageId: qmsgId, parsed: false });
		}

		if (mentions) {
			if (typeof mentions !== 'string') {
				const mentionInfo = [];
				const { users } = await zaloApi.getUsers({
					userId: _.map(mentions, 'userId'),
					showTotal: false,
				});

				mentions.forEach(mention => {
					const user = users.find(u => u.info.userId === mention.userId);
					if (user) {
						const mentionTxt = `@${user.info.zaloName}`;
						const mentionOri = `@mention_${mention.userId}`;
						const pos = data.text.indexOf(mentionOri);
						data.text = data.text.replace(mentionOri, mentionTxt);
						mentionInfo.push({
							pos,
							len: mentionTxt.length,
							uid: mention.userId,
							type: 0,
						});
					}
				});

				if (mentionInfo.length) {
					data.mentions = JSON.stringify(mentionInfo);
				}
			} else {
				data.mentions = mentions;
			}
		}

		return await sendText(msg, opts);
	} catch (e) {
		throw new ThrowReturn(e);
	} finally {
		attachments.forEach(f => {
			if (f.localPath) {
				fs.unlink(f.localPath, () => {});
			}
		});
	}
}

async function getMessages(sender, phone, start, limit, filters = null) {
	const userId = getUserId(phone);

	const { originMessages, ...data } = await zaloApi.getMessages({
		sender: sender.phone,
		phone,
		userId,
		start,
		limit,
		...filters,
	});

	if (originMessages && originMessages.length) {
		createResourceCrawlers(originMessages);
	}

	return { data };
}

/**
 * @param {string} sender phone number
 */
async function login(sender, ottDoc) {
	const id = getMessageId();

	const type = LOGIN;
	const msg = {
		id,
		type,
		sender,
		data: {},
	};

	if (ottDoc && ottDoc.zaloInfo) {
		_.assign(msg.data, ottDoc.zaloInfo);
		if (ottDoc.zaloInfo.connectionType) msg.connectionType = ottDoc.zaloInfo.connectionType;
	}

	return sendText(msg);
}

/**
 * Kiểm tra đăng nhập
 * @param {string} sender phone number
 */
async function checkLogin(sender, ottDoc) {
	const id = getMessageId();
	const data = {};

	const type = CHECK_LOGIN;
	const msg = {
		id,
		type,
		sender,
		data,
		connectionType: ottDoc.zaloInfo.connectionType,
	};

	return sendText(msg);
}

/**
 * Kết bạn
 * @param {string} phone số điện thoại: CountryCode+PhoneNumber vd. 84123456789
 */
async function addFriend(sender, phone, text) {
	const id = getMessageId();
	const userId = getUserId(phone);
	const data = { phone, userId, text };

	const msg = {
		id,
		type: ADD_FRIEND,
		sender: sender.phone,
		data,
		connectionType: sender.zaloInfo.connectionType,
	};

	return sendText(msg);
}

/**
 * @param {string} phone số điện thoại: CountryCode+PhoneNumber vd. 84123456789
 */
async function checkExists(sender, phone, recheck) {
	const userId = getUserId(phone);

	if (!recheck) {
		const user = await zaloApi.getUser({ sender: sender.phone, phone, userId });
		if (user) {
			return {
				data: user,
			};
		}
	}

	const id = getMessageId();
	const data = { phone, userId, recheck };

	const msg = {
		id,
		type: CHECK_EXISTS,
		sender: sender.phone,
		data,
		connectionType: sender.zaloInfo.connectionType,
	};

	return sendText(msg);
}

async function loginStatus(loginId, ottDoc) {
	const id = getMessageId();
	const data = { browserId: loginId };

	const msg = {
		id,
		type: USER_LOGIN_STATUS,
		data,
		sender: _.get(ottDoc, 'phone'),
		connectionType: _.get(ottDoc, 'zaloInfo.connectionType'),
	};

	return sendText(msg);
}

async function getUsers(sender, start, limit, keyword, isGroup) {
	const data = await zaloApi.getUsers({ sender: sender.phone, start, limit, keyword, isGroup });

	return data;
}

async function forwardOTTMessages(sender, phone, msgIds, toIds, msg) {
	const id = getMessageId();
	const userId = getUserId(phone);

	const data = {
		phone,
		userId,
		msgIds,
		toIds,
		msg,
	};

	if (msgIds) {
		data.msgs = await zaloApi.getOriMessages({ msgId: { $in: msgIds } });
	}

	return await sendText({
		id,
		type: FORWARD_MSGS,
		sender: sender.phone,
		data,
		connectionType: sender.zaloInfo.connectionType,
	});
}

function addReceiveMessageHandle(callback, thisArgs) {
	_ReceiveMessageHandle.push([callback, thisArgs]);
}

function removeReceiveMessageHandle(callback) {
	const idx = _ReceiveMessageHandle.find(h => h[0] === callback);
	if (idx !== -1) {
		_ReceiveMessageHandle.splice(idx, 1);
	}
}

module.exports = {
	sendMessage,
	getMessages,
	login,
	checkExists,
	checkLogin,
	addReceiveMessageHandle,
	removeReceiveMessageHandle,
	connect,
	addFriend,
	loginStatus,
	getStats: zaloApi.getStats,
	getUsers,
	forwardOTTMessages,
	getMessage: zaloApi.getMessage,
	findUserByPhone: zaloApi.findUserByPhone,
};

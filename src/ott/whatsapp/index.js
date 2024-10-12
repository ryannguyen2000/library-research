const qrcode = require('qrcode-terminal');
const { v1: uuidv1 } = require('uuid');
const { get } = require('lodash');
const WebSocket = require('ws');
const fs = require('fs');

const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { getStats, parseMessage, getMessage, findUserByPhone } = require('@services/whatsapp');

const WHATSAPP_SENT = 'WHATSAPP_SENT';
const SEND_TEXT = 'SEND_TEXT';
const SEND_IMAGE = 'SEND_IMAGE';
const USER_LOGIN = 'USER_LOGIN';
const USER_LOGIN_STATUS = 'USER_LOGIN_STATUS';
const GET_MESSAGES = 'GET_MESSAGES';
const LOGIN = 'LOGIN';

const logger = { log: () => {}, error: () => {}, warn: () => {} };
const OTT_NAME = 'whatsapp';
const PORT = 8647;

/**
 * @type {Object}
 */
const _WaitForResponse = {};

/**
 * @type {[HandleCallbackFunction, thisArgs][]}
 */
const _ReceiveMessageHandle = [];

/**
 * @type {Websocket}
 */
let _WebsocketClient = null;

// =========================================================
// =========================================================
// =========================================================

/**
 * Status of Message
 * @readonly
 * @enum {number}
 */
// const STATUS = {
// 	ERROR: 0,
// 	PENDING: 1,
// 	SERVER_ACK: 2,
// 	DELIVERY_ACK: 3,
// 	READ: 4,
// 	PLAYED: 5,
// };

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

function getMessageId() {
	return uuidv1();
}

// =========================================================
// =========================================================
// =========================================================

// =========================================================
// =========================================================

function onWebsocketConnection(ws) {
	ws.isAlive = true;
	ws.on('pong', () => {
		ws.isAlive = true;
	});

	logger.log('\nWhatsAppWebsocketConnection\n');
	_WebsocketClient = ws;
	// sent = 0;
	// received = 0;

	_WebsocketClient.on('message', onMessage);

	_WebsocketClient.on('close', onWebsocketClose);

	_WebsocketClient.on('error', onWebsocketError);
}

function onWebsocketClose(code, reason) {
	// sent = 11111110;
	const error_msg = `Websocket close with code: ${code} and reason: ${reason}.`;
	logger.error(error_msg);
	const error_code = 99;

	Object.keys(_WaitForResponse).forEach(id => {
		const done = _WaitForResponse[id];
		if (done && typeof done === 'function') {
			done({ id, error_msg, error_code });
		}

		delete _WaitForResponse[id];
	});
}

function onWebsocketError(code, reason) {
	const error_msg = `Websocket error`;

	logger.error(error_msg);
	const error_code = 999;

	Object.keys(_WaitForResponse).forEach(id => {
		const done = _WaitForResponse[id];
		if (done && typeof done === 'function') {
			done({ id, error_msg, error_code });
		}

		delete _WaitForResponse[id];
	});
}

function onMessage(message) {
	try {
		const msg = JSON.parse(message);

		if (msg.data && typeof msg.data === 'string') {
			msg.data = JSON.parse(msg.data);
		}

		if (msg.type === LOGIN) {
			return onLoginMsg(msg);
		}
		if (msg.type === USER_LOGIN) {
			return onUserLoginMsg(msg);
		}
		if (msg.type === WHATSAPP_SENT) {
			return onWhatsAppSent(msg);
		}

		const done = _WaitForResponse[msg.id];
		if (done && typeof done === 'function') {
			done(msg);
		} else {
			logger.error('Done Error', done, msg);
		}

		delete _WaitForResponse[msg.id];

		// logger.log(
		//     `\n<- Received: ${msg.id}\t%s\n`,
		//     JSON.stringify({ ...msg, data: msg.data }),
		// );
	} catch (err) {
		logger.log('<- received: \n%s', message);
		// logger.error(err);
	}
}

function onLoginMsg(msg) {
	const { data } = msg;
	if (data.qrKey) {
		qrcode.generate(msg.data.qrKey);
	}

	if (data.WhatsAppID && typeof data.WhatsAppID === 'string') {
		data.phoneNumber = data.WhatsAppID.replace(/@.*/g, '');
	}

	const done = _WaitForResponse[msg.id];
	if (done && typeof done === 'function') {
		done(msg);
	} else {
		logger.error('Done Error', done, msg);
	}

	if (!data.qrKey || data.phoneNumber || msg.error_code) {
		delete _WaitForResponse[msg.id];
	}
}

function onUserLoginMsg(msg) {
	const { data } = msg;

	const { phoneNumber: phone, avatar, senderJid } = data;

	return models.Ott.findOneAndUpdate(
		{ phone },
		{
			phone,
			active: true,
			whatsapp: true,
			'whatsappInfo.avatar': avatar,
			// 'whatsappInfo.name': name,
			'whatsappInfo.jid': senderJid,
		},
		{ upsert: true }
	).catch(() => {});
}

function onWhatsAppSent(msg) {
	const data = parseMessage({ ...msg.data, url: msg.data.mediaUrl, phone: msg.data.info.phoneNumber });

	_ReceiveMessageHandle.forEach(([callback, thisArgs]) => {
		if (callback && typeof callback === 'function') {
			callback.call(thisArgs, data, OTT_NAME, msg);
		} else {
			logger.error('Handle error', callback);
		}
	});
}

// =========================================================
// =========================================================
// =========================================================

function waitForResponse(msg) {
	return new Promise(res => {
		function done(response) {
			res(response);
		}

		_WaitForResponse[msg.id] = done;
	});
}

async function getWSClient() {
	let n = 0;

	while (n++ < 10 && (!_WebsocketClient || _WebsocketClient.readyState !== WebSocket.OPEN)) {
		logger.log(`Waiting for Websocket ${n}`);
		await new Promise(res => setTimeout(res, 500));
	}

	if (!_WebsocketClient) {
		throw new ThrowReturn('WhatsApp websocket client not connected.');
	}

	if (_WebsocketClient.readyState !== WebSocket.OPEN) {
		throw new ThrowReturn(`WhatsApp websocket not ready ${_WebsocketClient.readyState}`);
	}

	return _WebsocketClient;
}

async function sendText(msg) {
	const res = waitForResponse(msg);
	const ws = await getWSClient();
	ws.send(JSON.stringify(msg));
	return res;
}

async function sendMessage(sender, phone, text = '', attachments) {
	try {
		const id = getMessageId();
		if (attachments.some(a => !a.type.includes('image'))) {
			throw new Error(`Only support image format!`);
		}

		const data = {
			phone,
			text,
			images: attachments.length
				? await attachments.asyncMap(async file => {
						const base64 = await fs.promises.readFile(file.localPath, { encoding: 'base64' });
						return `data:image/${file.type.includes('png') ? 'png' : 'jpeg'};base64,${base64}`;
				  })
				: [],
		};

		const type = attachments.length ? SEND_IMAGE : SEND_TEXT;
		const msg = {
			id,
			type,
			sender: sender.phone,
			senderJid: get(sender, 'whatsappInfo.jid'),
			data: JSON.stringify(data),
		};

		return await sendText(msg);
	} catch (e) {
		throw new ThrowReturn(e);
	} finally {
		attachments.forEach(f => {
			if (f.localPath) fs.unlink(f.localPath, () => {});
		});
	}
}

async function getMessages(sender, phone, start = 0, limit = 15) {
	const id = getMessageId();
	const data = { phone, start, limit, count: start + limit };

	const type = GET_MESSAGES;
	const msg = {
		id,
		type,
		sender: sender.phone,
		senderJid: get(sender, 'whatsappInfo.jid'),
		data: JSON.stringify(data),
	};

	const response = await sendText(msg);

	const error_code = get(response, 'error_code');
	if (error_code) {
		throw new ThrowReturn(get(response, 'error_msg'));
	}

	const responseData = get(response, 'data', {});
	const messages = get(responseData, 'messages', []);
	const messagesMediaUrl = get(responseData, 'messagesMediaUrl', []);

	responseData.messages = messages.map((_msg, idx) =>
		parseMessage({ data: _msg, url: messagesMediaUrl[idx], phone })
	);
	responseData.messagesMediaUrl = undefined;

	return response;
}

async function checkExists(sender, phone) {
	const id = getMessageId();
	const data = { phone };

	const type = GET_MESSAGES;
	const msg = {
		id,
		type,
		sender: sender.phone,
		senderJid: get(sender, 'whatsappInfo.jid'),
		data: JSON.stringify(data),
	};

	const response = await sendText(msg);

	const error_code = get(response, 'error_code');
	if (error_code) {
		throw new ThrowReturn(get(response, 'error_msg'));
	}

	return response;
}

/**
 *
 * Đăng nhập Whats App
 * @param {string} sender phone number
 * @returns
 */
async function login(sender) {
	const id = getMessageId();
	const data = {};

	const type = LOGIN;
	const msg = {
		id,
		type,
		sender,
		data: JSON.stringify(data),
	};

	logger.log(`-> ${type}  -  ${id}:\n`, msg.data);

	return sendText(msg);
}

async function loginStatus(loginId) {
	const id = getMessageId();

	const data = { loginId };

	const type = USER_LOGIN_STATUS;
	const msg = {
		id,
		type,
		data: JSON.stringify(data),
	};

	logger.log(`-> ${type}  -  ${id}:\n`, msg.data);
	return sendText(msg);
}

/**
 *
 * @callback HandleCallbackFunction
 * @param {Message} message message
 */

/**
 *
 * @param {HandleCallbackFunction} callback
 * @param {thisArgs} thisArgs
 */
function addReceiveMessageHandle(callback, thisArgs) {
	_ReceiveMessageHandle.push([callback, thisArgs]);
}

/**
 *
 * @param {HandleCallbackFunction} callback
 */
function removeReceiveMessageHandle(callback) {
	const idx = _ReceiveMessageHandle.find(h => h[0] === callback);
	if (idx !== -1) {
		_ReceiveMessageHandle.splice(idx, 1);
	}
}

let intervalId = null;
function connect() {
	const wss = new WebSocket.Server({ port: PORT });
	wss.on('connection', onWebsocketConnection);

	if (intervalId) clearInterval(intervalId);
	intervalId = setInterval(() => {
		wss.clients.forEach(ws => {
			if (ws.isAlive === false) return ws.terminate();
			ws.isAlive = false;
			ws.ping(() => {});
		});
	}, 30000);
}

module.exports = {
	connect,
	onWebsocketConnection,
	sendMessage,
	getMessages,
	checkExists,
	login,
	loginStatus,
	addReceiveMessageHandle,
	removeReceiveMessageHandle,
	getStats,
	getMessage,
	findUserByPhone,
};

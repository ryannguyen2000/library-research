const { v1: uuidv1 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { Server } = require('http-keep-alive-chat');
const { OTT_CONFIG, URL_CONFIG } = require('@config/setting');
const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { hasExists, checkFolder } = require('@utils/file');
const models = require('@models');

const CONNECTED = 'CONNECTED';
const IMESSAGE_SENT = 'IMESSAGE_SENT';
const SEND_TEXT = 'SEND_TEXT';
const SEND_IMAGE = 'SEND_IMAGE';
const GET_MESSAGES = 'GET_MESSAGES';
const LOGIN = 'LOGIN';
const CHECK_EXISTS = 'CHECK_EXISTS';
const UPLOAD_FILE = 'UPLOAD_FILE';
const GET_STATS = 'GET_STATS';
const TIMEOUT = 20000;
const OTT_NAME = 'imessage';

/**
 * @type {Object}
 */
const _WaitForResponse = {};

/**
 * @type {[HandleCallbackFunction, thisArgs][]}
 */
const _ReceiveMessageHandle = [];

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
 *
 * @callback HandleCallbackFunction
 * @param {Message} message message
 */

function getMessageId() {
	return uuidv1();
}

// =========================================================
// =========================================================
// =========================================================

let chat = null;
function connect(app) {
	chat = new Server(app, `/${OTT_NAME}`);
	// chat.on('sent', msg => logger.info(msg));
	onIMessageWebsocketConnection(chat);
}

// =========================================================
// =========================================================

function onIMessageWebsocketConnection(ws) {
	ws.on('message', async message => {
		try {
			const msg = message;

			if (msg.type === CONNECTED) {
				return;
			}
			if (msg.type === IMESSAGE_SENT) {
				return onIMessageSent(msg);
			}
			if (msg.type === UPLOAD_FILE) {
				await onUploadFile(msg, ws);
			}

			const done = _WaitForResponse[msg.id];
			if (done && typeof done === 'function') {
				done(msg);
			} else {
				logger.error('Done Error', done, msg);
			}

			delete _WaitForResponse[msg.id];
		} catch (err) {
			logger.error(err);
		}
	});
}

async function onUploadFile(msg, ws) {
	const {
		sender,
		data: { phone, url, buffer },
	} = msg;

	const buf = Buffer.from(JSON.parse(buffer));
	const p = path.join(OTT_CONFIG.STATIC_RPATH, OTT_NAME, sender, phone, url);

	await checkFolder(path.dirname(p));
	await fs.promises.writeFile(p, buf);
}

async function onIMessageSent(msg) {
	// logger.info('\n <--- onIMessageSent:', msg);
	const { sender } = msg;
	const phone = msg.data.phoneNumber && msg.data.phoneNumber.replace(/\D/g, '');
	const data = await parseMessage(sender, phone, msg.data);

	data.ottId = msg.data.phoneNumber;

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
	return new Promise((res, reject) => {
		const timer = setTimeout(() => {
			reject(new ThrowReturn(`${OTT_NAME} timeout ${msg.type}!`));
			setTimeout(() => {
				delete _WaitForResponse[msg.id];
			});
		}, msg.timeout || TIMEOUT);

		function done(data) {
			clearTimeout(timer);
			res(data);
		}
		_WaitForResponse[msg.id] = done;
	});
}

function sendText(msg) {
	const res = waitForResponse(msg);
	chat.send(msg.sender, msg);
	return res;
}

async function requestUploadFile(sender, phone, url) {
	try {
		const msg = {
			id: getMessageId(),
			type: UPLOAD_FILE,
			sender,
			data: {
				phone,
				url,
			},
		};

		chat.send(sender, msg);

		return await waitForResponse(msg);
	} catch (e) {
		logger.error(e);
	}
}

async function getFilePath(sender, phone, url) {
	const p = path.join(OTT_CONFIG.STATIC_RPATH, OTT_NAME, sender, phone, url);
	const exists = await hasExists(p);
	if (!exists) {
		requestUploadFile(sender, phone, url);
	}

	return URL_CONFIG.SERVER + p.replace('/home/api/tb/publish/doc/ott', OTT_CONFIG.STATIC_PATH);
}

async function parseMessage(sender, phone, message) {
	if (message.image_attachment_url) {
		message.image_attachment_url = await message.image_attachment_url.asyncMap(url =>
			getFilePath(sender, phone, url)
		);
	}

	message.phone = phone;
	return message;
}

// =========================================================
// ========================= EXPORT ========================
// =========================================================

async function sendMessage(sender, phone, text = '', attachments) {
	if (!sender) return;

	try {
		const id = getMessageId();
		const data = {
			phone,
			text,
			attachments,
		};

		const type = attachments.length ? SEND_IMAGE : SEND_TEXT;
		const msg = {
			id,
			type,
			sender: sender.phone,
			data: JSON.stringify(data),
		};

		return await sendText(msg);
	} catch (e) {
		throw new ThrowReturn(e);
	} finally {
		attachments.forEach(f => {
			fs.unlink(f.localPath, () => { });
		});
	}
}

async function getMessages(sender, phone, start = 0, limit = 15) {
	if (!sender) return;

	const id = getMessageId();
	const data = { phone, start, limit };

	const type = GET_MESSAGES;
	const msg = {
		id,
		type,
		sender: sender.phone,
		data: JSON.stringify(data),
	};

	// logger.info(`-> ${type}  -  ${id}:\n`, msg.data);

	const response = await sendText(msg);
	const messages = response && response.data && response.data.messages;
	if (messages) {
		response.data.messages = await messages.asyncMap(m => parseMessage(sender.phone, phone, m));
	}

	return response;
}

async function login(sender) {
	if (!sender) return;

	const id = getMessageId();
	const data = {};

	const type = LOGIN;
	const msg = {
		id,
		type,
		sender: sender.phone,
		data: JSON.stringify(data),
	};

	return sendText(msg);
}

/**
 *
 * Kiểm tra đăng nhập
 * @param {string} sender phone number
 * @returns
 */
function checkLogin() {
	throw new ThrowReturn('iMessage check login status not supported');
}

async function checkExists(sender, phone, recheck) {
	if (!sender) return;

	const id = getMessageId();
	const data = { phone, recheck };

	const type = CHECK_EXISTS;
	const msg = {
		id,
		type,
		sender: sender.phone,
		data: JSON.stringify(data),
	};

	// logger.info(`-> ${type}  -  ${id}:\n`, msg.data);

	return sendText(msg);
}

async function getStats(data) {
	const ott = await models.Ott.findOne({ [OTT_NAME]: true, active: true }).select('phone');
	if (!ott) return;

	const msg = {
		id: getMessageId(),
		type: GET_STATS,
		sender: ott.phone,
		data: JSON.stringify(data),
		timeout: 4000,
	};

	const res = await sendText(msg);
	return (res && res.data) || [];
}

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

module.exports = {
	onIMessageWebsocketConnection,
	sendMessage,
	getMessages,
	login,
	checkExists,
	checkLogin,
	addReceiveMessageHandle,
	removeReceiveMessageHandle,
	connect,
	getStats,
};

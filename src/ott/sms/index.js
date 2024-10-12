const { v1: uuidv1 } = require('uuid');
const moment = require('moment');
const { Server } = require('http-keep-alive-chat');
const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { OTAs } = require('@utils/const');
const models = require('@models');

const CONNECTED = 'CONNECTED';
const SMS_SENT = 'SMS_SENT';
const OTT_NAME = OTAs.SMS;

/**
 * @type {Object}
 */
const _WaitForResponse = {};

/**
 * @type {[HandleCallbackFunction, thisArgs][]}
 */
const _ReceiveMessageHandle = [];

// =========================================================
// =========================================================
// =========================================================

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
function connect(app, conversationRouter) {
	chat = new Server(conversationRouter, `/${OTT_NAME}`);
	chat.on('sent', msg => logger.info(msg));
	onSMSWebsocketConnection(chat);
}

// =========================================================
// =========================================================

function onSMSWebsocketConnection(ws) {
	ws.on('message', async message => {
		try {
			const msg = message;

			let { account, type } = msg;
			if (!account && msg.data && msg.data.address) {
				account = msg.data.address.replace(/\D/g, '') || msg.data.address;
			}

			const ott = await models.Ott.findOne({ phone: account, active: true, [OTT_NAME]: true });
			if (!ott) {
				return;
			}

			if (type === CONNECTED) {
				return await onConnected(msg, ott);
			}
			if (type === SMS_SENT) {
				return await onSMSSent(msg);
			}

			const done = _WaitForResponse[msg.id];
			if (done && typeof done === 'function') {
				done(msg);
			} else {
				logger.error('Done Error', done, msg);
			}

			delete _WaitForResponse[msg.id];
		} catch (err) {
			logger.error('onSMSWebsocketConnection', err);
		}
	});
}

async function onConnected(msg, ott) {
	logger.info('onConnected -> data', msg);

	const { account, type } = msg;

	let minDate = moment().startOf('day').valueOf() - 60 * 1000 * 60 * 5;
	if (ott && ott.smsInfo && ott.smsInfo.minDate) {
		minDate = ott.smsInfo.minDate;
	} else {
		const message = await models.SMSMessage.findOne({ account }).select('data.date').sort({ 'data.date': -1 });
		if (message && message.data.date) {
			minDate = message.data.date - 60 * 1000 * 60 * 5;
		}
	}

	const id = getMessageId();

	await chat.send(account, {
		id,
		sender: account,
		type,
		data: {
			minDate,
		},
	});
}

async function onSMSSent(msg) {
	try {
		const { sender } = msg;
		logger.info(
			'<--- onSMSSent:',
			sender,
			msg.data && msg.data.address,
			msg.data && msg.data._id,
			msg.data && msg.data.thread_id,
			msg.data && msg.data.body
		);
		const phone = msg.data.address.replace(/\D/g, '') || msg.data.address;

		await models.SMSMessage.createSMS(sender, phone, msg.data);

		_ReceiveMessageHandle.forEach(([callback, thisArgs]) => {
			if (callback && typeof callback === 'function') {
				const data = parseMessage(sender, phone, msg.data);
				callback.call(thisArgs, data, OTT_NAME, msg);
			} else {
				logger.error('Handle error', callback);
			}
		});
	} catch (e) {
		logger.error('onSMSSent error', msg, e);
	}
}

function parseMessage(sender, phone, message) {
	message.phoneNumber = phone;
	return message;
}

// =========================================================
// ========================= EXPORT ========================
// =========================================================

async function sendMessage(sender, phone, text = '', images = []) {
	throw new ThrowReturn('SMS sendMessage not support');
}

async function getMessages(sender, phone, start = 0, limit = 15) {
	throw new ThrowReturn('SMS sendMessage not support');
}

/**
 *
 * Kiểm tra đăng nhập
 * @param {string} sender phone number
 * @returns
 */
function checkLogin(sender) {
	throw new ThrowReturn('SMS check login status not supported');
}

// /**
//  *
//  * @param {HandleCallbackFunction} callback
//  * @param {thisArgs} thisArgs
//  */
// function addReceiveMessageHandle(callback, thisArgs) {
// 	_ReceiveMessageHandle.push([callback, thisArgs]);
// }

// /**
//  *
//  * @param {HandleCallbackFunction} callback
//  */
// function removeReceiveMessageHandle(callback) {
// 	const idx = _ReceiveMessageHandle.find(h => h[0] === callback);

// 	if (idx !== -1) {
// 		_ReceiveMessageHandle.splice(idx, 1);
// 	}
// }

module.exports = {
	sendMessage,
	getMessages,
	checkLogin,
	// addReceiveMessageHandle,
	// removeReceiveMessageHandle,
	connect,
};

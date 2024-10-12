const { v1: uuidv1 } = require('uuid');
const fs = require('fs');

const ThrowReturn = require('@core/throwreturn');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');
const { logger } = require('@utils/logger');
const { OTTs } = require('@utils/const');
const API = require('@services/line/api');
const { getStats, getMessage } = require('@services/line');
const models = require('@models');

const LINE_SENT = 'LINE_SENT';
const GET_MESSAGES = 'GET_MESSAGES';
const CHECK_EXISTS = 'CHECK_EXISTS';

const OTT_NAME = OTTs.Line;
const _WaitForResponse = {};
const _ReceiveMessageHandle = [];
const apis = {};

ottEventEmitter.on(OTT_EVENTS.MESSAGE_RECEIVED_LINE, onMessageReceived);

async function connect() {
	const otts = await models.Ott.find({ [OTT_NAME]: true, active: true });

	otts.forEach(ott => {
		apis[ott.phone] = new API(ott.lineInfo);
	});
}

function onMessageReceived(message) {
	try {
		const msg = {
			...message,
			...message.data.info,
		};
		if (msg.type === LINE_SENT) {
			return _ReceiveMessageHandle.forEach(([callback, thisArgs]) => {
				if (callback && typeof callback === 'function') {
					callback.call(thisArgs, msg.data.message, OTT_NAME, msg);
				}
			});
		}
		const done = _WaitForResponse[msg.id];
		if (done && typeof done === 'function') {
			done(msg);
		} else {
			logger.error('Done Error', msg);
		}

		delete _WaitForResponse[msg.id];
	} catch (err) {
		logger.error('<- received: \n%s', message);
	}
}

function getApi(sender) {
	const api = apis[sender.phone];
	if (!api) throw new ThrowReturn(`Line api ${sender.phone} not found!`);

	return api;
}

function getMessageId() {
	return uuidv1();
}

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

async function checkExists(sender, userId) {
	const id = getMessageId();
	const type = CHECK_EXISTS;
	const data = { userId };
	const msg = {
		id,
		type,
		data,
	};
	const res = await getApi(sender).checkExists(msg);
	if (res.error_code !== 0) {
		res.data = {
			exists: false,
		};
		res.error_code = 0;
		res.error_msg = '';
	}
	return res;
}

async function sendMessage(sender, userId = '', text = '', attachments) {
	try {
		const res = await getApi(sender).sendMessage({
			userId,
			text,
			attachments,
		});

		const msg = {
			data: {
				...res,
			},
		};
		return msg;
	} catch (e) {
		attachments.forEach(f => {
			if (f.localPath) fs.unlink(f.localPath, () => {});
		});
		throw new ThrowReturn(e);
	}
}

/**
 * lấy danh sách messages
 */
async function getMessages(sender, userId = '', start = 0, limit = 15) {
	const id = getMessageId();
	const data = { userId, start, limit };
	const type = GET_MESSAGES;
	const msg = {
		id,
		type,
		data,
	};
	const res = await getApi(sender).getMessages(msg);
	return res;
}

module.exports = {
	connect,
	checkExists,
	sendMessage,
	addReceiveMessageHandle,
	removeReceiveMessageHandle,
	getMessages,
	getStats,
	getMessage,
};

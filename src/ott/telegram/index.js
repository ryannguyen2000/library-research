/* eslint-disable no-underscore-dangle */
/* eslint-disable no-use-before-define */
const _ = require('lodash');
const fs = require('fs');

const ThrowReturn = require('@core/throwreturn');
const { OTTs } = require('@utils/const');
const { logger } = require('@utils/logger');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');
const API = require('@services/telegram/api');
const { getStats, getMessage, findUserByPhone } = require('@services/telegram');
const { parseMessage } = require('@services/telegram/helper');
const models = require('@models');

const GET_MESSAGES = 'GET_MESSAGES';
const LOGIN = 'LOGIN';
const CHECK_LOGIN = 'CHECK_LOGIN';
const CHECK_EXISTS = 'CHECK_EXISTS';
const OTT_NAME = OTTs.Telegram;

const _ReceiveMessageHandle = [];
const apis = {};

async function connect() {
	const otts = await models.Ott.find({ telegram: true, telegramInfo: { $ne: null } });
	otts.forEach(ott => {
		apis[ott.phone] = apis[ott.phone] || new API(ott.phone, ott.telegramInfo);
	});
}

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
ottEventEmitter.on(OTT_EVENTS.MESSAGE_RECEIVED_TELE, onMessageReceived);

function onMessageReceived(account, user, message) {
	const msg = {
		...parseMessage({ message }),
		phoneNumber: user.phone,
		ottId: user.id,
		info: {
			...user,
			displayName: _.compact([user.first_name, user.last_name]).join(' '),
		},
	};
	const data = {
		sender: account,
		message: msg,
	};

	_ReceiveMessageHandle.forEach(([callback, thisArgs]) => {
		if (callback && typeof callback === 'function') {
			callback.call(thisArgs, data.message, OTT_NAME, data);
		} else {
			logger.error('Handle error', callback);
		}
	});
}

function getApi(sender) {
	const { phone } = sender || {};
	if (!phone || !apis[phone]) throw new ThrowReturn(`Số điện thoại ${phone} chưa được đăng nhập!`);
	return apis[phone];
}

async function sendMessage(sender, phone, text, attachments) {
	try {
		const api = getApi(sender);

		const rs = await api.sendMessage(phone, text, attachments);

		const msg = {
			sender: sender.phone,
			data: {
				messageId: rs.id,
				time: rs.date * 1000,
			},
		};

		return msg;
	} catch (e) {
		throw new ThrowReturn(e);
	} finally {
		attachments.forEach(f => {
			if (f.localPath) fs.unlink(f.localPath, () => {});
		});
	}
}

async function getMessages(sender, phone, start = 0, limit = 20) {
	const api = getApi(sender);

	const { messages, user, total } = await api.getMessages(phone, start, limit);

	const msg = {
		type: GET_MESSAGES,
		sender: sender.phone,
		data: {
			phone,
			start,
			limit,
			total,
			info: user,
			messages: _.map(messages, m => parseMessage(m)),
		},
	};

	return msg;
}

async function login(phone) {
	const config = await models.Ott.findOne({ phone, telegram: true });
	if (!config) {
		throw new ThrowReturn(`Số điện thoại ${phone} không được hỗ trợ!`);
	}

	const api = apis[phone] || (apis[phone] = new API(phone, config.telegramInfo));

	const msg = {
		type: LOGIN,
		sender: phone,
	};

	const { url } = await api.getLoginToken();
	msg.data = {
		qrKey: url,
		phoneNumber: phone,
		loginId: phone,
	};

	return msg;
}

async function loginStatus(loginId) {
	const api = apis[loginId];
	if (!api) {
		throw new ThrowReturn(`Số điện thoại ${loginId} chưa được đăng nhập!`);
	}

	const user = await api.me();
	if (!user) {
		throw new ThrowReturn(`Số điện thoại ${loginId} chưa được đăng nhập!`);
	}

	const msg = {};
	return msg;
}

/**
 *
 * Kiểm tra đăng nhập
 * @param {string} phone phone number
 * @returns
 */
async function checkLogin(phone) {
	if (!apis[phone]) throw new ThrowReturn(`Số điện thoại ${phone} chưa được đăng nhập!`);

	const data = {
		sender: phone,
		type: CHECK_LOGIN,
		data: {
			info: apis[phone].userInfo,
			loggedIn: !!apis[phone].userInfo,
		},
	};

	return data;
}

async function checkExists(sender, phone, recheck) {
	const api = getApi(sender);

	const data = await api.checkExists(phone, recheck);
	const msg = {
		error_code: 0,
		sender: sender.phone,
		type: CHECK_EXISTS,
		data,
	};

	return msg;
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
	sendMessage,
	getMessages,
	login,
	loginStatus,
	checkExists,
	checkLogin,
	addReceiveMessageHandle,
	removeReceiveMessageHandle,
	connect,
	getStats,
	getMessage,
	findUserByPhone,
};

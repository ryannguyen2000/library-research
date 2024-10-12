const fs = require('fs');

const ThrowReturn = require('@core/throwreturn');
const { OTTs } = require('@utils/const');
const { logger } = require('@utils/logger');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');
const messagerService = require('@services/facebook/messager');
const { CMD_TYPE } = require('@services/facebook/messager/const');
const { parseResources } = require('@services/facebook/messager/utils');
const models = require('@models');

const OTT_NAME = OTTs.Facebook;

/**
 * @type {[HandleCallbackFunction, thisArgs][]}
 */
const _ReceiveMessageHandle = [];

function connect() {
	messagerService.loadPages();
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

ottEventEmitter.on(OTT_EVENTS.MESSAGE_RECEIVED_FB, onMessage);

function onMessage(message) {
	if (message.type === CMD_TYPE.FB_SENT) {
		onFacebookSent(message);
	}
}

async function createResourceCrawlers(msg) {
	try {
		const resouces = parseResources(msg);

		if (resouces.length) {
			await resouces.asyncMap(resouce =>
				models.FileCrawler.updateOne(
					{
						from: OTT_NAME,
						url: resouce.url,
					},
					{
						$set: {
							fileName: resouce.fileName,
						},
						$setOnInsert: {
							done: false,
							retried: 0,
							localPath: resouce.localPath,
						},
					},
					{
						upsert: true,
					}
				)
			);
		}
	} catch (e) {
		logger.error('createResourceCrawlers', OTT_NAME, msg);
	}
}

function onFacebookSent(msg) {
	_ReceiveMessageHandle.forEach(([callback, thisArgs]) => {
		if (callback && typeof callback === 'function') {
			createResourceCrawlers(msg.data.message);

			msg.data.message.ottId = `${msg.data.info.psid}_${msg.data.info.pageId}`;
			msg.data.info.name = [msg.data.info.first_name, msg.data.info.last_name].filter(s => s).join(' ');

			callback.call(thisArgs, msg.data.message, OTT_NAME, msg);
		} else {
			logger.error('Handle error', callback);
		}
	});
}

function getPage(pageId) {
	const page = messagerService.getPage(pageId);
	if (!page) {
		throw new ThrowReturn(`Không tìm thấy pageId ${pageId}`);
	}
	return page;
}

async function sendMessage(sender, thread = '', text = '', attachments) {
	try {
		const [psid, pageId] = thread.split('_');
		const page = getPage(pageId);

		const data = await page.postMessage({
			psid,
			text,
			attachments,
		});

		const msg = {
			sender: pageId,
			data,
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

async function getMessages(sender, thread = '', start = 0, limit = 15) {
	const [psid, pageId] = thread.split('_');
	const page = getPage(pageId);

	const data = await page.getMessages({ psid, start, limit });

	const msg = {
		sender: pageId,
		data,
	};
	return msg;
}

async function checkExists(sender, thread, recheck) {
	const [psid, pageId] = thread.split('_');
	const page = getPage(pageId);

	const data = await page.checkExists({ psid, recheck });

	const msg = {
		sender: pageId,
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
	checkExists,
	addReceiveMessageHandle,
	removeReceiveMessageHandle,
	connect,
	getStats: messagerService.getStats,
	getMessage: messagerService.getMessage,
};

const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const fs = require('fs');
const { customAlphabet } = require('nanoid');

const { URL_CONFIG } = require('@config/setting');
const ThrowReturn = require('@core/throwreturn');
const { BookingStatus, RuleDay, VirtualBookingPhone, LocalOTAs, OTTs } = require('@utils/const');
const parseUri = require('@utils/uri');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');
const { logger } = require('@utils/logger');
const oa = require('@services/zalo/OA');
const { parseResources, parseMessage } = require('@services/zalo/OA/helper');
const models = require('@models');

const OTT_NAME = OTTs.ZaloOA;
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

function connect() {}

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

function onMessageReceived(sender, user, message) {
	if (!message) return;

	const info = _.get(user, 'data') || {};
	const msg = {
		...parseMessage(message),
		ottId: user.user_id,
		info: {
			...info,
			displayName: info.display_name || info.user_id,
		},
		phoneNumber: user.phone,
	};
	const data = {
		sender: sender.phone,
		message: msg,
	};

	createResourceCrawlers(message);

	_ReceiveMessageHandle.forEach(([callback, thisArgs]) => {
		if (typeof callback === 'function') {
			callback.call(thisArgs, data.message, OTT_NAME, data);
		}
	});
}

ottEventEmitter.on(OTT_EVENTS.MESSAGE_RECEIVED_ZALO_OA, onMessageReceived);

// function parseMessage(message) {
// 	const rs = {
// 		message: message.message.text || '',
// 		messageId: message.msg_id,
// 		fromMe: message.from_me,
// 		time: message.timestamp,
// 		templateId: message.template_id,
// 		templateData: message.template_data,
// 	};

// 	if (message.event_name === 'user_send_business_card') {
// 		rs.message += `\n${_.map(message.message.attachments, 'payload.description').join('\n')}`;
// 		rs.image_attachment_url = _.map(message.message.attachments, 'payload.thumbnail');
// 	} else {
// 		rs.image_attachment_url = _.compact(
// 			_.map(message.message.attachments, (m, index) => {
// 				if (m.type === 'location') {
// 					rs.message += [
// 						`Đã gửi vị trí`,
// 						`https://www.google.com/maps/search/${m.payload.coordinates.latitude},+${m.payload.coordinates.longitude}?entry=tts&shorturl=1`,
// 					].join('\n');
// 				} else {
// 					const localAttachment = _.get(message.local_attachments, index);
// 					return localAttachment ? `${URL_CONFIG.SERVER}${localAttachment}` : _.get(m, 'payload.url');
// 				}
// 			})
// 		);
// 	}

// 	return rs;
// }

async function sendMessage(sender, userId, text, attachments) {
	try {
		const rs = await oa.sendMessage(sender, userId, text, attachments);

		const msg = {
			sender: sender.phone,
			data: {
				messageId: rs.message_id,
			},
		};

		return msg;
	} catch (e) {
		throw new ThrowReturn(e);
	} finally {
		_.forEach(attachments, f => {
			if (f.localPath) fs.unlink(f.localPath, () => {});
		});
	}
}

async function getMessages(sender, userId, start = 0, limit = 15) {
	const { messages, user, total } = await oa.getMessages(sender, userId, start, limit).catch(e => {
		throw new ThrowReturn(e);
	});

	const response = {
		sender: sender.phone,
		data: {
			userId,
			start,
			limit,
			total,
			info: user,
			messages: _.map(messages, m => parseMessage(m)),
		},
	};

	return response;
}

async function login(sender) {
	const msg = {
		sender,
		data: {
			oAuthUrl: '',
		},
	};

	return msg;
}

async function checkExists(sender, userId, recheck) {
	const info = await oa.checkExists(sender, userId, recheck).catch(e => {
		throw new ThrowReturn(e);
	});

	const msg = {
		sender: sender.phone,
		data: {
			userId,
			exists: true,
			// exists: !!info,
			error_code: 0,
			info,
		},
	};

	return msg;
}

async function getTemplates({ sender }) {
	// const data = await oa.getZNSTemplates(sender);

	// const bulks = _.map(data, t => ({
	// 	updateOne: {
	// 		filter: {
	// 			ottName: OTT_NAME,
	// 			templateId: t.templateId,
	// 		},
	// 		update: {
	// 			$set: t,
	// 		},
	// 		upsert: true,
	// 	},
	// }));
	// if (bulks.length) {
	// 	await models.OttTemplate.bulkWrite(bulks);
	// }

	const templates = await models.OttTemplate.find({ active: true, ottName: OTT_NAME, ottId: sender._id });

	return { data: templates };
}

function getTemplateParams(booking, guest, payment) {
	const templateParams = {
		order_code: booking.otaBookingId,
		customer_name: guest.fullName || guest.name || guest.displayName,
		payment_status: payment.amount ? 'Chưa thanh toán' : 'Đã thanh toán',
		cost: !booking.isRatePaid() || _.values(LocalOTAs).includes(booking.otaName) ? payment.totalPrice : 0,
		check_in: `${RuleDay.from} ${moment(booking.from).format('DD/MM/YYYY')}`,
		check_out: `${RuleDay.to} ${moment(booking.to).format('DD/MM/YYYY')}`,
		branch: booking.blockId.info.name,
		address: booking.blockId.info.address,
		note: 'mọi thắc mắc vui lòng liên hệ tại khung nhắn tin bên dưới',
	};

	return templateParams;
}

async function getTemplateData(messageId, guestId) {
	const booking = await models.Booking.findOne({
		messages: messageId,
		status: BookingStatus.CONFIRMED,
	}).populate('blockId', 'info.name info.address');
	if (!booking) {
		throw new ThrowReturn('Không tìm thấy đặt phòng nào!');
	}

	const guest = await models.Guest.findById(guestId);
	if (!guest || !guest.phone) {
		throw new ThrowReturn('Không tìm thấy thông tin khách hàng!');
	}
	if (VirtualBookingPhone.some(vrp => guest.phone.includes(vrp))) {
		throw new ThrowReturn('Số điện thoại không hợp lệ!');
	}
	const payment = await models.Booking.getPayment(booking);
	const params = getTemplateParams(booking, guest, payment);

	return {
		params,
		booking,
		guest,
	};
}

async function getTemplate({ id, messageId, guestId }) {
	const query = {
		ottName: OTT_NAME,
		active: true,
	};
	if (mongoose.Types.ObjectId.isValid(id)) {
		query._id = id;
	} else {
		query.templateId = id;
	}

	const template = await models.OttTemplate.findOne(query);
	if (!template) {
		throw new ThrowReturn('Không tìm thấy template!');
	}

	const rs = {
		template,
	};

	if (messageId && guestId) {
		const { params } = await getTemplateData(messageId, guestId);
		rs.params = params;
	}

	return rs;
}

async function sendTemplate(sender, templateId, messageId, guestId) {
	const template = await models.OttTemplate.findOne({ _id: templateId, ottName: OTT_NAME, active: true });
	if (!template) {
		throw new ThrowReturn('Không tìm thấy template!');
	}

	const { booking, guest, params } = await getTemplateData(messageId, guestId);

	const options = {
		phone: guest.phone,
		template_id: template.templateId,
		template_data: params,
		tracking_id: booking.otaBookingId,
	};

	const data = await oa.sendZNSTemplate(sender, template, _.get(guest.ottIds, OTT_NAME), options).catch(e => {
		throw new ThrowReturn(e);
	});

	const msg = {
		sender: sender.phone,
		phone: guest.phone,
		data: {
			message: data.message.text,
			messageId: data.msg_id,
			time: new Date(data.timestamp),
			otaBookingId: booking.otaBookingId,
			otaName: booking.otaName,
		},
	};

	return msg;
}

async function getOauthUrl({ appId }) {
	const oaConfig = await models.Ott.findOne({ active: true, zalo_oa: true, 'zalo_oaInfo.appId': appId });

	const redirectUri = `${URL_CONFIG.SERVER}/hook/zalo/oauth`;
	const codeChallenger = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')(43);

	oaConfig.set('zalo_oaInfo.oauthState', codeChallenger);
	await oaConfig.save();

	const url = parseUri(`https://oauth.zaloapp.com/v4/oa/permission`, {
		redirect_uri: redirectUri,
		app_id: oaConfig.zalo_oaInfo.appId,
		// code_challenge: codeChallenger,
		state: codeChallenger,
	});

	return {
		url,
		redirectUri,
	};
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
	addReceiveMessageHandle,
	removeReceiveMessageHandle,
	connect,
	getTemplates,
	getTemplate,
	sendTemplate,
	getOauthUrl,
	getStats: oa.getStats,
	getMessage: oa.getMessage,
	findUserByPhone: oa.findUserByPhone,
};

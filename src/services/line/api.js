const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const { v4: uuid } = require('uuid');

const { URL_CONFIG, OTT_CONFIG } = require('@config/setting');
const { checkFolder } = require('@utils/file');
const { logger } = require('@utils/logger');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');
const { Message, User } = require('./database');
const { removeFile, getFileType } = require('./utils');
const { CMD_TYPE } = require('./const');

function emitData(message) {
	ottEventEmitter.emit(OTT_EVENTS.MESSAGE_RECEIVED_LINE, message);
}

class API {
	constructor(config) {
		this.client = new line.Client({
			channelAccessToken: config.channelAccessToken,
			channelSecret: config.channelSecret,
		});
		this.config = config;
	}

	async checkExists(msg) {
		const { id, type } = msg;

		const info = await User().findOne({ userId: msg.data.userId, appId: this.config.channelId }, { _id: 0 });

		const response = {
			id,
			error_code: 0,
			error_msg: '',
			type,
			data: { exists: !!info, userId: msg.data.userId, info },
		};
		return response;
	}

	getProfileFromDatabase(userId) {
		return User().findOne({ userId, appId: this.config.channelId }, { _id: 0 });
	}

	// eslint-disable-next-line class-methods-use-this
	getFormatMediaType({ type, fileName }) {
		switch (type) {
			case 'image':
				return '.jpg';
			case 'video':
				return '.mp4';
			case 'audio':
				return '.m4a';
			case 'file':
				return path.extname(fileName);
			default:
				return '';
		}
	}

	async getLineEvent(event) {
		logger.info('received line event', JSON.stringify(event));

		if (!event.message) return;

		const { id: messageId, text } = event.message;
		const { userId } = event.source;
		const time = new Date(event.timestamp).toJSON();
		const info = await this.getProfile(userId);
		const msg = {
			userId,
			messageId,
			fromMe: false,
			time,
			message: text,
		};
		const data = {
			info,
			message: { ...msg, ottId: userId },
		};
		const res = {
			error_code: 0,
			error_msg: '',
			data,
			type: CMD_TYPE.LINE_SENT,
			sender: this.config.channelId,
		};

		if (this.getFormatMediaType(event.message)) {
			await this.handleEventType(
				event.message,
				userId,
				this.getFormatMediaType(event.message),
				new Date(event.timestamp)
			)
				.then(async url => {
					await this.saveNewMessage({ ...msg, image_attachment_url: [url] });
					emitData(res);
				})
				.catch(err => {
					logger.error(err);
				});
		} else {
			await this.saveNewMessage(msg);
			emitData(res);
		}
	}

	async getMessages(msg) {
		const { id, type } = msg;
		const { start = 0, limit = 20, userId } = msg.data;

		const info = await this.getProfile(userId);

		const cursor = Message().find({ userId, appId: this.config.channelId }, { _id: 0 });

		const total = await cursor.count();
		const messages = await cursor.sort({ time: -1 }).skip(start).limit(limit).toArray();

		const response = {
			id,
			error_code: 0,
			error_msg: '',
			type,
			data: {
				info,
				total,
				start,
				limit,
				messages: messages.reverse(),
			},
		};
		return response;
	}

	saveNewMessage(message) {
		return Message().insertOne({
			...message,
			dateString: message.time && new Date(message.time).toDateMysqlFormat(),
			appId: this.config.channelId,
		});
	}

	async getProfile(userId) {
		let info = await this.getProfileFromDatabase(userId);
		if (!info) {
			info = await this.client.getProfile(userId);
			info.userId = userId;
			info.appId = this.config.channelId;
			await User().insertOne(info);
		}
		return info;
	}

	async handleEventType(message, userId, extName, time) {
		if (message.contentProvider.type === 'line') {
			const isNewDir = time >= OTT_CONFIG.DATE_NEW_DIR;
			const dpath = `line/${isNewDir ? `${moment(time).format('YYYY/MM/DD')}/` : ''}${userId}`;
			const folderPath = `${OTT_CONFIG.STATIC_RPATH}/${dpath}`;

			const fileName = `${message.id}${extName}`;
			const localPath = await this.downloadContent(message.id, folderPath, fileName);

			return localPath && `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${dpath}/${fileName}`;
		}
	}

	async downloadContent(messageId, folderPath, fileName) {
		try {
			folderPath = await checkFolder(folderPath);
			return new Promise((resolve, reject) => {
				this.client
					.getMessageContent(messageId)
					.then(stream => {
						const writable = fs.createWriteStream(`${folderPath}/${fileName}`);
						stream.pipe(writable);
						stream.on('end', () => resolve(`${folderPath}/${fileName}`));
						stream.on('error', reject);
					})
					.catch(e => {
						logger.error(e);
						reject(e.message);
					});
			});
		} catch (error) {
			logger.error(error);
		}
	}

	async sendMessage({ text, attachments, userId }) {
		const msg = {
			userId,
			messageId: uuid(),
			fromMe: true,
			time: new Date().toJSON(),
		};

		if (attachments && attachments.length) {
			msg.image_attachment_url = [];

			await attachments.asyncForEach(async file => {
				try {
					const [type] = getFileType(file.type);
					await this.sendMessageToLineUser(userId, type, file.url);
					msg.image_attachment_url.push(file.url);
				} catch (e) {
					removeFile(file.localPath);
					return Promise.reject(e);
				}
			});
		} else {
			await this.sendMessageToLineUser(userId, 'text', text);
			msg.message = text;
		}

		await this.saveNewMessage(msg);
		return msg;
	}

	sendMessageToLineUser(userId, type, payload) {
		return this.client.pushMessage(userId, {
			type,
			text: payload,
			originalContentUrl: payload,
			previewImageUrl: payload,
		});
	}
}

module.exports = API;

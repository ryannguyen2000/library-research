/* eslint-disable class-methods-use-this */
const _ = require('lodash');
const fs = require('fs');
const { customAlphabet } = require('nanoid');
const AsyncLock = require('async-lock');
const arraybuffer = require('base64-arraybuffer');
const MTProto = require('@mtproto/core');

const { logger } = require('@utils/logger');
const { OTT_EVENTS, ottEventEmitter } = require('@utils/events');
const { DataBase } = require('./database');
const CustomStorage = require('./storage');
const { saveFile, getFileLocation, getInputMediaUploadedDocument } = require('./helper');

const randomId = () => Number(customAlphabet('0123456789', 16)());
const MAX_RETRY = 2;

const fileLocker = new AsyncLock();

class API {
	constructor(account, config) {
		const storage = new CustomStorage(account);
		this.mtproto = new MTProto({
			api_id: config.api_id,
			api_hash: config.api_hash,
			test: config.test,
			storageOptions: {
				instance: storage,
			},
		});
		this.account = account;
		this.config = config;
		this.db = new DataBase(account);
		this.me();

		this.mtproto.updates.on('updateShort', this.onUpdateShort.bind(this));
		this.mtproto.updates.on('updateShortSentMessage', this.onEvent.bind(this));
		this.mtproto.updates.on('updateShortChatMessage', this.onEvent.bind(this));
		this.mtproto.updates.on('updateShortMessage', this.onUpdateShortMessage.bind(this));
		this.mtproto.updates.on('updates', this.onUpdates.bind(this));
	}

	onEvent(data) {
		logger.info('onEvent:', this.account, data);
	}

	async onUpdateShortMessage(data) {
		try {
			// logger.info('updateShortMessage:', this.account, data);
			// {
			// 	_: 'updateShortMessage',
			// 	flags: 0,
			// 	out: false,
			// 	mentioned: false,
			// 	media_unread: false,
			// 	silent: false,
			// 	id: 53,
			// 	user_id: '1154896770',
			// 	message: 'Hi',
			// 	pts: 81,
			// 	pts_count: 1,
			// 	date: 1656404766
			//   }
			if (data._ === 'updateShortMessage') {
				const messages = await this.getRemoteMessages([data.id]);
				if (messages.users && messages.users.length) {
					await messages.users
						.filter(user => !user.self)
						.asyncMap(user => this.syncMessagesToDB(user, messages.messages));
				}
			}
		} catch (e) {
			logger.error(this.account, e);
		}
	}

	async onUpdates(data) {
		try {
			// logger.info('updates:', JSON.stringify(data, '', 4));

			if (data.users) {
				const updateMessages = _.filter(data.updates, u => u._ === 'updateNewMessage').map(u => u.message);
				await data.users
					.filter(user => !user.self)
					.asyncMap(user => this.syncMessagesToDB(user, updateMessages));

				return updateMessages;
			}
		} catch (e) {
			logger.error(this.account, e);
		}
	}

	async onUpdateShort(data) {
		try {
			const action = _.get(data, 'update._');
			if (action === 'updateUserStatus') return;

			// logger.info('updateShort:', data);
			if (action === 'updateLoginToken') {
				const res = await this.call('auth.exportLoginToken', {
					except_ids: [],
				});
				if (res._ === 'auth.loginTokenMigrateTo') {
					logger.info('loginTokenMigrateTo', res);
					// todo handle importToken
					await this.mtproto.storage.set('defaultDcId', res.dc_id);
					await this.call(
						'auth.importLoginToken',
						{
							token: res.token,
						},
						{
							dcId: res.dc_id,
						}
					);
				}
			}
		} catch (e) {
			logger.error(this.account, e);
		}
	}

	async call(method, params, options = {}, retry = 0) {
		try {
			const result = await this.mtproto.call(method, params, options);
			return result;
		} catch (error) {
			if (retry < MAX_RETRY) {
				if (error.error_code === 420) {
					const seconds = Number(error.error_message.split('FLOOD_WAIT_')[1]);
					await Promise.delay(seconds * 1000);
					return this.call(method, params, options);
				}
				if (options.dcId && error.error_code === 401) {
					// await this.mtproto.syncAuth(options.dcId);
					const exportAuth = await this.call('auth.exportAuthorization', {
						dc_id: options.dcId,
					});
					await this.call(
						'auth.importAuthorization',
						{
							id: exportAuth.id,
							bytes: exportAuth.bytes,
						},
						{
							dcId: options.dcId,
						}
					);
					// console.log('importAuth', exportAuth);
					return this.call(method, params, options, retry + 1);
				}
			}

			logger.error(`${method} ${this.account}`, error);
			return Promise.reject(error);
		}
	}

	getRemoteMessages(msgIds) {
		return this.call('messages.getMessages', {
			id: msgIds.map(id => ({
				_: 'inputMessageID',
				id,
			})),
		});
	}

	async getLoginToken() {
		const loginToken = await this.call('auth.exportLoginToken', {
			except_ids: [],
		});
		const encodedToken = arraybuffer.encode(loginToken.token);
		const url = `tg://login?token=${encodedToken}`;

		return {
			url,
			token: encodedToken,
		};
	}

	async me() {
		try {
			const accountInfo = await this.call('users.getFullUser', {
				id: {
					_: 'inputUserSelf',
				},
			});
			return accountInfo;
		} catch (error) {
			logger.error('Init telegram error', this.account, error);
			return null;
		}
	}

	async checkExists(phone, recheck) {
		const data = {
			phone,
			exists: false,
			error_code: 0,
		};

		try {
			const userInDB = await this.db.findUser(phone);
			if (userInDB) {
				data.exists = userInDB.exists;
				data.info = userInDB.info;
			}

			if (!data.exists || recheck) {
				const res = await this.call('contacts.resolvePhone', {
					phone: _.get(userInDB, 'phone') || phone,
				});
				const user = _.get(res, 'users[0]');
				if (!user) {
					throw new Error('Không tìm thấy thông tin người dùng!');
				}
				data.exists = true;
				data.info = user;
				data.update = true;
			}
		} catch (e) {
			data.error_code = e.error_code === 400 ? 0 : 1;
			data.error_msg = e.error_message || e;
		}

		if (data.update) {
			await this.db.createOrUpdateUser(phone, data.info);
		}

		if (data.info && recheck) {
			logger.info('telegram syncMessages', data.info);
			await this.syncMessages(data.info);
		}

		return data;
	}

	async getFile(phone, message) {
		try {
			const location = getFileLocation(message.media);
			if (!location) return;

			if (fileLocker.isBusy(message.id.toString())) {
				logger.info('telegram getFile is locked', message);
				return;
			}

			return await fileLocker.acquire(message.id.toString(), async () => {
				const dcId = _.get(message.media, 'photo.dc_id') || _.get(message.media, 'document.dc_id');

				logger.info('telegram start getFile', message, dcId);

				const file = await this.call(
					'upload.getFile',
					{
						precise: 1,
						cdn_supported: 0,
						location,
						offset: 0,
						limit: 1048576,
					},
					{
						dcId,
					}
				);

				logger.info('telegram end getFile', message, file);

				if (file.bytes) {
					const url = await saveFile(this.account, phone, location.id, file, message);
					return url;
				}
			});
		} catch (e) {
			logger.error('telegram getFile', message, e);
			return null;
		}
	}

	uploadFileParts(files) {
		return files.asyncMap(async file => {
			const id = randomId();
			const part = 0;
			const buffer = await fs.promises.readFile(file.localPath);

			const success = await this.call('upload.saveFilePart', {
				file_id: id,
				file_part: part,
				bytes: buffer,
			});
			if (!success) return;

			return { ...file, id, parts: 1 };
		});
	}

	async sendFiles(user, attachments, message) {
		const files = await this.uploadFileParts(attachments);
		// console.log(files);

		if (!files.length) return;

		const peer = {
			_: 'inputPeerUser',
			user_id: user.info.id,
			access_hash: user.info.access_hash,
		};
		if (files.length === 1) {
			const file = files[0];
			return this.call('messages.sendMedia', {
				peer,
				message,
				silent: false,
				background: false,
				clear_draft: false,
				random_id: randomId(),
				media: getInputMediaUploadedDocument(file),
			});
		}
		return this.call('messages.sendMultiMedia', {
			peer,
			silent: false,
			background: false,
			clear_draft: false,
			multi_media: files.map(file => ({
				_: 'inputSingleMedia',
				random_id: randomId(),
				message,
				entities: [],
				media: getInputMediaUploadedDocument(file),
			})),
		});
	}

	sendText(user, message) {
		const peer = {
			_: 'inputPeerUser',
			user_id: user.info.id,
			access_hash: user.info.access_hash,
		};
		return this.call('messages.sendMessage', {
			peer,
			message,
			clear_draft: true,
			random_id: randomId(),
		});
	}

	emitData(...params) {
		ottEventEmitter.emit(OTT_EVENTS.MESSAGE_RECEIVED_TELE, this.account, ...params);
	}

	async syncMessagesToDB(user, messages) {
		await this.db.createOrUpdateUser(user.phone, user);

		if (!messages.length) return;

		const { upsertedMessages } = await this.db.writeMessages(user, messages);
		if (upsertedMessages && upsertedMessages.length) {
			this.emitData(user, upsertedMessages[0]);
		}
	}

	async syncMessages(user, params) {
		const LIMIT = 100;
		const MAX_PAGE = 10;

		params = params || {};
		params.add_offset = params.add_offset || 0;
		params.limit = params.limit || LIMIT;

		const history = await this.call('messages.getHistory', {
			peer: {
				_: 'inputPeerUser',
				user_id: user.id,
				access_hash: user.access_hash,
			},
			...params,
		});

		const newUser = _.find(history.users, u => u.id === user.id);
		_.assign(user, newUser);
		await this.syncMessagesToDB(user, history.messages);

		if (history.count > params.add_offset + LIMIT && params.add_offset / LIMIT < MAX_PAGE) {
			return this.syncMessages(user, { ...params, add_offset: params.add_offset + LIMIT });
		}
	}

	async getMessages(phone, start = 0, limit = 20) {
		const user = await this.db.findUser(phone);
		if (!user) {
			return Promise.reject(`User ${phone} not found!`);
		}

		const { messages, total } = await this.db.findMessages(user.userId, { start, limit });

		const messageMedia = messages.filter(m => m.message.media && !m.mediaUrl);
		if (messageMedia.length) {
			messageMedia
				.asyncMap(async m => {
					const mediaUrl = await this.getFile(phone, m.message);
					if (mediaUrl) {
						m.mediaUrl = mediaUrl;
						return this.db.updateMessage(m._id, {
							mediaUrl,
						});
					}
				})
				.catch(e => {
					logger.error(e);
				});
		}

		return { user, messages, total, start, limit };
	}

	async sendMessage(phone, message, attachments) {
		const user = await this.db.findUser(phone);
		if (!user) {
			return Promise.reject(`User ${phone} not found!`);
		}

		const rs =
			attachments && attachments.length
				? await this.sendFiles(user, attachments, message)
				: await this.sendText(user, message);

		if (rs._ === 'updates') {
			const [updateMessage] = await this.onUpdates(rs);
			return updateMessage;
		}

		if (rs.id) {
			await this.syncMessages(user.info, { min_id: rs.id - 1 });
		}
		return rs;
	}
}

module.exports = API;

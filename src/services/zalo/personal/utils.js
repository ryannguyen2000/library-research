const _ = require('lodash');
const path = require('path');
const moment = require('moment');

const { OTT_CONFIG, URL_CONFIG } = require('@config/setting');
const { ZALO_TYPE, ZALO_CONFIG, OTT_NAME } = require('./const');
const { Message } = require('./database');

function safeParseJSON(txt) {
	try {
		return JSON.parse(txt);
	} catch (e) {
		return undefined;
	}
}

function parseUserInfo(info) {
	if (!info) {
		return info;
	}

	info.avatar = _.get(info, 'avatar', '').replace(/^\/\//, 'https://');
	info.name = _.get(info, 'displayName');
	return info;
}

function parseMessage(msg) {
	if (!msg) return '';
	const extra = {};
	let message = '';
	const image_attachment_url = [];
	const attachments = [];

	switch (msg.msgType) {
		case ZALO_TYPE.MSG_VOICE:
		case ZALO_TYPE.CLI_MSG_TYPE_VOICE:
			message = '[Tin nhắn thoại]';
			image_attachment_url.push(_.get(msg, 'message.href'));
			break;

		case ZALO_TYPE.MSG_TEXT:
		case ZALO_TYPE.CLI_MSG_TYPE_TEXT:
			message = msg.message || '[Tin nhắn chưa hỗ trợ ở phiên bản hiện tại]';
			break;

		case ZALO_TYPE.MSG_PHOTO:
		case ZALO_TYPE.CLI_MSG_TYPE_PHOTO:
		case ZALO_TYPE.MSG_GIF:
		case ZALO_TYPE.CLI_MSG_TYPE_GIF:
			message = msg.message.title;
			image_attachment_url.push(msg.message.oriUrl);
			break;

		case ZALO_TYPE.MSG_CONTACT:
		case ZALO_TYPE.CLI_MSG_TYPE_CONTACT: {
			const action = _.get(msg.message, 'action');
			if (action === 'recommened.misscall') {
				message = _.get(msg, 'message.title');
			} else if (action === 'recommened.link') {
				message = _.get(msg, 'message.title') || msg.message;
				attachments.push({
					...msg.message,
					url: _.get(msg, 'message.thumb'),
				});
			} else if (action === 'recommened.user') {
				const data = safeParseJSON(_.get(msg, 'message.description'));
				message = _.compact([
					_.get(msg, 'message.title'),
					(_.get(data, 'phone') && `phone: ${data.phone}`) || (_.get(data, 'params') && `ID: ${data.params}`),
				]).join('\n');
				image_attachment_url.push(_.get(msg, 'message.thumb'));
			} else {
				attachments.push(msg.message);
			}
			break;
		}

		case ZALO_TYPE.MSG_STICKER:
		case ZALO_TYPE.MSG_STICKER_2:
		case ZALO_TYPE.CLI_MSG_TYPE_STICKER: {
			const sticker = ZALO_CONFIG.stickerUrl + msg.message.id;
			image_attachment_url.push(sticker);
			break;
		}
		case ZALO_TYPE.CLI_MSG_TYPE_LOCATION:
		case ZALO_TYPE.MSG_LOCATION: {
			attachments.push(msg.message);
			message = _.get(msg, 'message.desc');
			break;
		}
		case ZALO_TYPE.MSG_VIDEO:
		case ZALO_TYPE.CLI_MSG_TYPE_VIDEO:
			attachments.push({
				...msg.message,
				title: `${'[Video]'} ${_.get(msg, 'message.title')}`,
				url: _.get(msg, 'message.thumbUrl'),
			});
			image_attachment_url.push(_.get(msg, 'message.oriUrl'));
			break;
		case ZALO_TYPE.MSG_FILE:
		case ZALO_TYPE.CLI_MSG_TYPE_FILE:
			attachments.push({
				...msg.message,
				title: `${'[File]'} ${_.get(msg, 'message.title')}`,
			});
			image_attachment_url.push(_.get(msg, 'message.href'));
			break;
		case ZALO_TYPE.MSG_UNDO:
			message = '[Tin nhắn đã thu hồi]';
			break;
		case ZALO_TYPE.MSG_DEL_EVERYONE:
			message = '[Tin nhắn đã bị xóa]';
			break;

		case ZALO_TYPE.MSG_ECARD: {
			message = _.get(msg, 'message.description');
			extra.system = true;
			break;
		}

		default: {
			if (typeof msg.message === 'string') {
				message = msg.message;
			} else if (Array.isArray(msg.message)) {
				message = msg.message.map(m => `${m.title}\n${m.description}`).join('\n\n');
			} else {
				message = msg.message && (msg.message.title || msg.message.description);
			}

			break;
		}
	}

	const result = {
		fromMe: msg.fromUid === '0',
		message,
		messageId: msg.msgId,
		time: new Date(Number(msg.sendDttm)),
		serverTime: msg.serverTime,
		userId: msg.fromUid,
		msgType: msg.msgType,
		image_attachment_url,
		attachments,
		dName: msg.dName,
		toUid: msg.toUid,
		mentions: msg.mentions,
		quote: msg.quote,
		...extra,
	};

	return parseMessageUrl(result, msg);
}

function isSticker(url) {
	return _.includes(url, 'emoticon');
}

async function parseMessageUrl(message, { account, toUid, msgId }) {
	const isNewDir = message.time >= OTT_CONFIG.DATE_NEW_DIR;

	const userSourcePath = `${OTT_NAME}/${
		isNewDir ? `${moment(message.time).format('YYYY/MM/DD')}/` : ''
	}${account}/${toUid}`;

	if (message.image_attachment_url.length) {
		message.image_attachment_url = message.image_attachment_url.map((url, index) => {
			if (isSticker(url)) return url;

			const ottPath = `${userSourcePath}/${message.messageId}${getFileExt(
				url,
				message.msgType,
				_.get(message.attachments, index)
			)}`;
			return `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${ottPath}`;
		});
	}

	if (
		message.attachments &&
		message.attachments.length &&
		(message.msgType === ZALO_TYPE.MSG_VIDEO || message.msgType === ZALO_TYPE.CLI_MSG_TYPE_VIDEO)
	) {
		message.attachments
			.filter(a => a.url)
			.forEach(a => {
				if (isSticker(a.url)) return;
				const ottPath = `${userSourcePath}/${message.messageId}thumb${getFileExt(a.url, ZALO_TYPE.MSG_PHOTO)}`;
				a.url = `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${ottPath}`;
			});
	}

	if (message.quote && message.quote.attach) {
		const attach = safeParseJSON(message.quote.attach);

		if (attach) {
			const qTime = new Date(message.quote.ts);
			const isQNewDir = qTime >= OTT_CONFIG.DATE_NEW_DIR;
			const quotePath = `${OTT_NAME}/${
				isQNewDir ? `${moment(qTime).format('YYYY/MM/DD')}/` : ''
			}${account}/${toUid}`;

			let qmsgId = parseInt(message.quote.globalMsgId);
			if (!qmsgId) {
				const [qmsg] = await Message()
					.find({ cliMsgId: _.toString(message.quote.cliMsgId) }, { msgId: 1 })
					.limit(1)
					.toArray();

				if (qmsg) {
					qmsgId = qmsg.msgId;
					await Message().updateOne(
						{
							msgId,
						},
						{
							$set: {
								'quote.globalMsgId': qmsgId,
							},
						}
					);
				}
			}

			if (qmsgId && attach.href) {
				const ext = getFileExt(attach.href, null, attach);
				const ottPath = `${quotePath}/${qmsgId}${ext}`;
				attach.href = `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${ottPath}`;
			}
			if (qmsgId && attach.thumb) {
				const ext = getFileExt(attach.href, null, attach);
				const ottPath = `${quotePath}/${qmsgId}${ext === '.mp4' ? `thumb.jpg` : ext}`;
				attach.thumb = `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${ottPath}`;
				attach.thumbUrl = attach.thumb;
			}

			message.quote.attach = JSON.stringify(attach);
		}
	}

	return message;
}

function getFileExt(url, msgType, msg) {
	const ext = url && path.extname(url.split('?')[0]);

	if (ext === '.jxl') return '.jpg';
	if (ext) return ext;

	switch (msgType) {
		case ZALO_TYPE.MSG_VOICE:
		case ZALO_TYPE.CLI_MSG_TYPE_VOICE:
			return '.mp3';

		case ZALO_TYPE.MSG_PHOTO:
		case ZALO_TYPE.CLI_MSG_TYPE_PHOTO:
			return '.jpg';

		case ZALO_TYPE.MSG_GIF:
		case ZALO_TYPE.CLI_MSG_TYPE_GIF:
			return '.gif';

		case ZALO_TYPE.MSG_VIDEO:
		case ZALO_TYPE.CLI_MSG_TYPE_VIDEO:
			return '.mp4';

		default: {
			try {
				const params = msg && msg.params && JSON.parse(msg.params);
				const fileExt = _.get(params, 'fileExt');

				return fileExt ? `.${fileExt}` : _.get(params, 'duration') ? '.mp4' : '';
			} catch (e) {
				return '';
			}
		}
	}
}

function extName(url) {
	if (!url) return '';
	return path.extname(url.split('?')[0]);
}

function parseResources(msg) {
	const urls = [];

	if (!msg) return urls;

	switch (msg.msgType) {
		case ZALO_TYPE.MSG_VOICE:
		case ZALO_TYPE.CLI_MSG_TYPE_VOICE: {
			const url = _.get(msg, 'message.href', '');
			urls.push({
				url,
				ext: extName(url) || '.mp3',
			});
			break;
		}

		case ZALO_TYPE.MSG_PHOTO:
		case ZALO_TYPE.CLI_MSG_TYPE_PHOTO: {
			const url = _.get(msg, 'message.oriUrl', '');
			const thumbUrl = _.get(msg, 'message.thumbUrl', '');
			urls.push({
				url,
				ext: extName(url) || '.jpg',
			});
			urls.push({
				url: thumbUrl,
				ext: extName(thumbUrl) || '.jpg',
				keyName: '_t',
			});
			break;
		}

		case ZALO_TYPE.MSG_GIF:
		case ZALO_TYPE.CLI_MSG_TYPE_GIF: {
			const url = _.get(msg, 'message.oriUrl', '');
			urls.push({
				url,
				ext: extName(url) || '.gif',
			});
			break;
		}

		case ZALO_TYPE.MSG_VIDEO:
		case ZALO_TYPE.CLI_MSG_TYPE_VIDEO: {
			const oriUrl = _.get(msg, 'message.oriUrl', '');
			urls.push({
				url: oriUrl,
				ext: extName(oriUrl) || '.mp4',
			});
			const thumbUrl = _.get(msg, 'message.thumbUrl', '');
			urls.push({
				url: thumbUrl,
				ext: extName(thumbUrl) || '.jpg',
				keyName: 'thumb',
			});
			break;
		}
		case ZALO_TYPE.MSG_FILE:
		case ZALO_TYPE.CLI_MSG_TYPE_FILE: {
			const data = safeParseJSON(_.get(msg, 'message.params'));
			const url = _.get(msg, 'message.href', '');

			urls.push({
				url,
				ext:
					(data && data.fileExt ? `.${data.fileExt}` : '') ||
					extName(_.get(msg, 'message.href', '')) ||
					extName(_.get(msg, 'message.title')) ||
					extName(_.get(msg, 'message.thumb')) ||
					'',
			});

			break;
		}

		case ZALO_TYPE.MSG_CONTACT:
		case ZALO_TYPE.CLI_MSG_TYPE_CONTACT: {
			const url = _.get(msg, 'message.thumb');
			if (url) {
				urls.push({
					url,
					ext: extName(url) || '.jpg',
				});
			}

			break;
		}

		default:
			break;
	}

	if (!urls.length) return urls;

	const userId = _.get(msg, 'toUid');
	const msgId = _.get(msg, 'msgId');
	const time = new Date(Number(msg.sendDttm));
	const isNewDir = time >= OTT_CONFIG.DATE_NEW_DIR;

	const userSourcePath = `${OTT_NAME}/${isNewDir ? `${moment(time).format('YYYY/MM/DD')}/` : ''}${
		msg.account
	}/${userId}`;

	const filteredUrls = urls
		.filter(u => u && u.url)
		.map(({ url, keyName = '', ext = '' }) => ({
			url,
			localPath: `${OTT_CONFIG.STATIC_RPATH}/${userSourcePath}/${msgId + keyName + ext}`,
		}));

	if (filteredUrls.length) {
		// await createDirAsync(dirPath);
		// const paths = await Promise.all(
		// 	filteredUrls.map(async ([url, localPath]) => {
		// 		let fPath;
		// 		const exists = await isExists(localPath);
		// 		if (exists) {
		// 			fPath = localPath;
		// 		} else {
		// 			fPath = await download(url, localPath);
		// 		}
		// 		if (fPath) {
		// 			await Message().updateOne({ msgId }, { $addToSet: { localFiles: fPath } });
		// 		}
		// 		return fPath;
		// 	})
		// );
		// return paths;
	}

	return filteredUrls;
}

module.exports = {
	parseUserInfo,
	parseMessage,
	parseResources,
};

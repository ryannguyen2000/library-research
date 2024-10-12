const _ = require('lodash');
const moment = require('moment');
const { URL_CONFIG, OTT_CONFIG } = require('@config/setting');

// prettier-ignore
// const VideoExt = ['.webm', '.mkv', '.flv', '.flv', '.vob', '.ogv', '.ogg', '.drc', '.gif', '.gifv', '.mng', '.avi', '.MTS', '.M2TS', '.mov', '.qt', '.wmv', '.yuv', '.rm', '.rmvb', '.asf', '.amv', '.mp4', '.m4p', '.m4v', '.mpg', '.mp2', '.mpeg', '.mpe', '.mpv', '.mpg', '.mpeg', '.m2v', '.m4v', '.svi', '.3gp', '.3g2', '.mxf', '.roq', '.nsv', '.flv', '.f4v', '.f4p', '.f4a', '.f4b'];

// prettier-ignore
// const AudioExt = ['.3gp', '.aa', '.aac', '.aax', '.act', '.aiff', '.amr', '.ape', '.au', '.awb', '.dct', '.dss', '.dvf', '.flac', '.gsm', '.iklax', '.ivs', '.m4a', '.m4b', '.m4p', '.mmf', '.mp3', '.mpc', '.msv', '.nmf', '.nsf', '.ogg', '.oga', '.mogg', '.opus', '.ra', '.rm', '.raw', '.sln', '.tta', '.voc', '.vox', '.wav', '.wma', '.wv', '.webm', '.8svx'];

// prettier-ignore
// const ImageExt = ['jpeg', 'jpg', 'png', 'gif', 'tiff', 'psd', 'pdf', 'eps', 'ai', 'indd', 'raw'];

// async function saveFile(base64, fileName) {
// 	const today = new Date().toDateMysqlFormat();

// 	const file = await saveBase64File(
// 		base64,
// 		`${FB_CONFIG.WEBHOOK.RESOURCES_PATH}/${FB_CONFIG.WEBHOOK.RESOURCES_FOLDER}/${today}`,
// 		fileName
// 	);

// 	return `${URL_CONFIG.SERVER}/static/${FB_CONFIG.WEBHOOK.RESOURCES_FOLDER}/${today}/${file.fileName}`;
// }

function getFileType(mimeType) {
	if (mimeType.includes('image')) {
		return 'image';
	}
	if (mimeType.includes('audio')) {
		return 'audio';
	}
	if (mimeType.includes('video')) {
		return 'video';
	}

	return 'file';
}

// function isMedia(type) {
// 	const mediaTypes = ['audio', 'image', 'video', 'file', 'gif'];
// 	return mediaTypes.includes(type);
// }

// async function saveAttachments(message) {
// 	if (message.attachments && message.attachments.length) {
// 		const localAttachments = await message.attachments.asyncMap(async attachment => {
// 			if (!isMedia(attachment.type) || !_.get(attachment, 'payload.url')) return null;

// 			return downloadContentFromUrl(
// 				attachment.payload.url,
// 				`${OTT_CONFIG.STATIC_RPATH}/facebook/${message.pageId}/${message.psid}`
// 			)
// 				.then(localPath => `${message.pageId}/${message.psid}/${_.last(localPath.split('/'))}`)
// 				.catch(() => null);
// 		});

// 		return localAttachments;
// 	}

// 	return [];
// }

function getUrlAttachment(local) {
	return `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/facebook/${local}`;
}

function parseAttachment(attachment) {
	const type = getFileType(attachment.mime_type);
	let payload;

	if (type === 'image') {
		payload = attachment.image_data;
	} else if (type === 'video') {
		payload = attachment.video_data;
	} else {
		payload = attachment;
		payload.url = payload.url || attachment.file_url;
	}

	return {
		type,
		payload,
	};
}

const IGNORES_EXT = ['.php', '.js'];

function parseMessage(msg) {
	return {
		...msg,
		image_attachment_url: _.map(msg.attachments, attachment => {
			const url = _.get(attachment.payload, 'url') || attachment.url;
			if (url) {
				const fileName = _.last(url.split('?')[0].split('/'));

				if (IGNORES_EXT.some(ext => fileName.endsWith(ext))) {
					return;
				}

				const time = moment(msg.time);
				const isNewDir = time.toDate() >= OTT_CONFIG.DATE_NEW_DIR;
				const localUrl = `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/facebook/${
					isNewDir ? `${time.format('YYYY/MM/DD')}/` : ''
				}${msg.pageId}/${msg.psid}/${fileName}`;

				return localUrl;
			}
		}).filter(i => i),
	};
}

function parseResources(msg) {
	const localAttachments = _.map(msg.attachments, attachment => {
		const url = _.get(attachment.payload, 'url') || attachment.url;
		if (url) {
			const fileName = _.last(url.split('?')[0].split('/'));

			if (IGNORES_EXT.some(ext => fileName.endsWith(ext))) {
				return;
			}

			const time = moment(msg.time);
			const isNewDir = time.toDate() >= OTT_CONFIG.DATE_NEW_DIR;
			const localPath = `${OTT_CONFIG.STATIC_RPATH}/facebook/${isNewDir ? `${time.format('YYYY/MM/DD')}/` : ''}${
				msg.pageId
			}/${msg.psid}/${fileName}`;

			return {
				url,
				localPath,
			};
		}
	});

	return localAttachments.filter(i => i);

	//
	// const filteredUrls = urls
	// 	.filter(u => u && u.url)
	// 	// .map(({ url, keyName = '', ext = '' }) => [url, path.join(dirPath, msgId + keyName + ext)]);
	// 	.map(({ url, keyName = '', ext = '' }) => ({
	// 		url,
	// 		localPath: `${OTT_CONFIG.STATIC_RPATH}/${OTT_NAME}/${msg.account}/${userId}/${msgId + keyName + ext}`,
	// 	}));
}

module.exports = {
	// saveFile,
	getFileType,
	// saveAttachments,
	getUrlAttachment,
	parseAttachment,
	parseMessage,
	parseResources,
};

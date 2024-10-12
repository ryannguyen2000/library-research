const _ = require('lodash');
const path = require('path');
const moment = require('moment');

const { OTT_CONFIG, URL_CONFIG } = require('@config/setting');

function isMessageEvent(event_name) {
	// const messageEvents = [
	// 	'user_send_text',
	// 	'user_send_image',
	// 	'user_send_gif',
	// 	'user_send_link',
	// 	'user_send_audio',
	// 	'user_send_video',
	// 	'user_send_sticker',
	// 	'user_send_location',
	// 	'user_send_business_card',
	// 	'user_send_file',
	// 	'anonymous_send_text',
	// 	'anonymous_send_image',
	// 	'anonymous_send_gif',
	// 	'anonymous_send_link',
	// 	'anonymous_send_audio',
	// 	'anonymous_send_video',
	// 	'anonymous_send_sticker',
	// 	'anonymous_send_location',
	// 	'anonymous_send_business_card',
	// 	'anonymous_send_file',
	// ];

	const messageEvents = [
		'send_text',
		'send_image',
		'send_gif',
		'send_link',
		'send_audio',
		'send_video',
		'send_sticker',
		'send_location',
		'send_business_card',
		'send_file',
		// 'received_message',
	];

	return messageEvents.some(a => event_name.includes(a));
}

function isUserEvent(event_name) {
	return !event_name.startsWith('oa_') && !event_name.includes('received_message');
}

function isAnomymous(event_name) {
	return event_name.startsWith('anonymous_');
}

function sampleToAdvMessage(message, app_id) {
	if (message.type === 'nosupport' || (message.message && message.message.startsWith('query:'))) return;

	const from_me = message.src === 0;

	return {
		app_id,
		msg_id: message.message_id,
		user_id: from_me ? message.to_id : message.from_id,
		// event_name: 'user_send_file',
		sender: {
			id: message.from_id,
		},
		recipient: {
			id: message.to_id,
		},
		message: {
			// attachments: [
			// 	{
			// 		payload: {
			// 			size: '100225',
			// 			name: 'iPhone Nguyên Gốc-nhacchuong123.com.mp3',
			// 			checksum: 'b977896db0326bca69b139e1a8bc4cb0',
			// 			type: 'mp3',
			// 			url: 'https://zalo-file-dl1.zdn.vn/d374862dc96f27317e7e/2557071675504103637',
			// 		},
			// 		type: 'file',
			// 	},
			// ],
			text: message.message,
			msg_id: message.message_id,
		},
		timestamp: message.time,
		from_me,
		type: message.type,
	};
}

function getFileName({ type, payload }) {
	const fileName = _.last(payload.url.split('/'));

	if (type === 'video') {
		return path.extname(fileName) ? fileName : `${fileName}.mp4`;
	}
	if (type === 'gif') {
		return path.extname(fileName) ? fileName : `${fileName}.gif`;
	}
	if (type === 'file') {
		return path.extname(fileName) ? fileName : `${fileName}${path.extname(payload.name)}`;
	}

	return _.last(payload.url.split('/'));
}

// async function saveAttachments(message) {
// 	const attachments = _.get(message, 'message.attachments');

// 	if (attachments && attachments.length) {
// 		const localAttachments = await attachments.asyncMap(async attachment => {
// 			if (attachment.type === 'sticker' || attachment.type === 'link' || attachment.type === 'location')
// 				return null;

// 			const fileName = getFileName(attachment);

// 			return downloadContentFromUrl(
// 				attachment.payload.url,
// 				`${OTT_CONFIG.STATIC_RPATH}/zalo_oa/${message.app_id}/${message.user_id}`,
// 				fileName
// 			)
// 				.then(() => `${OTT_CONFIG.STATIC_PATH}/zalo_oa/${message.app_id}/${message.user_id}/${fileName}`)
// 				.catch(() => null);
// 		});

// 		return localAttachments;
// 	}

// 	return [];
// }

function getFileDir(msg, attachment) {
	const isNewDir = new Date(msg.timestamp) >= OTT_CONFIG.DATE_NEW_DIR;
	const fileName = getFileName(attachment);

	const filePath = `zalo_oa/${isNewDir ? `${moment(msg.timestamp).format('YYYY/MM/DD')}/` : ''}${msg.app_id}/${
		msg.user_id
	}/${fileName}`;

	return filePath;
}

function parseResources(msg) {
	const attachments = _.get(msg, 'message.attachments');

	const localAttachments = _.map(attachments, attachment => {
		if (attachment.type === 'sticker' || attachment.type === 'link' || attachment.type === 'location') return null;

		const url = _.get(attachment.payload, 'url');
		if (!attachment.payload.url) return null;

		const fileDir = getFileDir(msg, attachment);
		const localPath = `${OTT_CONFIG.STATIC_RPATH}/${fileDir}`;

		return {
			url,
			localPath,
		};
	});

	return localAttachments.filter(i => i);
}

function isUserId(id) {
	return !!id && id.length >= 16;
}

function parseMessage(message) {
	const rs = {
		message: message.message.text || '',
		messageId: message.msg_id,
		fromMe: message.from_me,
		time: message.timestamp,
		templateId: message.template_id,
		templateData: message.template_data,
	};

	if (message.event_name === 'user_send_business_card') {
		rs.message += `\n${_.map(message.message.attachments, 'payload.description').join('\n')}`;
		rs.image_attachment_url = _.map(message.message.attachments, 'payload.thumbnail');
	} else {
		rs.image_attachment_url = _.map(message.message.attachments, attachment => {
			if (attachment.type === 'location') {
				rs.message += [
					`Đã gửi vị trí`,
					`https://www.google.com/maps/search/${attachment.payload.coordinates.latitude},+${attachment.payload.coordinates.longitude}?entry=tts&shorturl=1`,
				].join('\n');
			} else {
				const fileDir = getFileDir(message, attachment);
				return `${URL_CONFIG.SERVER}${OTT_CONFIG.STATIC_PATH}/${fileDir}`;
			}
		}).filter(i => i);
	}

	return rs;
}

module.exports = {
	isMessageEvent,
	isUserEvent,
	isAnomymous,
	sampleToAdvMessage,
	isUserId,
	parseResources,
	parseMessage,
	// saveAttachments,
};

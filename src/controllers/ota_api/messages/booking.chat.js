const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
// const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const { MessageStatus, MessageUser } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const { getAuthMessage } = require('@controllers/ota_api/headers/booking');
// const { getBookingHeader } = require('@controllers/ota_api/header_helper');
// const { sendExtRequest } = require('@controllers/ota_helper');

const MAX_PAGE = 30;
const DEFAULT_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36';

function getMessageStatus(messages, message_id, threads, threadId) {
	const thread = threads.find(t => t.id === threadId);
	if (thread && (thread.topic === 'free_text' || thread.topic === 'email' || thread.status === 'pending_none'))
		return MessageStatus.NONE;

	return messages.find(m => m.message.in_reply_to === message_id) ? MessageStatus.NONE : MessageStatus.REQUEST;
}

async function getMessages(otaInfo, thread, before, page = 1) {
	const authJson = getAuthMessage(otaInfo);
	const json = {
		thread: {
			type: 'Contextual',
			id: thread.threadId,
			auth: authJson,
		},
		include_childs: '1',
		presentation: 'hotel_2',
		lang: 'vi',
	};
	if (before) {
		json.before = before;
	}

	const uri = `https://chat.booking.com/3/get_messages?json=${encodeURIComponent(JSON.stringify(json))}`;
	const fetchOpts = {
		method: 'GET',
		headers: {
			// 'Content-Type': 'application/json',
			'X-Booking-Csrf': otaInfo.token,
			'user-agent': DEFAULT_AGENT,
		},
	};

	const result = await fetchRetry(uri, fetchOpts, otaInfo);

	if (result && result.status !== 200) {
		logger.error('Booking get chat messages error', uri, result.status, await result.text());
		return [];
	}

	const messages = [];
	const data = await result.json();

	for (const post of data.messages) {
		if (post.message.type !== 'Event') {
			messages.push({
				user: post.sender.type === 'Hotel' ? MessageUser.ME : MessageUser.GUEST,
				time: new Date(post.time * 1000),
				image_attachment_url: (post.message.images && post.message.images.map(image => image.source)) || [],
				message: post.message.text
					? post.message.text
					: post.message.selected_options
							.reduce((text, msg) => {
								text += `\n${msg.caption} ${msg.input_value}`;
								return text;
							}, '')
							.trim(),
				reply: post.message.reply_options,
				status:
					post.sender.type === 'Hotel'
						? MessageStatus.NONE
						: getMessageStatus(data.messages, post.message_id, data.thread.childs, post.thread_id),
				messageId: post.message_id,
			});
		}
	}

	if (data.pages.before && page <= MAX_PAGE) {
		return [...(await getMessages(otaInfo, thread, data.pages.before, page + 1)), ...messages];
	}

	return messages;
}

async function getMsgConfig(propertyId, otaConfig) {
	try {
		const END_POINT = 'https://admin.booking.com/fresa/extranet';

		const uri = `${END_POINT}/messaging/get_config?hotel_id=${propertyId}&hotel_account_id=${otaConfig.other.accountId}&ses=${otaConfig.other.ses}`;

		const res = await fetchRetry(
			uri,
			{
				method: 'POST',
			},
			otaConfig
		);

		const json = await res.json();

		const intercomAuth = _.get(json.data, 'intercom_auth') || _.get(json.data, 'messagingConfig.intercomToken');

		if (intercomAuth) {
			otaConfig.set(
				'other.json',
				JSON.stringify({
					intercom_auth: intercomAuth,
				})
			);
			await otaConfig.save();
		}

		return intercomAuth;
	} catch (e) {
		logger.error('getMsgConfig error', propertyId, e);
	}
}

async function postMessage({ otaInfo, message, msg, propertyId, msgId, reply, retry = 0 }) {
	const authJson = getAuthMessage(otaInfo);
	const json = {
		thread: {
			type: 'Contextual',
			id: message.threadId,
			auth: authJson,
		},
		message: {
			type: 'ContextualMessage',
			sender: {
				channel: 'extranet',
				type: 'hotel',
				hotel_id: parseInt(propertyId),
			},
		},
	};

	let other = null;

	if (msgId && reply) {
		other = { in_reply_to: msgId, selected_options: reply };
		msg = reply
			.reduce((text, mess) => {
				text += `\n${mess.caption} ${mess.input_value || ''}`;
				return text;
			}, '')
			.trim();
	} else {
		other = {
			command: '/start',
			command_params: {
				entry_point: 'hotel_free_text_to_guest',
				hotelreservation_id: message.otaBookingId.toString(),
			},
			selected_options: [{ type: 'PlainText', input_value: msg }],
		};
	}

	json.message = { ...json.message, ...other };

	const uri = 'https://chat.booking.com/3/post_message';
	const fetchOpts = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Booking-Csrf': otaInfo.token,
			'user-agent': DEFAULT_AGENT,
		},
		body: JSON.stringify(json),
	};

	const result = await fetchRetry(uri, fetchOpts, otaInfo);

	let data;

	if (result.status !== 200) {
		if (retry === 0 && result.status === 401) {
			await getMsgConfig(propertyId, otaInfo);
			return postMessage({ otaInfo, message, msg, propertyId, msgId, reply, retry: retry + 1 });
		}

		logger.error('Booking postMessage error', result.status, await result.text());
		throw new ThrowReturn('Có lỗi xảy ra vui lòng thử lại sau!');
	} else {
		data = await result.json();
	}

	if (!data || !data.message_id) {
		logger.error('Booking postMessage error', data);
		throw new ThrowReturn('Có lỗi xảy ra vui lòng thử lại sau!');
	}

	return {
		message: msg,
		messageId: data.message_id,
		time: new Date(),
	};
}

module.exports = {
	getMessages,
	postMessage,
};

// const socketClient = require('socket.io-client');
const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const ThrowReturn = require('@core/throwreturn');

// const uriHelper = require('@utils/uri');

// const Limit = 50;
// const socketUri = 'https://beta-api.luxstay.net/chat/socket.io/';

// async function getContents(headers, threadId, limit = Limit) {
// 	const uri = `https://host.luxstay.net/api/chat/messages?limit=${limit}&conversation_id=${threadId}`;

// 	const result = await fetch(uri, {
// 		headers,
// 	});

// 	if (result && result.status !== 200) {
// 		logger.error('Luxstay get chat messages error', uri);
// 		return [];
// 	}

// 	const json = await result.json();

// 	if (json.total <= limit) return json.data;

// 	const remainContents = await getContents(headers, threadId, limit + Limit);
// 	return remainContents;
// }

// async function getMessages(otaInfo, threadId, guestId) {
// 	const headers = headerHelpers.getLuxstayHeader(otaInfo);
// 	const contents = await getContents(headers, threadId);
// 	const { senderId } = otaInfo.other;
// 	const messages = [];
// 	for (const data of contents) {
// 		messages.push({
// 			user: data.sender_id === senderId ? 'me' : 'guest',
// 			time: new Date(data.created_at),
// 			message: data.content,
// 			images: data.images ? (Array.isArray(data.images) ? data.images : [data.images]) : [],
// 		});
// 	}
// 	return messages;
// }

// async function request(url, options) {
// 	const result = await fetch(url, {
// 		headers: {
// 			accept: '*/*',
// 		},
// 		...options,
// 	});

// 	if (result.status !== 200) {
// 		logger.error('Luxstay polling error', url);
// 		throw new ThrowReturn('Luxstay chat error');
// 	}
// 	return result;
// }

// async function getSid(otaInfo) {
// 	const url = uriHelper(socketUri, {
// 		token: otaInfo.token,
// 		account_type: 'host',
// 		EIO: 3,
// 		transport: 'polling',
// 	});

// 	const result = await request(url);
// 	const text = await result.text();

// 	return JSON.parse(text.replace(/(\d*:\d*)/, '')).sid;
// }

// async function polling(otaInfo, sid) {
// 	const url = uriHelper(socketUri, {
// 		token: otaInfo.token,
// 		account_type: 'host',
// 		EIO: 3,
// 		transport: 'polling',
// 		sid,
// 	});

// 	await request(url);
// }

// async function joinRoom(otaInfo, sid, threadId) {
// 	const url = uriHelper(socketUri, {
// 		token: otaInfo.token,
// 		account_type: 'host',
// 		EIO: 3,
// 		transport: 'polling',
// 		sid,
// 	});

// 	await request(url, {
// 		method: 'POST',
// 		body: `45:420["call","chat.joinRoom",{"room_id":${threadId}}]`,
// 	});
// }

async function approve(otaInfo, message) {
	const uri = `https://host.luxstay.net/api/bookings/${message.inquiryPostId}/action`;

	const results = await fetchRetry(uri, { method: 'PUT', body: JSON.stringify({ action: 'accept' }) }, otaInfo);
	if (results.status !== 200) {
		const data = await results.text();
		logger.error('Luxstay approve error', data);
		throw new ThrowReturn('Luxstay approve error');
	}
}

async function decline(otaInfo, threadId, inquiryPostId) {
	const uri = `https://host.luxstay.net/api/bookings/${inquiryPostId}/action`;

	const results = await fetchRetry(uri, { method: 'PUT', body: JSON.stringify({ action: 'decline' }) }, otaInfo);
	if (results.status !== 200) {
		const data = await results.text();
		logger.error('Luxstay decline error', data);
		throw new ThrowReturn('Luxstay decline error');
	}
}

module.exports = {
	// getMessages,
	approve,
	decline,
};

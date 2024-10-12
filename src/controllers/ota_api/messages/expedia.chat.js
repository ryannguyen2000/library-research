const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const { MessageUser } = require('@utils/const');
const { updateOTAConfig } = require('@controllers/ota_helper');
const { getExpediaHeader } = require('../header_helper');

async function getOTAConversation(otaInfo, params) {
	const { threadId, cpcePartnerId, propertyId } = params;

	const uri = `https://apps.expediapartnercentral.com/lodging/conversations/api/conversations/${threadId}?timezone=7&htid=${propertyId}&cpcePartnerId=${
		cpcePartnerId || ''
	}`;
	const res = await fetchRetry(uri, null, otaInfo);

	if (!res.ok) {
		logger.error('Expedia get conversation error', await res.text());
		return;
	}

	const data = await res.json();

	return data;
}

function parseMessages(messages) {
	return _.map(messages, message => ({
		user:
			message.creatorRole === 'TRAVELER' || message.creatorRole === 'SPECIAL_REQUEST'
				? MessageUser.GUEST
				: MessageUser.ME,
		time: new Date(message.createDateTimeISOString),
		message: message.body,
		messageId: message.messageId,
	}));
}

async function getMessages(otaInfo, { threadId, other }, propertyId) {
	const data = await getOTAConversation(otaInfo, {
		threadId,
		cpcePartnerId: other && other.cpcePartnerId,
		propertyId,
	});

	if (!data.messages) {
		logger.error('Expedia get chat messages error', JSON.stringify(data));
		return [];
	}

	return parseMessages(data.messages);
}

async function postMessage({ otaInfo, message, msg, propertyId }, retry = 0) {
	const body = JSON.stringify({
		body: msg,
		conversationId: message.threadId,
		cpcePartnerId: _.get(message.other, 'cpcePartnerId') || null,
	});
	const uri = `https://apps.expediapartnercentral.com/lodging/conversations/api/conversations/sendMessage`;
	const headers = getExpediaHeader(
		otaInfo,
		{
			htid: propertyId,
			origin: 'https://apps.expediapartnercentral.com',
			referer: `https://apps.expediapartnercentral.com/lodging/conversations/messageCenter.html?htid=${propertyId}`,
		},
		uri
	);
	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			body,
			headers,
		},
		otaInfo
	);

	if (res && res.status === 401 && retry === 0) {
		await updateOTAConfig(otaInfo);
		return postMessage({ otaInfo, message, msg, propertyId }, retry + 1);
	}

	if (res && !res.ok) {
		const data = await res.text();
		logger.error('Expedia chat error', res.status, headers, data, body);
		throw new ThrowReturn('Expedia chat error!');
	}
	const json = await res.json();
	if (!json.messageId) {
		logger.error('Expedia chat error', headers, JSON.stringify(json), body);
		throw new ThrowReturn('Expedia chat error!');
	}

	return {
		message: json.body,
		messageId: json.messageId,
		time: new Date(json.createDateTimeISOString),
	};
}

module.exports = {
	getMessages,
	postMessage,
	getOTAConversation,
	parseMessages,
};

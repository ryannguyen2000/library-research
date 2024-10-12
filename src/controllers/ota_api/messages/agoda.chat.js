// const { URLSearchParams } = require('url');
const moment = require('moment');
const _ = require('lodash');
const mongoose = require('mongoose');

const isoFetch = require('@utils/isoFetch');
// const fetchRetry = require('@utils/fetchRetry');

const { logger } = require('@utils/logger');
const { MessageUser } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');

function sfetch(uri, options, otaInfo) {
	options = options || {};
	options.headers = _.assign(options.headers, {
		Cookie: otaInfo.cookie,
		Origin: 'https://ycs.agoda.com',
		'Content-type': 'application/json; charset=UTF-8',
	});

	return isoFetch(uri, options);
}

async function request(uri, options, otaInfo) {
	const res = await sfetch(uri, options, otaInfo);

	if (!res.ok) {
		logger.error('agoda.chat request error', res.status, uri, options);
		return Promise.reject(res.status);
	}

	return res.json();
}

async function findBooking(otaInfo, propertyId, otaBookingId) {
	const uri = `https://ycs.agoda.com/mldc/vi-vn/api/reporting/Booking/list/${propertyId}`;

	const body = JSON.stringify({
		hotelId: Number(propertyId),
		customerName: '',
		ackRequestTypes: ['All'],
		bookingId: Number(otaBookingId),
		bookingDatePeriod: {},
		stayDatePeriod: {},
		lastUpdateDatePeriod: {},
		pageIndex: 1,
		pageSize: 1000,
	});

	const json = await request(
		uri,
		{
			method: 'POST',
			body,
		},
		otaInfo
	);

	return json.bookings[0];
}

async function findThreadMsg(otaInfo, propertyId, bookingId) {
	const uri = `https://ycs.agoda.com/mldc/v1/chat/searchConversations`;

	const body = JSON.stringify({
		// searchType: ['bookingToken'],
		// searchId: [decodeURIComponent(publicToken)],
		searchType: ['bookingId'],
		searchId: [bookingId],
		isBot: false,
		locale: 'en-us',
		languageId: 24,
		bookingId: '-1',
		memberId: propertyId,
		ccLastFour: -1,
		numberOfMessages: 1,
		caller: '',
		offset: 0,
		limit: 1,
		since: '',
		before: '',
		origin: 'YcsHermesIris',
		propertyId,
		isUnread: false,
	});

	const json = await request(
		uri,
		{
			method: 'POST',
			body,
		},
		otaInfo
	);

	return json.conversations[0];
}

async function getConversation(otaInfo, propertyId, conversationId) {
	const uri = `https://ycs.agoda.com/mldc/v1/chat/getConversationMessages`;

	const body = JSON.stringify({
		conversationIds: [_.toString(conversationId)],
		conversationId: '',
		participantId: `host:${propertyId}`,
		languageId: 24,
		caller: 'host',
		offset: 0,
		limit: 1000,
		since: '',
		before: '',
		origin: 'YcsHermesIris',
		bookingId: '-1',
		memberId: propertyId,
		includeConversationDetail: false,
	});

	const json = await request(
		uri,
		{
			method: 'POST',
			body,
		},
		otaInfo
	);

	return json;
}

async function getMessages(otaInfo, message) {
	const [propertyId] = message.otaListingId.split(',');

	// const booking = await findBooking(otaInfo, propertyId, message.otaBookingId);

	const thread = await findThreadMsg(otaInfo, propertyId, message.otaBookingId);

	if (thread.id === '0' || thread.id === 0) {
		return [];
	}

	const conversation = await getConversation(otaInfo, propertyId, thread.id);

	const messages = conversation.messages
		.filter(m => m.senderId.includes('guest') || m.senderId.includes('host'))
		.map(m => ({
			user: m.senderId.startsWith('host') ? MessageUser.ME : MessageUser.GUEST,
			time: new Date(m.modified),
			message: m.content,
			messageId: m.id,
		}));

	return messages;
}

async function getNewMessages(otaInfo, propertyId, conversationId) {
	const uri = `https://ycs.agoda.com/mldc/v1/chat/getNewMessages`;

	const body = JSON.stringify({
		conversationIds: [_.toString(conversationId)],
		clientId: `hermes-inbox:host:${propertyId}:rassgsyt8r`,
		conversationId: '',
		participantId: `host:${propertyId}`,
		languageId: 24,
		bookingId: '-1',
		ccLastFour: -1,
		caller: 'host',
		offset: 0,
		limit: 1000,
		since: '',
		before: '',
		lastPollTime: '',
		origin: 'YcsHermesIris',
	});

	const json = await request(
		uri,
		{
			method: 'POST',
			body,
		},
		otaInfo
	);

	return json;
}

async function findBookingAndProperty(otaInfo, propertyId, bookingId) {
	const uri = `https://ycs.agoda.com/mldc/v1/chat/getBookingAndPropertyDetails`;

	const body = JSON.stringify({
		bookingAndPropertyDetails: [
			{
				bookingId,
				propertyId: '',
			},
		],
		isMobApp: false,
		languageId: 1,
		externalId: Number(propertyId),
		origin: 'YcsHermesIris',
	});

	const json = await request(
		uri,
		{
			method: 'POST',
			body,
		},
		otaInfo
	);

	return json.bookingAndPropertyDetails[0];
}

async function postMessage(inputData) {
	const { otaInfo, message, msg } = inputData;

	const [propertyId] = message.otaListingId.split(',');

	// const booking = await findBooking(otaInfo, propertyId, message.otaBookingId);

	const thread = await findThreadMsg(otaInfo, propertyId, message.otaBookingId);

	const uri = `https://ycs.agoda.com/mldc/v1/chat/sendMessage`;

	const conversationId = _.toString(thread.id);

	const body = {
		conversationId,
		memberId: Number(thread.memberId),
		message: msg,
		propertyId,
		bookingId: Number(thread.bookingId),
		// checkIn: moment(booking.checkinDate).format('DD MMM, YY'),
		// checkOut: moment(booking.checkoutDate).format('DD MMM, YY'),
		checkIn: thread.checkIn,
		checkOut: thread.checkOut,
		target: 'guest',
		origin: 'YcsHermesIris',
		customerName: thread.memberName,
		propertyName: thread.propertyName,
		createConversationIfNotExist: conversationId === '0' || conversationId === '-1',
		isVisibleTo: ['guest', 'host'],
		gptReplyEnable: false,
	};

	if (body.createConversationIfNotExist) {
		const detail = await findBookingAndProperty(otaInfo, propertyId, message.otaBookingId);

		body.memberId = detail.memberId;
		body.customerName = `${detail.guestFirstName} ${detail.guestLastName}`;
		body.propertyName = detail.propertyName;
		body.checkIn = detail.checkIn;
		body.checkOut = detail.checkOut;
	}

	if (!body.checkIn) {
		const booking = await mongoose
			.model('Booking')
			.findOne({ otaName: message.otaName, otaBookingId: message.otaBookingId })
			.select('from to');

		if (booking) {
			body.checkIn = moment(booking.from).format('DD MMM, YY');
			body.checkOut = moment(booking.to).format('DD MMM, YY');
		}
	}

	const res = await sfetch(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaInfo
	);

	const resText = await res.text();

	// logger.warn('Agoda send message', body, res.status, resText);

	if (!res.ok) {
		logger.error('Agoda send chat message error', body, res.status, resText);
		throw new ThrowReturn('Agoda chat error');
	}

	if (body.createConversationIfNotExist) {
		thread.id = _.trim(resText);
	}

	const newMsg = await getNewMessages(otaInfo, propertyId, thread.id);

	if (newMsg && _.get(newMsg, 'messages[0].senderId', '').startsWith('host')) {
		return {
			message: newMsg.messages[0].content,
			messageId: newMsg.messages[0].id,
			time: new Date(newMsg.messages[0].modified),
		};
	}

	return {
		message: msg,
		// messageId: json.Data[0].Id,
		time: new Date(),
	};
}

module.exports = {
	getMessages,
	postMessage,
};

const _ = require('lodash');
const uuid = require('uuid').v4;
const WebSocket = require('ws');
const mongoose = require('mongoose');

const ThrowReturn = require('@core/throwreturn');
const { eventEmitter, EVENTS } = require('@utils/events');
const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const { MessageStatus, OTAs, MessageUser } = require('@utils/const');
const Uri = require('@utils/uri');
const { atob, btoa } = require('@utils/func');
const { retryAsync } = require('@utils/async');
const { getAirbnbHeader, AIRBNB_HOST } = require('@controllers/ota_api/header_helper');

const AIRBNB_UPLOAD = `${AIRBNB_HOST}/support-api/messaging`;
const OTA = OTAs.Airbnb;

async function getNewThreadId(bookingId, otaInfo, threadId) {
	try {
		let thread = threadId;

		// this new threadId
		if (threadId.match(/\D/)) {
			// fetch to find new threadId
			const res = await fetchRetry(
				Uri(`${AIRBNB_HOST}/api/v2/homes_booking_details/${bookingId}`, {
					_format: 'for_host_reservation_details_v2',
					currency: 'USD',
					key: otaInfo.other.key,
					locale: 'en',
				}),
				null,
				otaInfo
			);
			if (!res.ok) {
				throw new Error(await res.text());
			}

			const result = await res.json();
			thread = _.get(result, 'homes_booking_detail.bessie_thread_id');
			if (!thread) {
				throw new Error(JSON.stringify(result));
			}
			thread = thread.toString();
			await mongoose.model('Messages').updateMany({ threadId, otaName: OTA }, { threadId: thread });
		}

		return thread;
	} catch (err) {
		logger.error('Aribnb getNewThreadId error', bookingId, threadId, err);
		return null;
	}
}

async function getThreadDetail(otaInfo, threadId) {
	const result = await fetchRetry(
		Uri(`${AIRBNB_HOST}/api/v3/GetThread`, {
			operationName: 'GetThread',
			variables: JSON.stringify({
				targetUgcLocale: '',
				getThreadState: true,
				getGaps: true,
				getLastReads: false,
				getParticipants: true,
				getUpdates: false,
				threadId,
				subscriptionName: 'messageThread',
				globalThreadId: btoa(`MessageThread:${threadId}`),
				getChips: false,
				// autoTranslateBehavior: null,
				forceReturnAllReadReceipts: false,
			}),
			extensions: JSON.stringify({
				persistedQuery: {
					version: 1,
					sha256Hash: otaInfo.other.sha256Hash,
				},
			}),
			locale: 'en',
			currency: 'USD',
		}),
		null,
		otaInfo
	);

	if (!result.ok) {
		logger.error('Aribnb getThreadDetail error', threadId, otaInfo.account, await result.text());
		return null;
	}

	return result.json();
}

async function getHostSender() {
	const otas = await mongoose.model('OTAManager').findByName(OTA);
	return otas.map(ota => String(ota.other.revieweeId));
}

async function parseMessages(posts, hostSenders) {
	if (!hostSenders) hostSenders = await getHostSender();
	const messages = [];

	posts.forEach(post => {
		const { accountId, updatedAtMs, createdAtMs, content, contentType, uniqueIdentifier, accountType } = post;
		if (contentType === 'bulletin' || contentType === 'invalidation') return;

		const time = new Date(Number(updatedAtMs) || Number(createdAtMs));
		const user = hostSenders.includes(accountId.toString()) ? MessageUser.ME : MessageUser.GUEST;
		const message = _.get(content.body, 'accessibility_text') || content.body || '';

		let newMessage = [
			{
				time,
				user,
				message,
				messageId: uniqueIdentifier,
				accountId,
				accountType,
			},
		];

		if (contentType === 'event_description') {
			newMessage[0].status = MessageStatus.EVENT;
		} else if (contentType === 'multipart') {
			newMessage = content.sub_messages.map(sub_message => ({
				time,
				message: _.get(sub_message.content.body, 'accessibility_text') || sub_message.content.body,
				user,
				status: sub_message.content_type === 'event_description' ? MessageStatus.EVENT : undefined,
				accountId,
				accountType,
			}));
		} else if (contentType === 'finish_asset_upload') {
			const url = content.asset_api_url.match(/^http(s*)/)
				? content.asset_api_url
				: `${AIRBNB_UPLOAD}${content.asset_api_url}`;
			newMessage[0].image_attachment_url = [url];
		}
		messages.push(...newMessage);
	});

	return messages;
}

async function getMessages(otaInfo, message) {
	const threadId = await getNewThreadId(message.otaBookingId || message.threadId, otaInfo, message.threadId);
	if (!threadId) {
		return [];
	}

	const result = await getThreadDetail(otaInfo, threadId);
	const posts = _.get(result, 'data.shiota.thread.messageThread.coreThreadData.messages');
	if (!posts) {
		logger.error('Airbnb getMessages error', otaInfo.account, result);
		return [];
	}

	return parseMessages(posts);
}

async function postMessage(inputData) {
	const { otaInfo, message, msg, retry = 0 } = inputData;

	const param = message.otaBookingId || message.threadId;
	const threadId = await getNewThreadId(param, otaInfo, message.threadId);
	if (!threadId) {
		throw new ThrowReturn(`Not found threadId for ${param}`);
	}

	const messageId = uuid();
	const body = {
		operationName: 'ThreadCreateMessageItem',
		variables: {
			threadId,
			contentType: 'text',
			content: { body: msg },
			uniqueIdentifier: messageId,
		},
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash: otaInfo.other.sha256HashSendMessage,
			},
		},
	};

	const res = await fetchRetry(
		`${AIRBNB_HOST}/api/v3/ThreadCreateMessageItem?operationName=ThreadCreateMessageItem&locale=en&currency=USD`,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaInfo
	);

	const result = await (res.ok ? res.json() : res.text());
	const newMessage = _.get(result, 'data.shiota.createMessage.message');
	if (!newMessage) {
		if (retry === 0) {
			// retry again
			await Promise.delay(1000);
			return postMessage({ ...inputData, retry: retry + 1 });
		}
		logger.error('Airbnb postMessage error', result);
		throw new ThrowReturn('Airbnb error please try later!');
	}

	return _.pickBy({
		message: newMessage.content.body,
		messageId: newMessage.uniqueIdentifier || messageId,
		time: new Date(+newMessage.createdAtMs),
	});
}

async function updateAlteration(otaInfo, altData, accept) {
	// const uri = Uri(`${AIRBNB_HOST}/api/v2/reservation_alterations/${altData.id}`, {
	// 	_format: 'for_web_alteration_redesign_as_host',
	// 	currency: 'USD',
	// 	locale: 'en',
	// 	key: otaInfo.other.key,
	// });
	const operationName = `${accept ? 'Accept' : 'Decline'}ReservationAlteration`;

	const uri = `${AIRBNB_HOST}/api/v3/${operationName}?operationName=${operationName}&locale=en&currency=USD`;
	const body = {
		operationName,
		variables: { alterationId: altData.id },
		extensions: {
			persistedQuery: {
				version: 1,
				sha256Hash: otaInfo.other.sha256HashAlteration,
				// sha256Hash: 'e5736a4e2746eed78302e11ddbc96713cd19b32d36f258bbffeec8967df8e285',
			},
		},
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaInfo
	);

	if (!result.ok) {
		const data = await result.text();
		logger.error('Airbnb updateAlteration error', uri, body, data);
		throw new ThrowReturn('Airbnb update alteration error', data);
	}
}

function approveAlteration(otaInfo, altData) {
	return updateAlteration(otaInfo, altData, true);
}

function declineAlteration(otaInfo, altData) {
	return updateAlteration(otaInfo, altData, false);
}

async function getAlterationData(otaInfo, otaBookingId) {
	const booking = await mongoose.model('Booking').findOne({
		otaBookingId,
		otaName: OTA,
		'alterations.status': 0,
	});

	if (!booking || !booking.alterations) {
		return null;
	}

	return booking.alterations.find(alt => alt.status === 0);
}

async function approve(otaInfo, message) {
	const { threadId, otaBookingId } = message;

	if (otaBookingId) {
		const altData = await getAlterationData(otaInfo, otaBookingId);
		if (altData) {
			await approveAlteration(otaInfo, altData);
			return 'alteration';
		}
	}

	await sendPreApprove(otaInfo, threadId, otaBookingId);
}

async function withdraw(otaInfo, message) {
	await sendPreApprove(otaInfo, message.threadId, null, true);
}

async function sendPreApprove(otaInfo, threadId, otaBookingId, isWithdraw) {
	const id = btoa(otaBookingId ? `StayReservationByCode:${otaBookingId}` : `MessageThread:${threadId}`);

	const actionId = otaBookingId ? 'ACCEPT_RTB' : isWithdraw ? 'WITHDRAW_SPECIAL_OFFER' : 'SEND_PREAPPROVAL';

	const result = await fetchRetry(
		`${AIRBNB_HOST}/api/v3/HostReservationDetailMutation?operationName=HostReservationDetailMutation&locale=en&currency=USD`,
		{
			method: 'POST',
			body: JSON.stringify({
				operationName: 'HostReservationDetailMutation',
				variables: {
					input: {
						actionId,
						screenId: actionId,
						resourceIds: [id],
						mutations: [],
					},
					id,
					sectionIds: null,
					entryPoint: otaBookingId ? 'ReservationPicker' : 'MessageThread',
					disableDeferredLoading: false,
				},
				extensions: {
					persistedQuery: {
						version: 1,
						sha256Hash: otaInfo.other.sha256Approve,
					},
				},
			}),
		},
		otaInfo
	);

	if (!result.ok) {
		const data = await result.text();
		logger.error('Aribnb sendPreApprove error', threadId, actionId, data);
		throw new ThrowReturn('Airbnb send pre-approve error');
	}
}

async function decline(otaInfo, threadId, inquiryPostId, message, otaBookingId) {
	if (otaBookingId) {
		const altData = await getAlterationData(otaBookingId);
		if (altData) {
			await declineAlteration(otaInfo, altData);
			return 'alteration';
		}
	}

	const uri = `${AIRBNB_HOST}/api/v2/messages?currency=USD&key=${otaInfo.other.key}&locale=en`;
	const bodyData = {
		decline_reason: 'not_a_good_fit',
		message,
		status: 'denied',
		template: '9',
		thread_id: threadId,
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(bodyData),
		},
		otaInfo
	);
	if (!result.ok) {
		const data = await result.text();
		logger.error('Airbnb decline error', uri, data);
		throw new ThrowReturn('Airbnb decline error', data);
	}
}

function parsePrice(text) {
	return Number(text.replace(/\$|,/g, ''));
}

async function getInquiryDetail(otaInfo, threadId) {
	try {
		const res = await fetchRetry(
			`${AIRBNB_HOST}/api/v3/HostReservationDetailSectionsMinimalist?operationName=HostReservationDetailSectionsMinimalist&locale=en&currency=USD`,
			{
				method: 'POST',
				body: JSON.stringify({
					operationName: 'HostReservationDetailSectionsMinimalist',
					variables: {
						id: btoa(`MessageThread:${threadId}`),
						sectionIds: [
							'HEADER',
							'CONTACT_GUEST',
							'ACTION_INSTRUCTIONS_BUTTONS',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_1',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_2',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_3',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_4',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_5',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_6',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_7',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_8',
							'PAYMENT_HOST_PAYOUT_LINE_ITEM_9',
							'PAYMENT_HOST_PAYOUT_TOTAL',
						],
						entryPoint: 'MessageThread',
						disableDeferredLoading: false,
					},
					extensions: {
						persistedQuery: {
							version: 1,
							sha256Hash: otaInfo.other.sha256HashMinimalist,
						},
					},
				}),
			},
			otaInfo
		);
		if (!res.ok) {
			throw new Error(await res.text());
		}
		const json = await res.json();
		const { sections } = json.data.presentation.stayHostReservation.configuration;
		const guestContact = sections.find(
			s => s.sectionId === 'ACTION_INSTRUCTIONS_BUTTONS' || s.sectionId === 'CONTACT_GUEST'
		);
		const buttonSpecialOffer = guestContact.section.buttons.buttons.find(
			b => b.action.__typename === 'OpenSendSpecialOfferModalAction'
		);
		if (!buttonSpecialOffer) return;

		const {
			numGuests,
			checkInDate,
			checkOutDate,
			listingGlobalIdOptional,
			loggingData,
			guestName,
			guestGlobalId,
			currency,
		} = buttonSpecialOffer.action;
		const [, otaListingId] = atob(listingGlobalIdOptional).split(':');
		const [, guestId] = atob(guestGlobalId).split(':');

		const priceSection = sections.find(s => s.sectionId === 'PAYMENT_HOST_PAYOUT_TOTAL');
		const price = parsePrice(priceSection.section.html.htmlText);
		const priceItems = sections
			.filter(s => s.sectionId.includes('PAYMENT_HOST_PAYOUT_LINE_ITEM'))
			.map(priceSec => ({
				amount: parsePrice(priceSec.section.html.htmlText),
				title: priceSec.section.title,
			}));
		const header = sections.find(s => s.sectionId === 'HEADER');

		return {
			otaListingId,
			numGuests,
			currency,
			checkIn: checkInDate,
			checkOut: checkOutDate,
			inquiry: ['inquiry', 'request'].includes(loggingData.eventData.metadata.status),
			guest: {
				id: Number(guestId),
				name: guestName,
				avatar: _.get(header, 'section.mediaItem.baseUrl'),
			},
			price,
			priceItems,
		};
	} catch (e) {
		logger.error('Airbnb getInquiryDetail error', otaInfo.account, threadId, e);
		return null;
	}
}

async function syncMessageByThread({ threadId, otaConfig }) {
	if (!threadId || !otaConfig) return;

	const thread = await getThreadDetail(otaConfig, threadId);
	const messageThread = _.get(thread, 'data.shiota.thread.messageThread');
	const parameters = _.get(messageThread, 'threadContent.messagingData.threadProductInfo.productCTA.parameters');
	const sidebarParams = _.get(messageThread, 'threadContent.homeBookingData.sidebarParams');
	const monorailThreadId = _.toString(
		_.get(parameters, 'monorailThreadId') ||
			_.get(parameters, 'unifiedThreadId') ||
			_.get(sidebarParams, 'bessieThreadId')
	);

	const messages = await parseMessages(messageThread.coreThreadData.messages);
	const confirmationCode = _.get(sidebarParams, 'confirmationCode') || _.get(parameters, 'confirmationCode');
	if (confirmationCode) {
		const booking = await mongoose
			.model('Booking')
			.findOne({ otaName: OTA, otaBookingId: confirmationCode })
			.select('_id');
		if (!booking) {
			await mongoose.model('JobCrawler').create({
				otaName: OTA,
				reservationId: confirmationCode,
				email: otaConfig.username,
			});
			// await require('@controllers/ota_api/crawler_reservations/airbnb').crawlerReservationWithId(
			// 	otaConfig,
			// 	null,
			// 	confirmationCode
			// );
			return;
		}
		messages[0] = _.assign(messages[0], {
			otaBookingId: confirmationCode,
		});
		const guest = _.find(messageThread.coreThreadData.participants, p => p.userRoleType === 3);
		if (guest) {
			messages[0] = _.assign(messages[0], {
				sender: guest.displayName,
				senderId: guest.accountId.toString(),
			});
		}
	} else {
		const inquiry = monorailThreadId && (await getInquiryDetail(otaConfig, monorailThreadId));
		if (inquiry) {
			messages[0] = _.assign(messages[0], {
				sender: inquiry.guest.name,
				senderId: inquiry.guest.id,
				otaListingId: inquiry.otaListingId,
				inquiry: inquiry.inquiry,
				inquiryPostId: monorailThreadId,
				inquiryDetails: {
					otaName: OTA,
					from: new Date(inquiry.checkIn).toDateMysqlFormat(),
					to: new Date(inquiry.checkOut).toDateMysqlFormat(),
					numberAdults: inquiry.numGuests,
					numberChilden: 0,
					expireAt: inquiry.expireAt,
					currency: inquiry.currency,
					price: inquiry.price,
					priceItems: inquiry.priceItems,
				},
				avatar: inquiry.guest.avatar,
			});
		} else {
			const agent = _.find(messageThread.coreThreadData.participants, p => p.accountType === 'agent');
			if (agent) {
				messages[0] = _.assign(messages[0], {
					inquiry: false,
					sender: agent.displayName,
					senderId: agent.accountId,
					avatar: agent.pictureUrl,
					account: otaConfig.account,
					groupIds: otaConfig.groupIds,
				});
			}
		}
	}

	eventEmitter.emit(EVENTS.MESSAGE_ADD, {
		otaName: OTA,
		threadId: monorailThreadId || threadId,
		messages,
		replace: true,
		username: otaConfig.username,
	});
}

async function getWsToken(otaConfig) {
	const res = await fetchRetry(
		`${AIRBNB_HOST}/api/v3/CreateWebsocketToken?operationName=CreateWebsocketToken&locale=en&currency=USD`,
		{
			method: 'POST',
			headers: getAirbnbHeader(otaConfig, {
				origin: AIRBNB_HOST,
				'x-airbnb-graphql-platform-client': 'apollo-niobe',
				'x-airbnb-supports-airlock-v2': true,
			}),
			body: JSON.stringify({
				operationName: 'CreateWebsocketToken',
				variables: {},
				extensions: {
					persistedQuery: {
						version: 1,
						sha256Hash: otaConfig.other.sha256HashWs,
					},
				},
			}),
		},
		otaConfig
	);
	const json = await res.json();
	const t = _.get(json, 'data.shiota.token.token.token');
	if (t) return t;

	return Promise.reject(`${OTA} getWsToken error ${JSON.stringify(json)}`);
}

const PING_TIME = 60 * 1000;

async function connectAccount(id) {
	await retryAsync(
		async () => {
			const otaConfig = await mongoose.model('OTAManager').findById(id);
			const token = await getWsToken(otaConfig);

			return new Promise((rs, rj) => {
				const ws = new WebSocket(`wss://ws.airbnb.com/messaging/ws2/${token}`, 'eevee_v2', {
					headers: {
						Origin: AIRBNB_HOST,
					},
				});

				const subscribeEvents = [
					{
						id: 0,
						name: 'NewMessage',
						origin: 'bessie',
						type: 'SUBSCRIBE',
					},
					{
						id: 1,
						name: 'NewStatus',
						origin: 'monorail',
						type: 'SUBSCRIBE',
					},
				];

				ws.on('open', function () {
					rs();

					subscribeEvents.forEach(event => {
						ws.send(JSON.stringify(event));
					});

					this.pingInterval = setInterval(() => {
						this.pingTimeout = setTimeout(() => {
							this.terminate();
						}, 5 * 1000);
						ws.send(JSON.stringify({ type: 'PING' }));
					}, PING_TIME);
				});

				ws.on('message', function (data) {
					const json = JSON.parse(data);

					if (json.type === 'PONG') {
						clearTimeout(this.pingTimeout);
						return;
					}
					if (
						json.type === 'SUBSCRIPTION_EVENT' &&
						json.id === subscribeEvents[0].id &&
						json.payload.is_renderable
					) {
						eventEmitter.emit(EVENTS.MESSAGE_THREAD_UPDATE, {
							threadId: json.payload.message_thread_id.toString(),
							messageId: json.payload.message_unique_identifier,
							account: otaConfig.account,
							otaName: OTA,
							messageOnly: true,
						});
					}

					logger.info(`received ${OTA} ${otaConfig.account} ws: `, json);
				});

				ws.on('error', function (e) {
					// logger.error(`${OTA} ws error`, e);
					rj(e);
				});

				ws.on('close', function () {
					clearInterval(this.pingInterval);
					clearTimeout(this.pingTimeout);
				});
			});
		},
		{
			onError: e => {
				logger.error(`${OTA} connectAccount error`, id, e && e.toString());
			},
		}
	);
}

async function connect() {
	const otaConfigs = await mongoose.model('OTAManager').findByName(OTA).select('_id');
	await otaConfigs.asyncMap(otaConfig => connectAccount(otaConfig._id));
}

module.exports = {
	getMessages,
	postMessage,
	approve,
	decline,
	syncMessageByThread,
	connect,
	withdraw,
};

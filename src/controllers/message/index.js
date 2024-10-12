const _ = require('lodash');
const mongoose = require('mongoose');

const { eventEmitter, EVENTS } = require('@utils/events');
const { logger } = require('@utils/logger');
const {
	MessageStatus,
	OTAs,
	OTTs,
	BookingStatus,
	Errors,
	BookingLogs,
	LocalOTAs,
	RateType,
	MessageUser,
	InboxType,
} = require('@utils/const');
const { MessageLock } = require('@utils/lock');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const mailServices = require('@services/email');

const Reservation = require('@controllers/booking/reservation');
const Booking = require('@controllers/booking');
const otaHelper = require('@controllers/ota_helper');
const otaMessages = require('@controllers/ota_api/messages');
const inbox = require('@controllers/inbox');
const OTT = require('@ott/ott');
const { getMsgActionHistories, sendOTTMessage } = require('./ott');

function removeDuplicateMessages(messages) {
	const results = messages.length > 0 ? [messages[0]] : [];
	for (let i = 1; i < messages.length; i++) {
		if (messages[i].message !== messages[i - 1].message) {
			results.push(messages[i]);
		}
	}
	return results;
}

function mergeMessages(origins, news) {
	if (!news || !news.length) {
		return [origins, []];
	}

	const oldMessages = _.keyBy(origins, 'messageId');
	const listNews = [];

	news.forEach(msg => {
		// o.user !== MessageUser.GUEST
		const old = oldMessages[msg.messageId];
		if (old) {
			msg.user = old.user;
		} else {
			listNews.push(msg);
		}
	});

	return [news, listNews];
}

async function findOTAConfig(messageThread) {
	let otaConfig;
	let propertyId;

	if (messageThread.otaListingId) {
		const ota = await otaHelper.getOTAFromListing(messageThread.otaName, messageThread.otaListingId);
		otaConfig = ota.otaInfo;
		propertyId = ota.propertyId;
	} else if (messageThread.account) {
		otaConfig = await models.OTAManager.findOne({
			name: messageThread.otaName,
			account: messageThread.account,
			active: true,
		});
	}

	return {
		otaConfig,
		propertyId,
	};
}

async function syncMessage(message, returnData = true) {
	if (!message) {
		throw new ThrowReturn('Message thread not found!');
	}
	if (!otaMessages[message.otaName] || !otaMessages[message.otaName].getMessages) {
		throw new ThrowReturn('Not yet support for this OTA!');
	}

	const { otaConfig, propertyId } = await findOTAConfig(message);

	const msgs = await otaMessages[message.otaName].getMessages(otaConfig, message, propertyId);

	// merge new messages
	const [newMessages, newMsgFromOTAs] = mergeMessages(message.messages, msgs);
	newMessages.sort((m1, m2) => m2.time.getTime() - m1.time.getTime());

	const oldMessages = [...message.messages];

	// update messages
	message.messages = newMessages;
	await message.save();

	const oldGuestMsgId = _.get(oldMessages[0], 'messageId');
	const newGuestMsgId = _.get(message.messages[0], 'messageId');

	if (oldGuestMsgId !== newGuestMsgId) {
		await inbox.updateInbox({
			messageId: message._id,
			subTitle: _.truncate(_.get(message.messages[0], 'message')),
			ottSource: '',
			groupIds: message.groupIds,
			otaName: message.otaName,
			otaBookingId: message.otaBookingId,
			inboxType: InboxType.MESSAGE,
		});
	}

	if (newMsgFromOTAs.some(m => m.status === MessageStatus.EVENT)) {
		models.JobCrawler.create({
			reservationId: message.otaBookingId,
			otaName: message.otaName,
			email: otaConfig.username,
		}).catch(e => {
			logger.error(e);
		});
	}

	if (returnData) {
		return getMessage(message);
	}
}

async function postMessage({ user, message, messageId, msg, msgId, reply, attachments }) {
	if (!msg && !reply) throw new ThrowReturn('Tin nhắn không được để trống!');

	if (attachments && attachments.length) {
		throw new ThrowReturn(`Hiện chưa hỗ trợ gửi ảnh qua ${_.upperFirst(message.otaName)}!`);
	}

	message = message || (await models.Messages.findById(messageId));
	if (!message) throw new ThrowReturn().status(404);

	if (!otaMessages[message.otaName] || !otaMessages[message.otaName].postMessage) {
		throw new ThrowReturn(`Hiện chưa hỗ trợ gửi tin nhắn trực tiếp qua ${_.upperFirst(message.otaName)}!`);
	}

	const { otaConfig, propertyId } = await findOTAConfig(message);
	const resultMsg = await otaMessages[message.otaName].postMessage({
		otaInfo: otaConfig,
		message,
		msg,
		propertyId,
		msgId,
		reply,
	});

	if (msgId) {
		const subMsg = _.find(message.messages, m => m.messageId === msgId);
		if (subMsg) {
			subMsg.status = MessageStatus.NONE;
		}
	}

	const senderId = user ? user._id.toString() : MessageUser.BOT;
	const newMessage = {
		user: senderId,
		message: msg,
		time: new Date(),
		...resultMsg,
	};
	message.messages = [newMessage, ...message.messages];

	await message.save();

	await inbox.updateInbox({
		senderId,
		messageId: message._id,
		title: 'tb',
		subTitle: msg,
		ottSource: '',
		groupIds: message.groupIds,
	});

	return { message: newMessage, otaName: message.otaName };
}

async function addExpediaMessages({ otaName, threadId, messages }) {
	const propertyId = _.toString(messages[0].htid);

	const block = await models.Block.findOne({
		active: true,
		OTAProperties: {
			$elemMatch: {
				otaName,
				propertyId,
			},
		},
	}).select('OTAProperties');
	if (!block) return;

	const property = _.find(block.OTAProperties, { otaName, propertyId });
	const otaInfo = await models.OTAManager.findOne({ account: property.account, name: otaName });
	if (!otaInfo) return;

	const conversation = await otaMessages[otaName].getOTAConversation(otaInfo, {
		threadId,
		cpcePartnerId: messages[0].cpcePartnerId,
		propertyId: messages[0].htid,
	});

	if (conversation && conversation.metadata && conversation.messages) {
		const { reservationId } = conversation.metadata.reservationInfo;
		const currentThread = await models.Messages.findOne({
			otaName,
			otaBookingId: reservationId,
		});

		if (!currentThread)
			return await models.JobCrawler.create({
				reservationId,
				otaName,
				propertyId,
			});

		const newMessages = otaMessages[otaName].parseMessages(conversation.messages);
		const oldMessages = _.clone(currentThread.messages);

		currentThread.messages = [...currentThread.messages, ...newMessages].sort(
			(m1, m2) => m2.time.getTime() - m1.time.getTime()
		);
		currentThread.messages = removeDuplicateMessages(currentThread.messages);
		currentThread.threadId = threadId;
		_.set(currentThread, 'other.cpcePartnerId', messages[0].cpcePartnerId);

		await currentThread.save();

		const oldGuestMsgId = _.findIndex(oldMessages[0], 'messageId');
		const newGuestMsgId = _.get(currentThread.messages[0], 'messageId');

		if (oldGuestMsgId !== newGuestMsgId) {
			await inbox.addChatInbox(otaName, currentThread);
		}
	}
}

async function addMessages({ otaName, otaBookingId, threadId, messages, replace, username }) {
	try {
		if (otaBookingId && (!messages || !messages[0])) {
			const message = await models.Messages.findOne({
				otaName,
				otaBookingId,
			});
			return await syncMessage(message, false);
		}

		let messagesThread =
			messages &&
			messages[0] &&
			(await models.Messages.findOne(
				models.Messages.getThreadQuery({
					otaName,
					threadId,
					otaListingId: messages[0].otaListingId,
					otaBookingId: messages[0].otaBookingId,
					inquiryDetails: messages[0].inquiryDetails,
				})
			));

		let isNew = !messagesThread;

		if (!messagesThread) {
			if (otaName === OTAs.Expedia) {
				return await addExpediaMessages({ otaName, threadId, messages });
			}

			if (messages || !messages[0] || !messages[0].otaListingId) {
				return;
			}

			let { groupIds } = messages[0];
			let listing;

			if (!groupIds) {
				listing = await models.Listing.findListingByOTA(otaName, messages[0].otaListingId)
					.select('blockId')
					.populate('blockId', 'groupIds');
				if (!listing) return;

				groupIds = listing.blockId.groupIds;
			}

			const guest = await models.Guest.findGuest({
				ota: otaName,
				name: messages[0].sender,
				fullName: messages[0].sender,
				otaId: messages[0].senderId,
				groupIds,
			});

			// create message
			messagesThread = await models.Messages.createMessagesThread({
				otaName,
				threadId,
				guestId: guest._id,
				otaListingId: messages[0].otaListingId,
				otaBookingId: messages[0].otaBookingId,
				inquiry: messages[0].inquiry,
				inquiryPostId: messages[0].inquiryPostId,
				inquiryDetails: messages[0].inquiryDetails,
				account: messages[0].account,
				groupIds,
			});

			// update guest messages id
			guest.messages = messagesThread._id;
			await guest.save();

			// emit event inquiry
			if (messagesThread && messagesThread.inquiry) {
				if (!listing) listing = await models.Listing.findListingByOTA(otaName, messagesThread.otaListingId);
				if (listing) {
					eventEmitter.emit(EVENTS.INQUIRY, guest, messagesThread._id, listing._id, otaName);
				}
			}
		}

		messagesThread.messages = messagesThread.messages || [];
		let newMessages = [];
		let newMsgFromOTAs = [];

		if (replace) {
			[newMessages, newMsgFromOTAs] = mergeMessages(messagesThread.messages, messages);
			newMessages.sort((m1, m2) => m2.time.getTime() - m1.time.getTime());
		} else {
			newMessages = [...messagesThread.messages, ...messages];
			newMessages.sort((m1, m2) => m2.time.getTime() - m1.time.getTime());
			newMessages = removeDuplicateMessages(newMessages);
			newMsgFromOTAs = _.differenceBy(messages, messagesThread.messages, 'messageId');
		}

		// update inbox
		if (isNew) {
			await inbox.addChatInbox(otaName, messagesThread, messages[0].sender);
		} else if (messagesThread.messages.length !== newMessages.length) {
			// const newGuestIndex = _.findIndex(newMessages, m => m.user === MessageUser.GUEST);
			// const oldGuestIndex = _.findIndex(messagesThread.messages, m => m.user === MessageUser.GUEST);

			// if (newGuestIndex !== -1 && newGuestIndex !== oldGuestIndex) {
			// 	await inbox.addChatInbox(otaName, messagesThread, messages[0].sender);
			// }

			const oldLastMsgId = _.get(messagesThread.messages[0], 'messageId');
			const newLastMsgId = _.get(newMessages[0], 'messageId');

			if (oldLastMsgId !== newLastMsgId) {
				await inbox.addChatInbox(otaName, messagesThread, messages[0].sender);
			}
		}

		messagesThread.messages = newMessages;
		await messagesThread.save();

		if (username && newMsgFromOTAs.some(m => m.status === MessageStatus.EVENT)) {
			models.JobCrawler.create({
				reservationId: messagesThread.otaBookingId,
				otaName: messagesThread.otaName,
				email: username,
			}).catch(e => {
				logger.error(e);
			});
		}

		// update guest avatar
		if (messages[0].avatar && messagesThread.guestId) {
			await models.Guest.updateOne({ _id: messagesThread.guestId, avatar: null }, { avatar: messages[0].avatar });
		}
	} catch (e) {
		logger.error(e);
	}
}

function getSenders(messages) {
	const senders = _.uniq(_.map(messages, m => m.user));
	if (!senders.length) return {};

	return models.User.find({ _id: senders.filter(mongoose.Types.ObjectId.isValid) })
		.select('username name')
		.then(users => _.keyBy(users, '_id'));
}

async function findBookingByMessage(message) {
	const bookings = await models.Booking.find({
		otaName: message.otaName,
		otaBookingId: message.otaBookingId,
	}).lean();

	if (!bookings.length) return;

	const sorterStatus = {
		[BookingStatus.CONFIRMED]: 3,
		[BookingStatus.NOSHOW]: 2,
		[BookingStatus.CHARGED]: 1,
	};

	const [booking] = bookings.sort((a, b) => (sorterStatus[b.status] || 0) - (sorterStatus[a.status] || 0));

	await models.Booking.populate(booking, [
		{
			path: 'blockId',
			select: 'info',
			options: { lean: true },
		},
		{
			path: 'listingId',
			select: 'name OTAs.otaListingName OTAs.otaName OTAs.otaListingId roomIds blockId',
			options: { lean: true },
		},
		{
			path: 'histories.by histories.removedBy histories.updatedBy',
			select: 'username name',
			options: { lean: true },
		},
		{
			path: 'histories.workNote',
			populate: {
				path: 'createdBy log.user',
				select: 'name username',
			},
			options: { lean: true },
		},
		{
			path: 'guestIds',
			populate: {
				path: 'histories.by histories.removedBy',
				select: 'name username',
			},
			options: { lean: true },
		},
		{
			path: 'histories.requestId',
			select: 'reasonId reasonOther',
			populate: {
				path: 'reasonId',
				select: 'label',
			},
		},
	]);

	return booking;
}

async function getMessage(message) {
	await models.Messages.populate(message, [
		{
			path: 'guestId',
			populate: { path: 'histories.by histories.removedBy', select: 'name username' },
		},
		{
			path: 'hostId',
			select: 'avatar fullName phone email ottIds',
		},
		{
			path: 'blockId',
			select: 'info',
		},
		{
			path: 'departmentId',
		},
	]);

	const messages = message.toJSON();

	if (messages.guestId) {
		messages.guestId.blacklist = await models.GuestBlacklist.getBlacklist(messages.guestId);
	}

	messages.senders = await getSenders(messages.messages);
	messages.booking = messages.otaBookingId && (await findBookingByMessage(messages));

	if (messages.booking) {
		// messages.booking = messages.booking.toJSON();
		messages.reservateRooms = await models.Reservation.getReservatedRoomsDetails(messages.booking._id);
		messages.guestIds = messages.booking.guestIds || [];
		if (messages.guestIds.length) {
			messages.guestIds = await messages.guestIds.asyncMap(async g => {
				g.blacklist = await models.GuestBlacklist.getBlacklist(g);
				return g;
			});
		}
	} else if (messages.inquiryDetails) {
		messages.booking = messages.inquiryDetails;
		if (messages.booking.blockId) {
			messages.booking.blockId = await models.Block.findById(messages.booking.blockId).select('info').lean();
		}
	} else {
		messages.booking = {};
	}

	if (messages.inquiry || (!messages.booking._id && messages.otaListingId)) {
		messages.booking.listingId =
			messages.booking.listingId ||
			(await models.Listing.findOne({
				OTAs: {
					$elemMatch: {
						otaName: messages.otaName,
						otaListingId: messages.otaListingId,
						active: true,
					},
				},
			})
				.select('name OTAs.otaName OTAs.otaListingName OTAs.otaListingId roomIds blockId')
				.lean());

		if (!messages.booking.blockId && messages.booking.listingId) {
			messages.booking.blockId = await models.Block.findById(messages.booking.listingId.blockId)
				.select('info')
				.lean();
		}

		if (messages.booking.from && messages.booking.listingId) {
			messages.booking = await Booking.updateBookingErrorAndAvailableRooms(
				messages.booking,
				messages.booking.listingId.roomIds,
				messages.booking.listingId.blockId
			);
		}

		messages.booking.status = messages.booking.status || BookingStatus.REQUEST;
	}

	if (messages.booking.listingId) {
		messages.booking.listingId.OTAs = _.filter(
			messages.booking.listingId.OTAs,
			o => o.otaListingId === messages.otaListingId
		);
	}

	const blockInbox = await models.BlockInbox.findOne({ messageId: message._id })
		.select('read readBy readTime ottPhone ottSource guestId blockId roomIds')
		.populate('blockId', 'info.name')
		.populate('roomIds', 'info.roomNo')
		.populate('readBy', 'username name')
		.lean();

	messages.read = blockInbox && blockInbox.read;
	messages.readBy = blockInbox && blockInbox.readBy;
	messages.inbox = blockInbox;
	messages.supportOTA = !!otaMessages[messages.otaName];

	return messages;
}

async function approveInquiry({ message, messageId, user, roomIds, force, paid }) {
	const thread = message || (await models.Messages.findById(messageId));

	const book = await models.Booking.findOne({ messages: thread._id });

	if (!roomIds && book && !force) {
		await Booking.updateBookingError(book);
		if (book.error === Errors.RoomNotAvailable) {
			throw new ThrowReturn('Not avaiable room(s)');
		}
	}

	if (book && book.status === BookingStatus.CONFIRMED && paid && _.values(LocalOTAs).includes(book.otaName)) {
		await models.Booking.updateMany(
			{ otaName: thread.otaName, otaBookingId: thread.otaBookingId },
			{ rateType: RateType.PAY_NOW }
		);
		return;
	}

	let booking;
	if (_.values(LocalOTAs).includes(thread.otaName)) {
		if (!book) return;

		({ booking } = await Reservation.confirmReservation({
			otaName: thread.otaName,
			otaBookingId: thread.otaBookingId,
			otaListingId: thread.otaListingId,
			from: thread.inquiryDetails.from,
			to: thread.inquiryDetails.to,
			amount: thread.inquiryDetails.amount || 1,
			status: BookingStatus.CONFIRMED,
			guestId: thread.guestId,
			listingId: book.listingId,
			blockId: roomIds && book && book.blockId,
			rooms: roomIds && roomIds.toMongoObjectIds(),
			rateType: paid ? RateType.PAY_NOW : RateType.PAY_AT_PROPERTY,
		}));
		if (booking) {
			mailServices.sendEmailConfirmation(booking._id).catch(e => {
				logger.error(e);
			});
		}
	} else {
		if (!otaMessages[thread.otaName] || !otaMessages[thread.otaName].approve) {
			throw new ThrowReturn('Not yet support for this OTA');
		}

		const { otaConfig, propertyId } = await findOTAConfig(thread);

		await otaMessages[thread.otaName].approve(otaConfig, thread, propertyId);

		if (thread.otaBookingId) {
			booking = await models.Booking.findOne({ otaBookingId: thread.otaBookingId }).select('_id');
			const from = _.get(thread, 'inquiryDetails.from');
			const to = _.get(thread, 'inquiryDetails.to');

			models.JobCrawler.create({
				reservationId: thread.otaBookingId,
				propertyId,
				otaName: thread.otaName,
				email: otaConfig.username,
				from,
				to,
				timeToStart: new Date(Date.now() + 20000),
			}).catch(e => {
				logger.error(e);
			});
		}
	}

	thread.inquiry = false;
	thread.approved = true;
	await thread.save();

	// log history
	if (booking) {
		await models.Booking.addLog({
			bookingId: booking._id,
			userId: user && user._id,
			action: BookingLogs.REQUEST_APPROVED,
		});
	}
}

async function declineInquiry({ user, message, msg }) {
	if (message.status !== 'inquiry') {
		throw new ThrowReturn(`Can't not decline this inquiry message`);
	}

	let booking;

	if (_.values(LocalOTAs).includes(message.otaName)) {
		message.inquiry = false;
		message.declined = true;
		await message.save();

		booking = await models.Booking.findOne({ messages: message._id });
		if (booking) {
			booking.status = BookingStatus.DECLINED;
			await booking.save();
		}
	} else {
		if (msg.length < 30 && message.otaName === OTAs.Airbnb) {
			throw new ThrowReturn("Message's length must greater than 30");
		}

		if (!otaMessages[message.otaName] || !otaMessages[message.otaName].decline) {
			throw new ThrowReturn('Not yet support for this OTA');
		}

		const { otaConfig } = await findOTAConfig(message);

		await otaMessages[message.otaName].decline(
			otaConfig,
			message.threadId,
			message.inquiryPostId,
			msg,
			message.otaBookingId
		);

		message.inquiry = false;
		message.declined = true;
		await message.save();

		booking = await models.Booking.findOne({ otaBookingId: message.otaBookingId }).select('_id');

		postMessage({
			user,
			message,
			msg,
		}).catch(e => {
			logger.error(e);
		});
	}

	if (booking) {
		await models.Booking.addLog({ bookingId: booking._id, userId: user._id, action: BookingLogs.REQUEST_DECLINED });
	}
}

async function parseTimeline(timeline, messageObjs) {
	if (!timeline.event) {
		timeline.event = InboxType.MESSAGE;
	}

	if (timeline.event === InboxType.CALLING) {
		const callDoc = await models.Stringee.findOne({ 'data.id': timeline.messageId });
		timeline.messageData = models.Stringee.parseDoc(callDoc);
	}
	if (timeline.event === InboxType.MESSAGE) {
		// from OTA
		if (timeline.otaName === timeline.ottName) {
			timeline.messageData = _.get(messageObjs, timeline.messageId);
		}

		// from OTT
		if (!timeline.messageData) {
			timeline.messageData = await OTT.getMessage(timeline);
		}
	}
	if (timeline.messageData && timeline.messageData.fromMe === undefined) {
		timeline.messageData.fromMe = timeline.fromMe;
	}

	return timeline;
}

async function getTimelineFilter(message, guestId, user) {
	const filter = {
		$or: [],
	};

	if (message.otaBookingId) {
		filter.$or.push({
			otaName: message.otaName,
			otaBookingId: message.otaBookingId,
		});
	}

	const allGuestIds = [message.guestId, ...message.guestIds];

	const gIds = guestId ? allGuestIds.filter(g => g.equals(guestId)) : allGuestIds;
	const guests = await models.Guest.find({ _id: gIds }).select('phone ottIds');
	const ottChecks = [];

	guests.forEach(guest => {
		if (guest.phone) {
			filter.$or.push({
				toId: { $in: [guest.phone, guest.phone.replace('+', '')] },
			});
		}

		_.forEach(OTT.OTTs, (func, ottName) => {
			const guestOtt = _.get(guest, ['ottIds', ottName]);

			if (guestOtt) {
				filter.$or.push({
					toId: guestOtt,
					ottName,
				});
			} else if (guest.phone && func.findUserByPhone) {
				ottChecks.push({
					ottName,
					phone: guest.phone,
				});
			}
		});

		// _.forEach(guest && guest.ottIds, (ottId, ottName) => {
		// 	if (ottId) {
		// 		filter.$or.push({
		// 			toId: ottId,
		// 			ottName,
		// 		});
		// 	}
		// });
	});

	if (ottChecks.length) {
		const otts = await models.Ott.find({
			active: true,
			groupIds: { $in: message.groupIds },
			$or: ottChecks.map(ottCheck => ({
				[ottCheck.ottName]: true,
			})),
		}).lean();

		await ottChecks.asyncMap(async ottCheck => {
			const ottUser = await OTT.OTTs[ottCheck.ottName].findUserByPhone({
				phone: ottCheck.phone,
				account: otts.filter(ott => ott[ottCheck.ottName]).map(ott => ott.phone),
			});
			if (ottUser) {
				filter.$or.push({
					toId: ottUser.ottId,
					ottName: ottCheck.ottName,
				});
			}
		});
	}

	return { filter };
}

async function getMessageTimeline(message, { guestId, start, limit }, user) {
	const { filter } = await getTimelineFilter(message, guestId, user);

	if (!filter.$or.length) {
		return {
			timelines: [],
			total: 0,
		};
	}

	// const [data, total] = await Promise.all([
	// 	models.OTTMessage.find(filter).sort({ time: -1 }).skip(start).limit(limit).lean(),
	// 	models.OTTMessage.countDocuments(filter),
	// ]);

	const data = await models.OTTMessage.find(filter).sort({ time: -1 }).skip(start).limit(limit).lean();

	const total = start + data.length + 1;

	const messages = _.reverse(message.messages);
	messages.forEach((m, i) => {
		m.messageId = m.messageId || `${message.otaBookingId}_${i}`;
	});

	const msgObjs = _.keyBy(messages, 'messageId');

	const timelines = await data.asyncMap(timeline => parseTimeline(timeline, msgObjs));
	const senders = await getSenders(data);

	const histories = await getMsgActionHistories(
		_.entries(_.groupBy(timelines, 'ottName')).map(([ottName, msgs]) => ({
			ottName,
			messageIds: _.compact(_.map(msgs, 'messageId')),
		}))
	);

	return {
		timelines,
		total,
		senders,
		histories,
	};
}

async function replyTimeline(query, data, user) {
	const { filter } = await getTimelineFilter(data.message, query.guestId, user);

	const lastMsg = await models.OTTMessage.findOne({ ...filter, event: InboxType.MESSAGE })
		.sort({ time: -1 })
		.lean();

	let result;

	if (lastMsg && _.values(OTTs).includes(lastMsg.ottName) && lastMsg.toId) {
		result = await sendOTTMessage({
			ottName: lastMsg.ottName,
			messageId: data.message._id,
			phone: lastMsg.toId,
			sender: lastMsg.sender,
			inbox: data.inbox,
			user,
			text: query.msg,
			attachments: query.attachments,
		});
	} else {
		result = await postMessage({
			...query,
			message: data.message,
			user,
		});
	}

	return result;
}

async function syncMessageByThread({ threadId, messageId, account, otaName, messageOnly }) {
	try {
		const syncFunc = _.get(otaMessages, [otaName, 'syncMessageByThread']);
		if (typeof syncFunc !== 'function') return;

		const lockKey = `${threadId}_${otaName}`;
		if (MessageLock.isBusy(lockKey)) return;

		await MessageLock.acquire(lockKey, async () => {
			if (messageId) {
				const exists = await models.Messages.findOne({
					otaName,
					threadId,
					'messages.messageId': messageId,
				}).select('_id');
				if (exists) return;
			}
			const otaConfig = await models.OTAManager.findOne({ active: true, account, name: otaName });
			return syncFunc({ threadId, otaConfig, messageOnly });
		});
	} catch (e) {
		logger.error(e);
	}
}

function typingMessage(data) {
	eventEmitter.emit(EVENTS.MESSAGE_TYPING, data);
}

function connect() {
	try {
		Object.values(otaMessages).forEach(funcs => {
			if (typeof funcs.connect !== 'function') return;
			funcs.connect();
		});
	} catch (e) {
		logger.error(e);
	}
}

async function onReservation(booking) {
	try {
		const syncMessageOTAs = [OTAs.Booking];

		if (syncMessageOTAs.includes(booking.otaName)) {
			await Promise.delay(1000);

			const message = await models.Messages.findById(booking.messages);

			await syncMessage(message, false);
		}
	} catch (e) {
		logger.error('onReservation', e);
	}
}

eventEmitter.on(EVENTS.MESSAGE_THREAD_UPDATE, syncMessageByThread);
eventEmitter.on(EVENTS.MESSAGE_ADD, addMessages);
eventEmitter.on(EVENTS.RESERVATION, onReservation);

connect();

module.exports = {
	getMessage,
	syncMessage,
	postMessage,
	approveInquiry,
	declineInquiry,
	typingMessage,
	getMessageTimeline,
	replyTimeline,
};

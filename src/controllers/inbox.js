const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const {
	InboxType,
	Services,
	BookingStatus,
	BookingGuideStatus,
	BookingTimeInOutStatus,
	BookingPaymentStatus,
	BookingGuideDoneStatus,
	MessageUser,
	Attitude,
	BookingStatusKeys,
	ProblemStatus,
	PAYMENT_CARD_STATUS,
} = require('@utils/const');
const { eventEmitter, EVENTS } = require('@utils/events');
const { getArray } = require('@utils/query');
const { removeAccents } = require('@utils/generate');
const models = require('@models');

const BOOKING_STATUS = _.values(BookingStatusKeys);
const CONFIRMATION_STATUS = [
	BookingStatusKeys.GuideStatus,
	BookingStatusKeys.CallStatus,
	BookingStatusKeys.TimeInOutStatus,
	BookingStatusKeys.PaymentStatus,
	BookingStatusKeys.PaymentSubStatus,
];

const CHECKIN_STATUS = [BookingStatusKeys.GuideStatus, BookingStatusKeys.CallStatus, BookingStatusKeys.TimeInOutStatus];
const CHECKIN_STATUS_VALUES = [
	BookingGuideStatus.CantContact,
	BookingGuideStatus.Responding,
	BookingGuideStatus.WaitingForResponse,
	BookingTimeInOutStatus.None,
];

async function updateInbox(data, msg, isRead, forceUpdateKeyword) {
	if (!data.mthread && data.inboxType === InboxType.MESSAGE && data.messageId) {
		data.mthread = await models.Messages.findById(data.messageId).select('-messages').lean();
	}

	const read = isRead || !!(data.mthread && data.mthread.notification === false);

	const [inbox] = await models.BlockInbox.updateOrCreate(data, read, forceUpdateKeyword);

	if (data.senderId && data.senderId !== 'BOT') {
		eventEmitter.emit(EVENTS.MESSAGE_SEND, data);
	} else if (data.inboxType === InboxType.MESSAGE) {
		eventEmitter.emit(EVENTS.MESSAGE_RECEIVE, data, msg, read, inbox);
	}
}

async function addChatInbox(otaName, chat, title) {
	let listingId = null;
	let bookingId = null;
	let blockId = null;

	if (chat.otaListingId) {
		const listing = await models.Listing.findListingByOTA(otaName, chat.otaListingId);
		if (listing) {
			listingId = listing._id;
			({ blockId } = listing);
		} else {
			logger.warn('Inbox addChatInbox, listing not found', otaName, chat.otaListingId);
		}
	}
	if (chat.otaBookingId) {
		const booking = await models.Booking.findOne({ otaName, otaBookingId: chat.otaBookingId });
		if (booking) {
			bookingId = booking._id;
			({ blockId } = booking);
		} else {
			logger.warn('Inbox addChatInbox, Booking not found', otaName, chat.otaBookingId);
		}
	}
	if (!blockId) {
		logger.warn('Inbox addChatInbox blockId not found', otaName, chat.otaBookingId);
	}

	await updateInbox({
		inboxType: InboxType.MESSAGE,
		title,
		subTitle: _.truncate(_.get(_.last(chat.messages), 'message')),
		messageId: chat._id,
		bookingId,
		listingId,
		blockId,
		otaName,
		groupIds: chat.groupIds,
		otaBookingId: chat.otaBookingId,
		inquiry: chat.inquiry,
		mthread: chat,
	});
}

async function addReservationInbox(booking, inboxType = InboxType.RESERVATION, oldRooms, newRooms) {
	const title =
		inboxType === InboxType.CANCELED
			? 'Reservation canceled'
			: inboxType === InboxType.RESERVATION_UPDATE
			? 'Reservation update'
			: booking.status === BookingStatus.REQUEST
			? 'Request'
			: 'Reservation confirmed';

	const subTitle = `from ${booking.from.toDateMysqlFormat()} to ${booking.to.toDateMysqlFormat()}`;

	const data = {
		inboxType,
		title,
		subTitle,
		messageId: booking.messages,
		bookingId: booking._id,
		listingId: booking.listingId,
		blockId: booking.blockId,
		guestId: booking.guestId,
		groupIds: booking.groupIds,
		otaName: booking.otaName,
		otaBookingId: booking.otaBookingId,
		from: booking.from,
		to: booking.to,
		serviceType: booking.serviceType,
		isPaid: booking.isPaid,
		status: booking.status,
		guideStatus: booking.guideStatus,
		guideDoneStatus: booking.guideDoneStatus,
		paymentDone: booking.paymentDone,
		paymentStatus: booking.paymentStatus,
	};

	models.OTTMessage.create({
		ottName: booking.otaName,
		otaName: booking.otaName,
		otaBookingId: booking.otaBookingId,
		time: new Date(),
		fromMe: true,
		event: inboxType,
		user: MessageUser.BOT,
	}).catch(e => {
		logger.error(e);
	});

	await updateInbox(data, null, booking.serviceType === Services.Month, !!newRooms);
}

async function getInbox(user, query) {
	const start = parseInt(query.start) || 0;
	const limit = parseInt(query.limit) || 20;
	const from = query.from && new Date(query.from).minTimes();
	const to = query.to && new Date(query.to).maxTimes();
	const keyword = _.trim(query.name);
	const dateKey = query.dateType === 'createdAt' ? 'createdAt' : query.dateType === 'checkout' ? 'to' : 'from';
	const filterBlockIds = getArray(query.blocks || query.blockIds);
	const otas = getArray(query.otas || query.otaName || query.ota);
	const attitude = getArray(query.attitude);

	const filter = {
		$and: [
			{
				isPrivate: { $in: [null, false] },
			},
		],
	};
	const sorter = { read: 1 };

	if (keyword) {
		const limitLength = 50;
		if (keyword.length > limitLength) {
			throw new ThrowReturn(`Từ khoá không được vượt quá ${limitLength} kí tự.`);
		}
		const normKeyword = removeAccents(keyword);
		const reg = new RegExp(_.escapeRegExp(normKeyword));
		filter.$and.push(
			{
				$text: {
					$search: normKeyword,
				},
			},
			{ keywords: reg }
		);
	}

	if (filterBlockIds) {
		const { blockIds } = await models.Host.getBlocksOfUser({
			user,
			filterBlockIds,
			excludeBlockId: query.excludeBlockId,
		});
		filter.$and.push({
			blockId: { $in: blockIds },
		});
	} else {
		filter.$and.push({
			groupIds: { $in: user.groupIds },
		});
	}

	if (query.read !== undefined) filter.$and.push({ read: query.read });
	if (query.isGroup !== undefined) {
		filter.$and.push({ isGroup: query.isGroup });
	}
	if (query.isUser !== undefined) {
		filter.$and.push({ isUser: query.isUser });
	}
	if (query.userType) {
		filter.$and.push({ userType: query.userType });
	}
	if (from) {
		filter.$and.push({ [dateKey]: { $gte: from } });
	}
	if (to) {
		filter.$and.push({ [dateKey]: { $lte: to } });
	}
	if (otas) {
		const otaNames = await models.BookingSource.getSourceByGroup(otas);
		filter.$and.push({ otaName: { $in: otaNames } });
	}
	if (query.inquiry !== undefined) {
		filter.$and.push({ inquiry: query.inquiry });
	}
	if (query.reply !== undefined) {
		filter.$and.push({ reply: query.reply });
	}
	if (attitude) {
		const attitudes = [...attitude];
		if (attitudes.includes(Attitude[1])) attitudes.push(null);
		filter.$and.push({ attitude: { $in: attitudes } });
	}
	if (query.status) {
		filter.$and.push({ status: query.status });
	}

	const andStatus = {};
	let needCheckin;

	BOOKING_STATUS.forEach(csKey => {
		if (query[csKey]) {
			const arrQueries = _.isArray(query[csKey]) ? query[csKey] : [query[csKey]];
			const values = arrQueries.map(q =>
				_.isNaN(parseInt(q)) ? (q === 'true' ? true : q === 'false' ? false : q) : parseInt(q)
			);

			andStatus[csKey] = values.length <= 1 ? values[0] : values;

			if (CONFIRMATION_STATUS.includes(csKey)) {
				andStatus.status = BookingStatus.CONFIRMED;
			}

			if (
				needCheckin !== false &&
				CHECKIN_STATUS.includes(csKey) &&
				CHECKIN_STATUS_VALUES.some(v => values.includes(v))
			) {
				needCheckin = true;
			} else {
				needCheckin = false;
			}

			if (csKey === BookingStatusKeys.ContactOTAStatus) {
				sorter.from = 1;
			}
		}
	});

	if (andStatus.paymentStatus === BookingPaymentStatus.NoInfo && !andStatus.guideDoneStatus) {
		if (_.includes(andStatus.guideStatus, BookingGuideStatus.Done)) {
			andStatus.guideDoneStatus = { $ne: BookingGuideDoneStatus.CantContact };
		}
		if (_.includes(andStatus.guideStatus, BookingGuideStatus.CantContact)) {
			andStatus.$or = [
				{
					guideStatus: andStatus.guideStatus,
				},
				{
					guideStatus: BookingGuideStatus.Done,
					guideDoneStatus: BookingGuideDoneStatus.CantContact,
				},
			];
			delete andStatus.guideStatus;
		}
	}

	if (needCheckin) {
		andStatus.checkin = null;
	}

	if (query.displayToday) {
		const today = new Date().zeroHours();
		andStatus.from = query.displayToday === 'true' ? { $eq: today } : { $ne: today };
	}

	if (!_.isEmpty(andStatus)) {
		if (_.isEmpty(query.problemStatus)) {
			andStatus.display = true;
		}
		filter.$and.push(andStatus);
	}

	if (!query.showData) {
		const total = await models.BlockInbox.countDocuments(filter);
		return { total };
	}

	if (query.time) {
		filter.updatedAt = { $gt: new Date(query.time) };
	}

	if (query.paymentCardStatus) {
		filter['paymentCardState.status'] = query.paymentCardStatus;
		if (query.paymentCardStatus === PAYMENT_CARD_STATUS.INVALID) {
			filter.$and.push(
				{ status: BookingStatus.CONFIRMED },
				{ isPaid: false },
				{
					$or: [
						{
							'paymentCardState.markedAt': null,
						},
						{
							'paymentCardState.markedAt': { $lte: moment().subtract(4, 'hour').toDate() },
						},
					],
				}
			);
		}
	}
	if (query.paymentChargedStatus) {
		filter['paymentCardState.chargedStatus'] = query.paymentChargedStatus;
	}

	const chain = models.BlockInbox.find(filter)
		.sort({ ...sorter, updatedAt: -1 })
		.select(
			`read inboxType title subTitle ottSource createdAt updatedAt guestId blockId roomIds messageId bookingId userType ${BOOKING_STATUS.join(
				' '
			)}`
		)
		.populate({ path: 'blockId', select: 'info.name info.shortName' })
		.populate({ path: 'roomIds', select: 'info.roomNo' })
		.populate({
			path: 'messageId',
			select: 'otaName declined inquiry approved otaBookingId inquiryDetails.pageName guestId attitude',
			populate: {
				path: 'guestId',
				select: 'displayName fullName avatar genius isVip phone',
			},
		})
		.populate({
			path: 'bookingId',
			select: 'from to price otaName otaBookingId blockId status error checkin checkinType checkout checkoutType isPaid reservateRooms totalCall totalMsg',
			populate: [
				{
					path: 'reservateRooms',
					select: 'info.name info.roomNo',
				},
				{
					path: 'totalCall totalMsg',
				},
			],
		});

	if (!query.time) {
		chain.skip(start).limit(limit + 1);
	} else {
		chain.limit(50);
	}

	const docs = await chain.lean();

	const total = start + docs.length;
	const inbox = _.take(docs, limit);

	inbox.forEach(i => {
		i.reservatedRooms = _.get(i.bookingId, 'reservateRooms');
	});

	return { inbox, total };
}

async function unread(user, query) {
	const filterBlockIds = getArray(query.blocks || query.blockIds);

	const { state } = query;

	const filter = {
		isPrivate: { $in: [null, false] },
	};

	if (filterBlockIds) {
		const { blockIds } = await models.Host.getBlocksOfUser({
			user,
			filterBlockIds,
			excludeBlockId: query.excludeBlockId,
		});
		filter.blockId = { $in: blockIds };
	} else {
		filter.groupIds = { $in: user.groupIds };
	}

	if (!state) {
		filter.read = false;
	}

	if (state === BookingStatusKeys.GuideStatus) {
		filter.guideStatus = {
			$in: [BookingGuideStatus.CantContact, BookingGuideStatus.Responding, BookingGuideStatus.WaitingForResponse],
		};
		filter.display = true;
	}
	if (state === BookingStatusKeys.TimeInOutStatus) {
		filter.timeInOutStatus = {
			$in: [BookingTimeInOutStatus.None, BookingTimeInOutStatus.DoneIn],
		};
	}
	if (state === BookingStatusKeys.PaymentStatus) {
		filter.paymentDone = false;
		filter.display = true;
	}
	if (state === BookingStatusKeys.ProblemStatus) {
		filter.problemStatus = {
			$in: [
				ProblemStatus.Pending,
				ProblemStatus.Doing,
				ProblemStatus.WaitingForPartnerFix,
				ProblemStatus.DoingManyTimes,
			],
		};
	}

	if (state === 'chargedError') {
		filter['paymentCardState.status'] = PAYMENT_CARD_STATUS.INVALID;

		filter.$and = filter.$and || [];
		filter.$and.push(
			{ status: BookingStatus.CONFIRMED },
			{ isPaid: false },
			{
				$or: [
					{
						'paymentCardState.markedAt': null,
					},
					{
						'paymentCardState.markedAt': { $lte: moment().subtract(4, 'hour').toDate() },
					},
				],
			}
		);
	}

	if (CONFIRMATION_STATUS.includes(state)) {
		filter.status = BookingStatus.CONFIRMED;
	}

	if (CHECKIN_STATUS.includes(state)) {
		filter.checkin = null;
	}

	return models.BlockInbox.countDocuments(filter);
}

async function changeInboxStatus(inbox, user, read) {
	inbox.read = read;

	if (read) {
		inbox.readBy = user._id;
		inbox.readTime = new Date();
	}

	await inbox.save();
}

eventEmitter.on(EVENTS.RESERVATION, (booking, guest, roomIds) => {
	addReservationInbox(booking, InboxType.RESERVATION, null, roomIds);
});

eventEmitter.on(EVENTS.RESERVATION_UPDATE, (booking, ...args) => {
	addReservationInbox(booking, InboxType.RESERVATION_UPDATE, ...args);
});

eventEmitter.on(EVENTS.RESERVATION_CANCEL, booking => {
	addReservationInbox(booking, InboxType.CANCELED);
});

eventEmitter.on(EVENTS.INQUIRY, (guest, messageId, listingId, otaName, booking) => {
	if (booking) {
		addReservationInbox(booking, InboxType.RESERVATION);
	}
});

module.exports = {
	addChatInbox,
	unread,
	getInbox,
	updateInbox,
	changeInboxStatus,
};

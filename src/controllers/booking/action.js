const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { eventEmitter, EVENTS } = require('@utils/events');
const { BookingLogs, BookingStatus, BookingCheckinType, CLEANING_STATE, Services, RuleDay } = require('@utils/const');
const models = require('@models');
const synchornize = require('@controllers/ota_api/synchronize');
const { ProblemStatus } = require('@utils/const');
const WorkNote = require('@controllers/working/work_note');
// const { roundTime } = require('@utils/date');

async function autoCheckoutAfterCheckin(reservation, booking, user) {
	try {
		const block = await models.Block.findOne({ _id: booking.blockId, 'locker.forceCheckin': true }).select('_id');
		if (block) return;

		const bookingsNeedCheckout = await models.Booking.find({
			_id: { $ne: booking._id },
			status: BookingStatus.CONFIRMED,
			error: 0,
			to: new Date().zeroHours(),
			reservateRooms: reservation.roomId,
			checkedIn: true,
			checkedOut: false,
		});

		await bookingsNeedCheckout.asyncForEach(b => {
			return [b.guestId, ...b.guestIds].asyncForEach(guestId => {
				return checkout({ booking: b, guestId, user, checkoutType: user ? null : BookingCheckinType.A }).catch(
					e => {
						logger.error(e);
					}
				);
			});
		});
	} catch (e) {
		logger.error(e);
	}
}

async function syncCheck(booking, type = 'in') {
	const sync = _.get(synchornize, [booking.otaName, `syncCheck${type}`]);
	if (!sync) return;

	try {
		const listing = await models.Listing.findById(booking.listingId);
		const otaListing = listing && listing.getOTA(booking.otaName);
		const otaConfig =
			otaListing &&
			(await models.OTAManager.findOne({
				name: otaListing.otaName,
				account: otaListing.account,
				active: true,
			}));
		const message = await models.Messages.findOne({ otaName: booking.otaName, otaBookingId: booking.otaBookingId });

		await sync({ booking, message, otaListing, otaConfig });
	} catch (e) {
		logger.error(`syncCheck${type} error`, e);
	}
}

async function checkin({ booking, guestId, guestIds, user, checkinType, roomId, cardInfo, note }) {
	if (booking.status !== BookingStatus.CONFIRMED) throw new ThrowReturn("Can't Check-in");

	const userId = user && user._id;
	const gId = guestIds || guestId || booking.guestId;

	const guests = await models.Guest.find({ _id: gId });
	if (!guests.length) throw new ThrowReturn('Không tìm thấy thông tin khách!');

	const gIds = _.map(guests, '_id');

	if (!checkinType && !_.isEmpty(cardInfo)) {
		checkinType = BookingCheckinType.RC;
	}
	if (cardInfo) {
		cardInfo.createdBy = userId;
		cardInfo.createdAt = new Date();
		cardInfo.guestIds = gIds;
	}

	const reservation = await models.Reservation.checkin(booking._id, gIds, checkinType, roomId, cardInfo);

	booking.checkin = booking.checkin || new Date();
	booking.customersupport = userId;
	if (checkinType) booking.checkinType = checkinType;
	await booking.save();

	await models.BlockInbox.updateOne({ bookingId: booking._id }, { checkin: booking.checkin });

	syncCheck(booking, 'in');

	eventEmitter.emit(EVENTS.RESERVATION_CHECKIN, booking, guests, user, reservation);

	models.Booking.addLog({
		bookingId: booking._id,
		userId,
		action: BookingLogs.GUEST_CHECKIN,
		data: gIds.join(','),
		description: note,
	});

	if (!booking.ignoreFinance) {
		autoCheckoutAfterCheckin(reservation, booking, user);
	}

	return booking;
}

async function checkout({ booking, guestId, guestIds, user, checkoutType, cardInfo, note }) {
	if (booking.status !== BookingStatus.CONFIRMED) throw new ThrowReturn("Can't Check-out");

	let gId = guestIds || guestId || booking.guestId;

	if (!_.isEmpty(cardInfo)) {
		const reservation = await models.Reservation.findOne({
			bookingId: booking._id,
			card: {
				$elemMatch: {
					lockno: cardInfo.lockno,
					cardno: cardInfo.cardno,
				},
			},
		});
		if (!reservation) {
			throw new ThrowReturn('Không tìm thấy thông tin thẻ trong đặt phòng!');
		}

		const card = reservation.card.find(c => c.cardno === cardInfo.cardno);
		gId = card.guestIds;
		checkoutType = checkoutType || BookingCheckinType.RC;
	}

	const guests = await models.Guest.find({ _id: gId });
	if (!guests.length) throw new ThrowReturn('Không tìm thấy thông tin khách!');

	const userId = user && user._id;
	const gIds = _.map(guests, '_id');

	await models.Reservation.checkout(booking._id, gIds, checkoutType);

	booking.checkout = booking.checkout || new Date();
	if (checkoutType) booking.checkoutType = checkoutType;
	await booking.save();

	await models.BlockInbox.updateOne({ bookingId: booking._id }, { checkout: booking.checkout });

	models.Booking.addLog({
		bookingId: booking._id,
		userId,
		action: BookingLogs.GUEST_CHECKOUT,
		data: gIds.join(','),
		description: note,
	});

	const reservations = await models.Reservation.find({ bookingId: booking._id, 'guests.guestId': { $in: gIds } });
	const roomIds = reservations
		.filter(r => !r.guests.find(g => !g.checkout)) // filter rooms all guests checked out
		.map(r => r.roomId);

	eventEmitter.emit(EVENTS.RESERVATION_CHECKOUT, booking, guests, !!roomIds.length);

	if (!roomIds.length) return booking;

	syncCheck(booking, 'out');

	// clear remain dates
	const today = new Date().zeroHours();
	const isHourService = booking.serviceType === Services.Hour;

	if (booking.to > today && !isHourService) {
		await models.BlockScheduler.clearReservations({
			bookingId: booking._id,
			blockId: booking.blockId,
			rooms: roomIds,
			from: today,
			to: booking.to,
			checkout: true,
		});
	}

	await models.BlockScheduler.updateOne(
		{
			date: isHourService
				? booking.from
				: moment(_.min([today, booking.to]))
						.subtract(1, 'day')
						.toDate(),
			blockId: booking.blockId,
			reservations: { $elemMatch: { bookingId: booking.id, roomId: { $in: roomIds } } },
		},
		{ $set: { 'reservations.$[elem].checkout': _.min([moment().format('HH:mm'), booking.toHour, RuleDay.to]) } },
		{
			multi: true,
			arrayFilters: [{ 'elem.bookingId': booking.id, 'elem.roomId': { $in: roomIds } }],
		}
	);

	const dateToSync = isHourService ? booking.from : booking.to;

	if (moment(dateToSync).isSame(today, 'day')) {
		models.JobCalendar.createByRooms({
			roomIds,
			from: dateToSync,
			to: dateToSync,
			description: 'Checkout Booking',
		});
	}

	await models.BlockNotes.updateCleaningState({
		blockId: booking.blockId,
		roomIds,
		date: today,
		user,
		state: CLEANING_STATE.VD,
	});

	await WorkNote.switchStatusForCheckout(booking._id, ProblemStatus.CheckoutAndNotDone, user);

	return booking;
}

async function undoCheckIn(booking, guestId, user) {
	const result = await models.Reservation.updateMany(
		{
			bookingId: booking._id,
			guests: { $elemMatch: { guestId } },
		},
		{ $unset: { 'guests.$.checkin': 1, 'guests.$.checkinType': 1 } }
	);
	if (!result.nModified) return;

	await models.Reservation.updateMany(
		{
			bookingId: booking._id,
			card: { $elemMatch: { guestIds: guestId } },
		},
		{ $pull: { 'card.$.guestIds': guestId } },
		{
			many: true,
		}
	);

	const hasCheckedIn = await models.Reservation.findOne({
		bookingId: booking._id,
		guests: { $elemMatch: { checkin: { $ne: null } } },
	}).select('_id');

	if (!hasCheckedIn) {
		await Promise.all([
			models.Booking.updateOne(
				{ _id: booking._id },
				{
					$set: { checkedIn: false },
					$unset: { checkin: 1, customersupport: 1, checkinType: 1, doorCodeGenerated: 1 },
				}
			),
			models.Reservation.updateMany({ bookingId: booking._id }, { $unset: { doorCodeGenerated: 1 } }),
		]);

		await models.BlockInbox.updateOne({ bookingId: booking._id }, { $unset: { checkin: 1 } });

		eventEmitter.emit(EVENTS.RESERVATION_CHECKIN_UNDO, booking);
	}

	await models.Booking.addLog({
		bookingId: booking._id,
		userId: user._id,
		action: BookingLogs.GUEST_CHECKIN_UNDO,
		data: guestId,
	});
}

async function undoCheckOut(booking, guestId, user) {
	const reservations = await models.Reservation.find({
		bookingId: booking._id,
		guests: { $elemMatch: { guestId } },
	}).select('roomId');

	const roomIds = reservations.length ? _.map(reservations, 'roomId') : booking.reservateRooms;

	const options =
		booking.serviceType === Services.Hour
			? {
					fromHour: booking.fromHour,
					toHour: booking.toHour,
					excludeBookingIds: [booking._id],
			  }
			: {
					checkin: booking.fromHour,
					checkout: booking.toHour,
					excludeBookingIds: [booking._id],
			  };

	const availableRoomIds = await models.BlockScheduler.findAvailableRooms(
		roomIds,
		booking.blockId,
		booking.from,
		booking.to,
		options
	);

	if (!availableRoomIds || availableRoomIds.length < roomIds.length) {
		throw new ThrowReturn('Rooms not available', roomIds);
	}

	const result = await models.Reservation.updateMany(
		{
			bookingId: booking._id,
			guests: { $elemMatch: { guestId } },
		},
		{ $unset: { 'guests.$.checkout': 1, 'guests.$.checkoutType': 1 } }
	);
	if (!result.nModified) return;

	await models.BlockScheduler.reservateRooms(
		booking._id,
		booking.blockId,
		roomIds,
		booking.from,
		booking.to,
		options
	);

	const hasCheckedOut = await models.Reservation.findOne({
		bookingId: booking._id,
		guests: { $elemMatch: { checkout: { $ne: null } } },
	}).select('_id');
	if (!hasCheckedOut) {
		await models.Booking.updateOne(
			{ _id: booking._id },
			{ $set: { checkedOut: false }, $unset: { checkout: 1, checkoutType: 1 } }
		);
		await models.BlockInbox.updateOne({ bookingId: booking._id }, { $unset: { checkout: 1 } });
	}

	await models.Booking.addLog({
		bookingId: booking._id,
		userId: user._id,
		action: BookingLogs.GUEST_CHECKOUT_UNDO,
		data: guestId,
	});
}

async function checkoutAll({ user, blockId, otas, bookingId, serviceType }) {
	const today = new Date().zeroHours();
	const query = {
		status: BookingStatus.CONFIRMED,
		to: today,
		checkedIn: true,
		checkedOut: false,
	};

	if (bookingId) {
		query._id = bookingId;
	}
	if (otas) {
		_.set(
			query,
			'otaName.$in',
			await models.BookingSource.getSourceByGroup(_.isArray(otas) ? otas : otas.split(','))
		);
	}
	if (serviceType) {
		query.serviceType = serviceType;
	}

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		roomKey: 'reservateRooms',
	});
	const ignoreBlocks = await models.Block.find({
		active: true,
		isProperty: true,
		'locker.forceCheckin': true,
	}).select('_id');

	if (ignoreBlocks.length) {
		query.$and = [
			filters,
			{
				blockId: { $nin: _.map(ignoreBlocks, '_id') },
			},
		];
	} else {
		_.assign(query, filters);
	}

	const bookings = await models.Booking.find(query).select('-histories');
	if (!bookings.length) {
		throw new ThrowReturn('There are no matching bookings');
	}

	await bookings.asyncForEach(booking =>
		_.uniqBy([booking.guestId, ...booking.guestIds], _.toString).asyncForEach(guestId =>
			checkout({ booking, guestId, user }).catch(() => {})
		)
	);
}

async function checkinAll({ user, blockId }) {
	const today = new Date().zeroHours();
	const filter = {
		status: BookingStatus.CONFIRMED,
		from: {
			$lte: today,
		},
		to: {
			$gt: today,
		},
		serviceType: Services.Month,
		checkedIn: false,
	};

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		roomKey: 'reservateRooms',
	});

	const ignoreBlocks = await models.Block.find({
		active: true,
		isProperty: true,
		'locker.forceCheckin': true,
	}).select('_id');

	if (ignoreBlocks.length) {
		filter.$and = [
			filters,
			{
				blockId: { $nin: _.map(ignoreBlocks, '_id') },
			},
		];
	} else {
		_.assign(filter, filters);
	}

	const bookings = await models.Booking.find(filter).select('-histories');
	if (!bookings.length) {
		throw new ThrowReturn('There are no matching bookings');
	}

	await bookings.asyncForEach(booking =>
		_.uniqBy([booking.guestId, ...booking.guestIds], _.toString).asyncForEach(guestId =>
			checkin({ booking, guestId, user }).catch(() => {})
		)
	);
}

module.exports = {
	checkin,
	checkout,
	undoCheckIn,
	undoCheckOut,
	checkoutAll,
	checkinAll,
};

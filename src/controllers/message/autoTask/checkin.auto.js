const _ = require('lodash');

const { logger } = require('@utils/logger');
const { BookingStatus, BookingCheckinType } = require('@utils/const');
const models = require('@models');
const BookingAction = require('@controllers/booking/action');

const CHECKOUT_KEYWORD = [' out', ' đã trả phòng', ' da tra phong', ' trả phòng', ' tra phong'];
const CHECKIN_KEYWORD = [' in', ' đã nhận phòng', ' da nhan phong', ' nhận phòng', ' nhan phong'];
const PRIORITY = 3;

function validateKeywords({ message }) {
	const isCheckedOut = CHECKOUT_KEYWORD.some(key => message.endsWith(key));
	const isCheckedIn = CHECKIN_KEYWORD.some(key => message.endsWith(key));

	return {
		isValid: isCheckedOut || isCheckedIn,
		keywords: isCheckedOut ? CHECKOUT_KEYWORD : isCheckedIn ? CHECKIN_KEYWORD : [],
		validateData: {
			isCheckedOut,
			isCheckedIn,
		},
	};
}

async function runJob({ validateData, blockId, roomIds, user, time }) {
	if (!roomIds || !roomIds.length || !user || !blockId) return;

	const block = await models.Block.findOne({ _id: blockId, 'locker.forceCheckin': true }).select('_id');
	if (block) return;

	const { isCheckedOut } = validateData;

	const filters = {
		blockId,
		status: BookingStatus.CONFIRMED,
		reservateRooms: { $in: roomIds },
	};
	const today = new Date(time).zeroHours();
	if (isCheckedOut) {
		filters.to = today;
	} else {
		filters.from = { $lte: today };
		filters.to = { $gt: today };
	}

	const bookings = await models.Booking.find(filters);
	if (!bookings.length) return;

	const reservations = await models.Reservation.find({
		bookingId: { $in: _.map(bookings, '_id') },
		roomId: { $in: roomIds },
	}).select('guests bookingId roomId');

	const func = isCheckedOut ? BookingAction.checkout : BookingAction.checkin;
	const guestIdsHaveRooms = _.chain(reservations).map('guests').flatten().map('guestId').value();
	const keyType = isCheckedOut ? 'checkoutType' : 'checkinType';

	await reservations.asyncForEach(async reservation => {
		const guests = _.filter(
			reservation.guests,
			isCheckedOut ? guest => guest.checkin && !guest.checkout : guest => !guest.checkin && !guest.checkout
		);
		const booking = bookings.find(b => b._id.equals(reservation.bookingId));
		const guestIds = guests.length
			? _.map(guests, 'guestId')
			: _.differenceBy([booking.guestId, ...booking.guestIds], guestIdsHaveRooms, _.toString);

		await guestIds.asyncForEach(guestId =>
			func({ booking, guestId, user, [keyType]: BookingCheckinType.M, roomId: reservation.roomId }).catch(e => {
				logger.error(e);
			})
		);

		addLogActivity({
			user,
			blockId,
			roomIds,
			isCheckedOut,
			booking,
			guestIds,
		});
	});

	return true;
}

async function addLogActivity({ user, blockId, roomIds, isCheckedOut, booking, guestIds }) {
	const type = isCheckedOut ? 'BOOKING_CHECKOUT_MSG' : 'BOOKING_CHECKIN_MSG';

	const data = {
		username: user.username,
		method: 'ZALO',
		action: `/${booking._id}`,
		data: JSON.stringify({
			bookingId: booking._id,
			guestIds,
		}),
		type,
		blockId,
		roomId: roomIds && roomIds[0],
	};

	await models.UserLog.create(data).catch(e => {
		logger.error('addLogActivity', data, e);
	});
}

module.exports = {
	validateKeywords,
	runJob,
	PRIORITY,
};

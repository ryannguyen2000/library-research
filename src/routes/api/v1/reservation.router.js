const _ = require('lodash');

const { Errors, BookingStatus, Services } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const router = require('@core/router').Router();
const models = require('@models');
const optimizer = require('@controllers/optimizer');
const { ReservateCalendarLock } = require('@utils/lock');

const BookingAction = require('@controllers/booking/action');
const Booking = require('@controllers/booking');
const Reservation = require('@controllers/booking/reservation');
const Reservate = require('@controllers/booking/reservate');
const Schedule = require('@controllers/schedule');

async function getSchedule(req, res) {
	const { roomId, from, to } = req.query;

	const data = await Schedule.getRoomSchedule(roomId, new Date(from), new Date(to));

	res.sendData(data);
}

async function getBlockSchedule(req, res) {
	const { from, to, ...query } = req.query;
	const { blockId } = req.params;

	const data = await Schedule.getBlockSchedule(
		{
			...query,
			...req.data,
			blockId,
			from: new Date(from).zeroHours(),
			to: new Date(to).zeroHours(),
		},
		req.decoded.user
	);

	res.sendData(data);
}

async function requestAccessSchedule(req, res) {
	const data = await Schedule.requestAccessSchedule(req.decoded.user, req.data.block, req.body);

	res.sendData(data);
}

async function createReservation(req, res) {
	const {
		body,
		decoded: { user },
	} = req;

	body.status = BookingStatus.CONFIRMED;
	body.amount = body.rooms.length;

	const rs =
		body.serviceType === Services.Month
			? await Reservate.reservateMonth(body, user)
			: await Reservate.reservate(body, user);

	res.sendData(rs);
}

async function cancelReservation(req, res) {
	const { bookingId, reason } = req.body;

	const data = await Reservation.cancelReservation({
		reservation: req.body,
		fullCancelled: false,
		userId: req.decoded.user._id,
		reason,
	});
	await models.Booking.updateOne({ _id: bookingId }, { $set: { manual: true, error: 0 } });

	res.sendData(data);
}

async function changeDate(req, res) {
	const { booking } = req.data;
	const data = req.body;
	data.userId = req.decoded.user._id;

	await Reservation.changeBookingDate(booking, data);

	res.sendData();
}

async function changeDatePrice(req, res) {
	const { bookingId, from, to, fromHour, toHour, changeToRoomIds: roomIds } = req.query;
	const changeToRoomIds = _.isArray(roomIds) ? roomIds : roomIds.split(',');
	const body = {
		bookingId,
		from,
		to,
		fromHour,
		toHour,
		changeToRoomIds,
	};

	const data = await Booking.changeBookingDatePriceData(body, false);

	res.sendData(data);
}

async function lockRoom(req, res) {
	const { roomId } = req.params;
	const { from, to, fromHour, toHour, locked, rooms, type, note } = req.body;

	const userId = req.decoded.user._id;

	await Schedule.lockRoom({
		roomIds: rooms && rooms.length ? rooms : roomId,
		from,
		to,
		fromHour,
		toHour,
		locked,
		type,
		userId,
		note,
	});

	res.sendData();
}

async function swapReservations(req, res) {
	const { b1, r1, b2, r2 } = req.body;

	const reservations = await Reservation.swapReservations(b1, r1, b2, r2, req.decoded.user._id);

	const blockId = _.get(reservations, '[0].booking.blockId');
	if (blockId) {
		_.set(req, ['logData', 'blockId'], blockId);
	}

	res.sendData();
}

async function noShow(req, res) {
	await Reservation.noShow(req.data.booking, req.decoded.user);

	res.sendData();
}

async function getSwapBookings(booking) {
	if (booking.error !== Errors.RoomNotAvailable || booking.status !== BookingStatus.CONFIRMED || !booking.listingId) {
		throw new ThrowReturn("Can't fix this error");
	}

	const swaps = await optimizer.rearrangeBooking(booking.listingId, booking.toObject());
	if (!swaps) {
		throw new ThrowReturn("Can't fix this error!");
	}

	return swaps;
}

async function rearrangeBookingReview(req, res) {
	const swaps = await getSwapBookings(req.data.booking);

	const rs = await swaps.asyncMap(async swap => {
		swap.booking = await models.Booking.findById(swap._id)
			.select('-expenses -histories -images -reservateRooms')
			.populate('guestId');
		swap.oldRoomId = swap.oldRoomId
			? await models.Room.findById(swap.oldRoomId).select('info.name info.roomNo')
			: null;
		swap.newRoomId = await models.Room.findById(swap.newRoomId).select('info.name info.roomNo');
		return swap;
	});

	res.sendData({ swaps: rs });
}

async function rearrangeBooking(req, res) {
	const { booking } = req.data;

	await ReservateCalendarLock.acquire(booking.blockId, async () => {
		const swaps = await getSwapBookings(req.data.booking);

		await Reservation.arrangeReservations(swaps, req.decoded.user);
	});

	res.sendData();
}

async function undoCheckIn(req, res) {
	await BookingAction.undoCheckIn(req.data.booking, req.body.guestId, req.decoded.user);

	res.sendData();
}

async function undoCheckOut(req, res) {
	await BookingAction.undoCheckOut(req.data.booking, req.body.guestId, req.decoded.user);

	res.sendData();
}

async function undoNoshow(req, res) {
	await Reservation.undoNoshow(req.data.booking, req.decoded.user);

	res.sendData();
}

async function undoCancelled(req, res) {
	await Reservation.undoCancelled(req.data.booking, req.decoded.user);

	res.sendData();
}

async function splitReservation(req, res) {
	await Reservation.splitReservation(req.body.bookingId, req.body.date, req.decoded.user._id);

	res.sendData();
}

async function chargeReservation(req, res) {
	const rs = await Reservation.chargeReservation(req.data.booking, req.decoded.user);

	res.sendData(rs);
}

async function undoChargeReservation(req, res) {
	const rs = await Reservation.undoChargeReservation(req.data.booking, req.decoded.user);

	res.sendData(rs);
}

router.postS('/', createReservation, true);
router.getS('/schedule', getSchedule, true);
router.getS('/schedule/:blockId', getBlockSchedule, true);
router.postS('/schedule/:blockId/requestAccess', requestAccessSchedule, true);
router.getS('/changeDatePrice', changeDatePrice, true);
router.postS('/cancel', cancelReservation, true);
router.postS('/changeDate', changeDate, true);
router.postS('/lock/:roomId', lockRoom, true);
router.postS('/swap', swapReservations, true);
router.postS('/noShow', noShow, true);
router.postS('/rearrange_review/:bookingId', rearrangeBookingReview, true);
router.postS('/rearrange/:bookingId', rearrangeBooking, true);

router.postS('/undoCheckIn', undoCheckIn, true);
router.postS('/undoCheckOut', undoCheckOut, true);
router.postS('/undoCancelled', undoCancelled, true);
router.postS('/undoNoshow', undoNoshow, true);
router.postS('/splitReservation', splitReservation, true);
router.postS('/status/charge', chargeReservation, true);
router.postS('/status/charge/undo', undoChargeReservation, true);

const activity = {
	RESERVATION_CREATE: {
		key: '/',
		exact: true,
	},
	RESERVATION_SWAP: {
		key: 'swap',
	},
	RESERVATION_NOSHOW: {
		key: 'noShow',
	},
	RESERVATION_LOCK: {
		key: 'lock',
	},
	RESERVATION_UPDATE: {
		key: 'changeDate',
	},
	RESERVATION_CANCEL: {
		key: 'cancel',
	},
	RESERVATION_UNDO_CHECKIN: {
		key: 'undoCheckIn',
	},
	RESERVATION_UNDO_CHECKOUT: {
		key: 'undoCheckOut',
	},
	RESERVATION_UNDO_CANCEL: {
		key: 'undoCancelled',
	},
	RESERVATION_UNDO_NOSHOW: {
		key: 'undoNoshow',
	},
	RESERVATION_SPLIT: {
		key: 'splitReservation',
	},
	RESERVATION_RESOLVE: {
		key: '/rearrange/{id}',
	},
	RESERVATION_CHARGE: {
		key: '/status/charge',
	},
	RESERVATION_UNDO_CHARGE: {
		key: '/status/charge',
	},
	RESERVATION_CALENDAR_REQUEST: {
		key: '/schedule/{id}/requestAccess',
	},
};

module.exports = { router, activity };

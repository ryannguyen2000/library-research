const fs = require('fs');
const paths = require('path');
const moment = require('moment');
const _ = require('lodash');

const { UPLOAD_CONFIG } = require('@config/setting');
const { LocalOTAs, BookingStatus, CLEANING_STATE, BookingCheckinType } = require('@utils/const');
const { saveImages } = require('@utils/file');
const { logger } = require('@utils/logger');
const router = require('@core/router').SelfCheckin();
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const BookingAction = require('@controllers/booking/action');

async function checkin(req, res) {
	const { id } = req.params;
	const { ota } = req.query;
	const { cardno = 0, validate, requestCard } = req.body;

	const validateData = await validateCheckin({ id, ota, ...req.body });

	if (validate) {
		const { booking, room } = validateData;

		const hotel = await models.Block.findById(booking.blockId).select('locker');
		const hotelId = _.get(hotel, 'locker.hotelId', '01');

		const data = {
			lockno: `${hotelId}0${room.info.roomNo.replace(/\D/g, '')}`,
			edate: moment(booking.to).hours(12).minutes(30).format('YMMDDHHmm'),
			cardno,
		};

		logger.warn('validate checkin', booking._id, data);
		return res.sendData(data);
	}

	const { guests } = await saveGuestInfo({ ...req.body, ...validateData });
	const card = await handleCheckin({ guests, requestCard, ...validateData });

	res.sendData(card);
}

async function saveGuestInfo({ passport, avatar, phone, room, reservation, booking }) {
	const guests = [];
	await passport.asyncForEach(async (p, i) => {
		if (reservation.card[i]) return;
		let guest;
		const passportUrl = await saveImages(p, UPLOAD_CONFIG.FOLDER.GUEST);
		const avatarUrl = await saveImages(avatar[i], UPLOAD_CONFIG.FOLDER.GUEST);

		const checkGuest = reservation.guests.find(g => g.guestId.equals(booking.guestId));

		if (i === 0 && (!checkGuest || checkGuest.roomId.equals(room._id))) {
			guest = await models.Guest.findById(booking.guestId);
			guest.passport = [passportUrl];
			guest.avatar = avatarUrl;
			if (!guest.phone && phone) guest.phone = phone.replace(/\D/g, '');
			await guest.save();
		} else {
			const name = `Khách ${i + 1}`;
			guest = await models.Guest.findGuest({
				otaId: `${booking.otaBookingId}-g${i}-r${room.info.roomNo}`,
				name,
				fullName: name,
				displayName: null,
				ota: booking.otaName,
				passport: [passportUrl],
				avatar: avatarUrl,
				messages: booking.messageId,
			});
		}
		guests.push(guest._id);
	});

	return {
		guests,
	};
}

async function validateCheckin({ id, ota, roomId, passport }) {
	if (!id) throw new ThrowReturn('NOT_FOUND');
	const bookings = await models.Booking.find({ otaBookingId: id.toUpperCase(), otaName: ota });
	if (!bookings.length) throw new ThrowReturn('NOT_FOUND');

	const resQuery = { bookingId: bookings.map(b => b._id) };
	if (roomId) resQuery.roomId = roomId;
	const reservation = await models.Reservation.findOne(resQuery);
	if (!reservation) throw new ThrowReturn('NOT_FOUND');

	const booking = bookings.find(b => b._id.equals(reservation.bookingId));
	const room = await models.Room.findById(reservation.roomId).select('info');
	const { accommodates } = await models.Listing.getAccommodation(room._id);

	if (passport && passport.length && reservation.guests.filter(g => g.checkin).length >= accommodates)
		throw new ThrowReturn('CHECKED_IN');
	if (reservation.card.length >= accommodates) throw new ThrowReturn('CARD_LIMIT');

	return {
		reservation,
		booking,
		room,
	};
}

async function handleCheckin({ guests, reservation, requestCard, booking }) {
	logger.warn('handleCheckin', booking._id, requestCard);
	if (!requestCard || requestCard.code !== 0) {
		throw new ThrowReturn('CHECKIN_ERROR');
	}

	reservation.card.push({
		cardno: requestCard.data.cardno,
		lockno: requestCard.data.lockno,
	});

	if (guests.length) {
		guests.forEach(guestId => {
			if (reservation.guests.some(item => item.guestId.equals(guestId))) return;
			reservation.guests.push({ guestId });
		});

		let update = false;
		guests.forEach(g => {
			if (booking.guestId.equals(g) || booking.guestIds.some(guestId => guestId.equals(g))) return;
			update = true;
			booking.guestIds.push(g);
		});
		if (update) await booking.save();
	}

	await reservation.save();
	await guests.asyncForEach(async g => {
		await BookingAction.checkin({ booking, guestId: g, checkinType: BookingCheckinType.SC }).catch(e =>
			logger.error('Self checkin error', e)
		);
	});

	return {
		card: reservation.card,
	};
}

function queryBooking(query) {
	return models.Booking.find({ status: BookingStatus.CONFIRMED, ...query })
		.select(
			'otaBookingId otaName blockId from to status price currency numberAdults numberChilden guestId rateType expectCheckIn expectCheckOut'
		)
		.populate('guestId', 'name fullName phone avatar passport')
		.populate('blockId', 'info.name info.address lockRoom');
}

async function getBooking(id, ota, throwError) {
	if (!id) throw new ThrowReturn('NOT_FOUND');
	id = id.toUpperCase();
	const from = new Date();
	from.zeroHours();
	const to = moment(from).add(1, 'day').hours(6).toDate();

	if (_.values(LocalOTAs).includes(ota)) {
		ota = _.values(LocalOTAs);
	}

	const query = { otaName: ota, otaBookingId: id, from: { $gte: from, $lte: to } };
	let bookings = await queryBooking(query);

	if (!bookings.length) {
		delete query.otaName;
		bookings = await queryBooking(query);
		if (!bookings.length) {
			if (throwError) throw new ThrowReturn('NOT_FOUND');
			return;
		}
	}

	const booking = {
		...bookings[0].toObject(),
		rooms: [],
		price: _.sumBy(bookings, 'price'),
	};

	await bookings.asyncMap(async book => {
		const promise = models.Reservation.find({ bookingId: book._id })
			.select('roomId guests card')
			.populate('roomId', '_id info');
		if (throwError) promise.populate('guests.guestId', 'avatar passport');
		const reservations = await promise;

		await reservations.asyncForEach(async r => {
			const accommodates = throwError ? await models.Listing.getAccommodation(r.roomId._id) : {};
			const checked = _.filter(r.guests, g => g.checkin);
			const passport = [];
			const avatar = [];
			if (throwError) {
				checked.forEach(g => {
					if (g.guestId.avatar && g.guestId.passport.length) {
						passport.push(_.last(g.guestId.passport));
						avatar.push(g.guestId.avatar);
					}
				});
			}
			booking.rooms.push({
				...r.roomId.toObject(),
				checkin: checked.length >= accommodates.accommodates,
				card: r.card,
				passport,
				avatar,
				...accommodates,
			});
		});
	});

	if (throwError && booking.rooms.every(r => r.checkin)) throw new ThrowReturn('CHECKED_IN');

	const payment = await models.Booking.getPayment({ otaBookingId: id, otaName: ota });
	booking.paid = !payment.amount;

	return booking;
}

async function getDataForCheckin(req, res) {
	const { id } = req.params;
	const { ota } = req.query;

	const booking = await getBooking(id, ota, true);
	await booking.rooms.asyncForEach(async room => {
		const status = await models.BlockNotes.getCleaningState(booking.blockId, room._id);
		if (status === CLEANING_STATE.VD) throw new ThrowReturn('ROOM_VD');
	});

	res.sendData(booking);
}

async function checkout(req, res) {
	const { code, data } = req.body;
	if (code === 0) {
		const reservation = await models.Reservation.findOne({
			'card.lockno': data.lockno,
			'card.cardno': data.cardno,
		});
		if (!reservation) throw new ThrowReturn('CARD_NOT_FOUND');

		reservation.card = reservation.card.filter(c => c.cardno === data.cardno && c.lockno === data.lockno);
		await reservation.save();

		if (!reservation.card.length && reservation.guests.length) {
			const booking = await models.Booking.findById(reservation.bookingId);
			await reservation.guests.asyncForEach(g => BookingAction.checkout({ booking, guestId: g.guestId }));
		}
	} else {
		throw new ThrowReturn('CARD_READ_ERROR');
	}

	res.sendData();
}

function insertDataToPrint(template, data) {
	Object.keys(data || {}).forEach(key => {
		template = template.replace(key, data[key] || '');
	});
	return template;
}

async function getDataPrint(req, res) {
	res.setHeader('Content-type', 'text/html');

	try {
		const { room, booking, ota } = req.query;

		const book = await getBooking(booking, ota);
		const roomSelected = book.rooms.find(r => r._id.equals(room));
		const template = fs.readFileSync(paths.join(__dirname, '/template.html'), 'utf-8');

		const dataPrint = {
			'{{date}}': moment().format('DD-MMM-Y'),
			'{{no}}': book.otaBookingId,
			'{{home}}': book.blockId.info.name,
			'{{address}}': book.blockId.info.address,
			'{{room}}': roomSelected.info.roomNo,
			'{{name}}': book.guestId && book.guestId.fullName.toUpperCase(),
			'{{checkin}}': moment(book.from).format('DD/MM/Y'),
			'{{checkout}}': moment(book.to).format('DD/MM/Y'),
			'{{amount}}': book.paid
				? ''
				: `<tr><td><p>AMOUNT:</p></td><td><p>${`${Number(book.price).toLocaleString()} ${
						book.currency
				  }`}</p></td></tr>`,
			'{{state}}': book.paid ? 'PAID' : 'UNPAID',
			'{{wifiName}}': roomSelected.info.wifi,
			'{{wifiPassword}}': roomSelected.info.wifiPassword,
			'{{payment_reminder}}': book.paid ? '' : 'Please pay the room charge before 18:00',
		};

		res.send(insertDataToPrint(template, dataPrint));
	} catch (e) {
		res.send('<h3>Error</h3>');
	}
}

router.postS('/giveBackCard', checkout);
router.getS('/checkin/:id', getDataForCheckin);
router.postS('/checkin/:id', checkin);

router.getS('/printer.html', getDataPrint, false);

module.exports = { router };

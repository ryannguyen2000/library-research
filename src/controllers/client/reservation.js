const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');
const QRCode = require('qrcode');

const { UPLOAD_CONFIG } = require('@config/setting');
const { OTAs, LocalOTAs, BookingStatus, Errors, Currency, ThirdPartyPayment } = require('@utils/const');
const { genBookingCode } = require('@utils/generate');
const { saveImages } = require('@utils/file');
const { isEmail } = require('@utils/validate');
const { getTimeInOut } = require('@utils/date');
const { logger } = require('@utils/logger');

// const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { detectPassportBase64 } = require('@services/computerVision');
const Reservation = require('@controllers/booking/reservation');
const Booking = require('@controllers/booking');
const { getPromotionPrice } = require('@controllers/promotion/promotion.config');
const { throwError, ERROR_CODE } = require('./error');

const MAX_DAY_LENGTH = 60;

function getBookingFee(paymentValue) {
	if (!paymentValue) return null;
	return models.BookingFee.findOne({ type: paymentValue });
}

function validateBody(body, language) {
	body.phone = _.trim(body.phone);
	body.email = _.trim(body.email);
	body.fullName = _.trim(body.fullName);
	body.name = _.trim(body.name);
	body.rooms = parseInt(body.rooms) || 1;
	body.guests = parseInt(body.guests) || 1;

	if (body.rooms <= 0) {
		// throw new ThrowReturn(`Số phòng không hợp lệ! Number of rooms is not valid!`);
		return throwError(ERROR_CODE.INVALID_ROOM, language);
	}
	if (body.guests <= 0) {
		return throwError(ERROR_CODE.INVALID_GUEST, language);
		// throw new ThrowReturn(`Số khách không hợp lệ! Number of guests is not valid!`);
	}
	if (!moment(body.checkIn).isValid() || !moment(body.checkOut).isValid() || moment().isAfter(body.checkIn, 'date')) {
		// throw new ThrowReturn(`Ngày nhận/trả phòng không hợp lệ! Check-in/out date is not valid!`);
		return throwError(ERROR_CODE.INVALID_RANGE, language);
	}

	body.from = new Date(body.checkIn);
	body.to = new Date(body.checkOut);

	if (moment(body.to).diff(body.from, 'day') > MAX_DAY_LENGTH) {
		return throwError(ERROR_CODE.OUT_OF_RANGE, language, [MAX_DAY_LENGTH]);
	}

	if (!body.fullName) {
		// throw new ThrowReturn(`Hãy nhập tên! Name is required!`);
		return throwError(ERROR_CODE.INVALID_GUEST_NAME, language);
	}
	if (!body.phone || body.phone.length < 6) {
		// throw new ThrowReturn(`Số điện thoại không hợp lệ! Phone number is not valid`);
		return throwError(ERROR_CODE.INVALID_GUEST_PHONE, language);
	}
	if (body.email && !isEmail(body.email)) {
		// throw new ThrowReturn('Email không hợp lệ! Email is not valid!');
		return throwError(ERROR_CODE.INVALID_GUEST_EMAIL, language);
	}

	return body;
}

async function inquiry(body, language) {
	let { name, fullName, email, phone, guests, from, to, listingId, ratePlanId, message, paymentValue, rooms } =
		validateBody(body, language);

	const listing =
		listingId &&
		(await models.Listing.findBySlugOrId(listingId)
			.populate('blockId', 'groupIds')
			.populate('roomTypeId', 'roomIds'));
	const ota = listing && listing.getOTA(LocalOTAs.tbWeb);

	if (!ota) {
		return throwError(ERROR_CODE.NOT_FOUND_LISTING, language);
	}

	if (!ratePlanId || !ota.rates.some(r => r.ratePlanId === ratePlanId)) {
		ratePlanId = _.get(
			_.find(ota.rates, r => r.active),
			'ratePlanId'
		);
	}

	if (!ratePlanId || !listing.roomTypeId) {
		// throw new ThrowReturn('Không tìm thấy loại giá phù hợp! RatePlan not found!');
		return throwError(ERROR_CODE.NOT_FOUND_LISTING, language);
	}

	const backlist = await models.GuestBlacklist.getBlacklist({ phone, groupIds: listing.blockId.groupIds });
	if (backlist) {
		return throwError(ERROR_CODE.DEFAULT, language);
	}

	const error = await Booking.checkBookingError(listing.blockId._id, listing.roomTypeId.roomIds, from, to, rooms);
	if (error !== 0) {
		if (error === Errors.RoomNotAvailable) {
			return throwError(ERROR_CODE.ROOM_IS_FULL, language);
			// throw new ThrowReturn(`Phòng hiện tại không sẵn có! Current room not available!`);
		}

		return throwError(ERROR_CODE.DEFAULT, language);
	}

	const { defaultPrice, promoPrice, rates } = await getPromotionPrice({
		blockId: listing.blockId._id,
		// roomIds: listing.roomIds,
		checkIn: from,
		checkOut: to,
		// otaListingId: ota.otaListingId,
		numRoom: rooms,
		roomTypeId: listing.roomTypeId._id,
		ratePlanId,
	}).catch(e => {
		logger.error('inquiry.getPromotionPrice', e);
		return throwError(ERROR_CODE.DEFAULT, language);
	});

	let roomPrice = promoPrice || defaultPrice;
	let bookingFees = await getBookingFee(paymentValue);
	let priceItems;
	let bookingFee;
	let price = roomPrice;

	if (bookingFees && bookingFees.value) {
		bookingFee = bookingFees.value;
		priceItems = [
			{
				title: 'Giá phòng',
				amount: roomPrice,
				currency: bookingFees.currency,
				priceType: bookingFees.type,
			},
			{
				title: bookingFees.description,
				amount: bookingFees.value,
				currency: bookingFees.currency,
				priceType: 'room_price',
			},
		];
		price += bookingFee;
		if (rates && rates[0]) {
			rates[0].price += bookingFee;
		}
	}

	// create inquiry
	const otaBookingId = await genBookingCode();

	const data = {
		otaName: OTAs.tbWeb,
		otaBookingId,
		otaListingId: ota.otaListingId,
		from,
		to,
		amount: rooms,
		status: BookingStatus.REQUEST,
		roomPrice,
		priceItems,
		bookingFee,
		currency: Currency.VND,
		guest: {
			name,
			fullName,
			email,
			phone,
			ota: OTAs.tbWeb,
			otaId: phone,
		},
		thread: {
			id: otaBookingId,
		},
		numberAdults: guests,
		numberChilden: 0,
		inquiryDetails: {
			from,
			to,
			price,
			amount: rooms,
			currency: Currency.VND,
			numberAdults: guests,
			numberChilden: 0,
		},
		rates,
		ratePlanId,
		rooms: listing.roomTypeId.roomIds,
	};

	const { booking } = await Reservation.confirmReservation(data);

	// add note
	if (booking && message) {
		await booking.addHistory({ description: `Guest's note: ${message}` });
	}

	return { bookingId: otaBookingId, otaName: OTAs.tbWeb, booking };
}

async function inquiryDetail(id, language) {
	const booking = await models.Booking.findOne({
		otaBookingId: id,
		status: [BookingStatus.CONFIRMED, BookingStatus.REQUEST],
	})
		.select(
			'otaName blockId listingId from to price currency status error numberAdults numberChilden guestId serviceType amount ratePlan'
		)
		.populate('blockId', 'info.name info.address info.address_en')
		.populate('listingId', 'OTAs info.images name')
		.populate('guestId', 'name fullName phone email')
		.then(data => data && data.toJSON());

	if (!booking) {
		return throwError(ERROR_CODE.PAYMENT_BOOKING_NOT_FOUND, language);
	}

	booking.payment = await models.Booking.getPayment({ otaBookingId: id, otaName: booking.otaName });
	_.unset(booking, 'payment.bookings');

	if (booking.listingId) {
		const localOTA = booking.listingId.OTAs.find(o => o.active && o.otaName === OTAs.tbWeb);
		booking.listingId.name = localOTA && localOTA.otaListingName;
		_.unset(booking, 'listingId.OTAs');
	}

	if (booking.guestId && !_.values(LocalOTAs).includes(booking.otaName)) {
		_.unset(booking, 'guestId.email');
	}

	booking.nights = moment(booking.to).diff(booking.from, 'day');
	booking.from = getTimeInOut(booking.from);
	booking.to = getTimeInOut(booking.to, 'out');
	booking.checkinStr = moment(booking.from).format('DD/MM/YYYY');
	booking.checkoutStr = moment(booking.to).format('DD/MM/YYYY');

	if (booking.payment.amount) {
		const paymentRef = await models.PaymentRef.findOne({
			otaBookingId: id,
			otaName: booking.otaName,
			method: ThirdPartyPayment.BANK_TRANSFER,
			amount: booking.payment.amount,
		}).select('qrCode');

		if (paymentRef && paymentRef.qrCode) {
			try {
				booking.qrDataURL = await QRCode.toDataURL(paymentRef.qrCode);
			} catch (e) {
				//
			}
		}
	}

	return booking;
}

async function checkPassport(body, language) {
	const { guestId, front, back, face } = body;

	if (!mongoose.Types.ObjectId.isValid(guestId) || !front || !back) {
		return throwError(ERROR_CODE.PAYMENT_BOOKING_NOT_FOUND, language);
		// throw new ThrowReturn('Dữ liệu không hợp lệ! Invalid data!');
	}
	const guest = await models.Guest.findById(guestId);
	if (!guest) {
		// throw new ThrowReturn('Dữ liệu không hợp lệ! Invalid data!');
		return throwError(ERROR_CODE.INVALID_PARAMS, language);
	}
	if (!guest.passport) guest.passport = [];

	const urlFront = await saveImages(front, UPLOAD_CONFIG.FOLDER.GUEST);
	const detectData = await detectPassportBase64(front).catch(() => null);
	if (!detectData) {
		return throwError(ERROR_CODE.DEFAULT, language);
		// throw new ThrowReturn('Lỗi máy chủ, vui lòng thử lại sau! Internal server error, lease try again!');
	}

	_.unset(detectData, 'data.image');
	const data = await models.CSV.create({ url: urlFront, data: detectData });

	if (!data.isValid()) {
		return throwError(ERROR_CODE.INVALID_ID_CARD, language);
		// throw new ThrowReturn(
		// 	_.get(data, 'data.invalidMessage') || 'Hộ chiếu/CMND/CCCD không hợp lệ! Passport/ID card is not valid!'
		// );
	}

	const urlBack = await saveImages(back, UPLOAD_CONFIG.FOLDER.GUEST);
	if (face) {
		const urlFace = await saveImages(face, UPLOAD_CONFIG.FOLDER.GUEST);
		guest.passport.push(urlFace);
	}

	guest.passport.push(urlFront, urlBack);
	guest.getPassportType = 'web';
	guest.getPassportTime = new Date();
	await guest.save();

	return {
		...data.getGuestInfo(),
		phone: guest.phone,
		guest,
	};
}

async function sendCheckinData(body, language) {
	const { guestId, guestData } = body;

	if (mongoose.Types.ObjectId.isValid(guestId) && _.isObject(guestData)) {
		const guest = await models.Guest.findById(guestId);
		// if (!guest) throw new ThrowReturn('Dữ liệu không hợp lệ! Invalid data!');
		if (!guest) return throwError(ERROR_CODE.INVALID_PARAMS, language);

		const dataUpdate = _.pick(guestData, [
			'fullName',
			'phone',
			'passportNumber',
			'dayOfBirth',
			'gender',
			'address',
		]);

		Object.assign(guest, _.pickBy(dataUpdate));
		await guest.save();

		return guest;
	}

	throwError(ERROR_CODE.INVALID_PARAMS, language);
	// throw new ThrowReturn('Dữ liệu không hợp lệ! Invalid data!');
}

async function searchBookings({ bookingCode }) {
	bookingCode = _.trim(bookingCode).toUpperCase();

	if (!bookingCode)
		return {
			bookingCode: [],
		};

	const bookings = await models.Booking.find({ otaBookingId: bookingCode, status: BookingStatus.CONFIRMED }).select(
		'otaName otaBookingId rateType'
	);

	const localOTAs = _.values(LocalOTAs);

	return {
		bookingCode: _.uniq(bookings.map(b => b.otaBookingId)),
		paidOnOTA: bookings.some(booking => !localOTAs.includes(booking.otaName) && booking.isRatePaid()),
	};
}

module.exports = { inquiry, inquiryDetail, checkPassport, sendCheckinData, searchBookings };

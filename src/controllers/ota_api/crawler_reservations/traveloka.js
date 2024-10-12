const moment = require('moment');
const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { OTAs, BookingStatus, BookingStatusOrder } = require('@utils/const');
const { logger } = require('@utils/logger');
const { isVirtualPhone } = require('@utils/phone');

const apis = require('@controllers/booking/reservation');
const { requestToTera } = require('@controllers/ota_api/utils');
// const { changeHotelSession } = require('@controllers/ota_api/headers/traveloka');
const models = require('@models');

// admin page: https://tera.traveloka.com/
const HOST = 'https://astbapi-public.ast.traveloka.com';
const OTAName = OTAs.Traveloka;
const MAX_PAGE = 20;
const PER_PAGE = 50;

const _mapAckRequestType = {
	CONFIRMED: BookingStatus.CONFIRMED,
	CANCELLED: BookingStatus.CANCELED,
	CANCELED: BookingStatus.CANCELED,
	NO_SHOW: BookingStatus.NOSHOW,
};

function mapAckRequestType(type) {
	const status = _mapAckRequestType[type];

	if (!status) {
		logger.warn('Traveloka AckRequestType cannot map to BookingStatus', type);
	}

	return status || BookingStatus.CONFIRMED;
}

function getTime(time) {
	const mtime = moment(time);
	return {
		month: mtime.month() + 1,
		day: mtime.date(),
		year: mtime.year(),
		timestamp: mtime.startOf('day').valueOf(),
	};
}

async function getInboxReservations(otaConfig, propertyId, from, to, resId, page = 1) {
	const body = {
		data: {
			hotelId: propertyId,
			hotelGroupId: null,
			checkInStartDate: resId ? null : getTime(from),
			checkInEndDate: resId ? null : getTime(to),
			hotelDistReservationId: resId || null,
			checkOutStartDate: null,
			checkOutEndDate: null,
			hotelRatePlanType: null,
			bookingStartDate: null,
			bookingEndDate: null,
			skip: (page - 1) * PER_PAGE,
			count: PER_PAGE,
		},
		// context: otaConfig.other.context,
		// auth: otaConfig.other.auth,
	};

	// const result = await fetchRetry(
	// 	`${HOST}/api/v2/reservation/getHotelReservationSummary`,
	// 	{
	// 		method: 'POST',
	// 		body: JSON.stringify(body),
	// 	},
	// 	otaConfig
	// );

	const result = await requestToTera({
		url: `${HOST}/api/v2/reservation/getHotelReservationSummary`,
		options: {
			method: 'POST',
		},
		otaConfig,
		hotelId: propertyId,
		body,
	});

	if (result.status !== 200) {
		logger.error('Traveloka get Property Bookings error', result.status, await result.text());
		return [];
	}

	const data = await result.json();

	const bookings = data.data.hotelReservationSummaries;
	bookings.sort((r1, r2) => {
		const o1 = BookingStatusOrder[mapAckRequestType(r1.status)];
		const o2 = BookingStatusOrder[mapAckRequestType(r2.status)];
		return o1 - o2;
	});

	for (const reservation of bookings) {
		await mapStatusToAction(otaConfig, reservation).catch(error => {
			logger.error(error);
		});
	}

	if (bookings.length < PER_PAGE || page > MAX_PAGE) return bookings;

	return await getInboxReservations(otaConfig, propertyId, from, to, resId, page + 1);
}

async function getDetailReservation(otaConfig, propertyId, reservationId) {
	const body = {
		data: {
			hotelReservationId: reservationId,
		},
		// context: otaConfig.other.context,
		// auth: otaConfig.other.auth,
	};

	// const result = await fetchRetry(
	// 	`${HOST}/api/v2/reservation/getHotelReservationDetailSummary`,
	// 	{
	// 		method: 'POST',
	// 		body: JSON.stringify(body),
	// 	},
	// 	otaConfig
	// );
	const result = await requestToTera({
		url: `${HOST}/api/v2/reservation/getHotelReservationDetailSummary`,
		options: {
			method: 'POST',
		},
		otaConfig,
		hotelId: propertyId,
		body,
	});

	if (result.status !== 200) {
		return Promise.reject(`Traveloka getDetailReservation detail error ${await result.text()}`);
	}

	const data = await result.json();
	return data.data;
}

function isBookingUpdated(booking, reservation) {
	if (
		!booking ||
		!booking.listingId ||
		booking.roomPrice !== reservation.roomPrice ||
		booking.rateType !== reservation.rateType ||
		booking.otaFee !== reservation.otaFee ||
		(!booking.manual &&
			(booking.from.toDateMysqlFormat() !== reservation.from.toDateMysqlFormat() ||
				booking.to.toDateMysqlFormat() !== reservation.to.toDateMysqlFormat()))
	) {
		return true;
	}
}

async function confirmReservation(otaConfig, reservation, status, detail) {
	const guest = reservation.guests[0];
	const contact = reservation._contact;
	const email = _.get(contact, ['emails', 0]);
	const contactPhone = _.get(contact, ['phones', 0]);
	const relativeEmails = ['@trip', '@ssbooking'];
	const isRelativeFromOtherOTA = relativeEmails.some(mail => _.includes(email, mail));

	const data = {
		otaName: OTAName,
		otaBookingId: reservation.hotelDistReservationId,
		from: new Date(Number(reservation.checkInDate.timestamp)),
		to: new Date(Number(reservation.checkOutDate.timestamp)),
		amount: Number(reservation.numRoom),
		status,
		thread: {
			id: reservation.hotelDistReservationId,
		},
		numberAdults: Number(reservation.numAdults),
		numberChilden: Number(reservation.numChildren),
		roomPrice: Number(reservation.fare.total),
		currency: reservation.currency,
		rateType: reservation.rateType,
		rateDetail: {
			ratePlanType: reservation._ratePlanType,
		},
		guest: {
			name: guest.lastName,
			fullName: `${guest.firstName} ${guest.lastName}`,
			email,
			ota: OTAName,
			otaId: `${OTAName}_${reservation.hotelDistReservationId}`,
			phone: isRelativeFromOtherOTA || (contactPhone && isVirtualPhone(contactPhone)) ? null : contactPhone,
		},
		otaFee: _.round((reservation.commissionPercent / 100) * reservation.fare.total),
	};

	const oldBook = await models.Booking.findOne({
		otaName: data.otaName,
		otaBookingId: data.otaBookingId,
	})
		.select('roomPrice listingId from to manual rateType otaFee')
		.lean();

	if (!isBookingUpdated(oldBook, data)) {
		return;
	}

	if (!detail) {
		detail = await getDetailReservation(otaConfig, reservation.hotelId, reservation.hotelDistReservationId);
	}

	const roomName = detail.hotelReservationRoomSummaries[0].hotelRoomName || '';
	data.otaListingId = detail.hotelReservationRoomSummaries[0].hotelRoomId;
	data.otaRateName = _.trim(roomName.split('-')[1]);

	await apis.confirmReservation(data);
}

async function cancelReservation(reservation, status) {
	const data = {
		otaName: OTAName,
		otaBookingId: reservation.hotelDistReservationId,
		declined: status === BookingStatus.DECLINED,
		status,
	};
	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function mapStatusToAction(otaConfig, reservation, detail) {
	const status = mapAckRequestType(reservation.status);
	switch (status) {
		case BookingStatus.CONFIRMED:
		case BookingStatus.REQUEST:
			await confirmReservation(otaConfig, reservation, status, detail);
			break;
		case BookingStatus.CANCELED:
		case BookingStatus.DECLINED:
		case BookingStatus.NOSHOW:
			await cancelReservation(reservation, status);
			break;
		// case AMENDED:
		// 	await changeDateReservation(reservation, status);
		// 	break;
		default:
			break;
	}
}

async function reservationsCrawler(otaConfig, from, to, resId) {
	from = from || moment().add(-1, 'day').toDate();
	to = to || moment().add(3, 'day').toDate();

	const propertyIds = await models.Block.getPropertiesId(OTAName, otaConfig.account);

	for (const propertyId of propertyIds) {
		// await changeHotelSession(otaConfig, propertyId);

		await getInboxReservations(otaConfig, propertyId, from, to, resId);
	}
}

async function crawlerReservationWithId(otaConfig, propertyId, reservationId) {
	// await changeHotelSession(otaConfig, propertyId);
	const detail = await getDetailReservation(otaConfig, propertyId, reservationId);

	await mapStatusToAction(otaConfig, detail.hotelReservationSummaries, detail);
}

async function checkApi(otaConfig) {
	const body = {
		auth: otaConfig.other.auth,
		context: otaConfig.other.context,
		data: {
			functionalityIdentifier: 'EXTRABED_ALLOTMENT',
			permission: ['VIEW'],
		},
	};
	const result = await fetchRetry(
		'https://astcnt-public.ast.traveloka.com/v1/authorize/isUserAuthorizedToAccessContent',
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaConfig
	);

	if (result.status !== 200) return false;
	const json = await result.json().catch(() => null);
	return json && json.status === 'SUCCESS' && json.data.status === 'AUTHORIZED';
}

module.exports = {
	crawlerReservationWithId,
	reservationsCrawler,
	checkApi,
};

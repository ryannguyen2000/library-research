const moment = require('moment');
const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { BookingStatus, OTAs, RateType, Currency } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const apis = require('@controllers/booking/reservation');

// admin page: https://hms.mytour.vn
const OTA = OTAs.Mytour;
const API_URI = 'https://gate.mytour.vn';
const PAGE_SIZE = 20;
const MAX_PAGE = 20;

async function getReservations(otaConfig, propertyId, from, to, page = 1) {
	const body = JSON.stringify({
		stayingFrom: moment(from).format('DD-MM-YYYY'),
		stayingTo: moment(to).format('DD-MM-YYYY'),
		hotelId: propertyId,
		bookingStatuses: ['success', 'cancelled', 'holding'],
		term: null,
	});

	const data = await fetchRetry(
		`${API_URI}/hms-premium/hotels/bookings?pageOffset=${page - 1}&pageSize=${PAGE_SIZE}`,
		{
			method: 'POST',
			body,
		},
		otaConfig
	).then(res => res.json());

	if (!data || !data.data || !data.data.items) {
		logger.error(`${OTA} getReservations error`, propertyId, body, data);
		return [];
	}

	if (data.data.pageIndex >= data.data.totalPage || page > MAX_PAGE) return data.data.items;

	const nextList = await getReservations(otaConfig, propertyId, from, to, page + 1);
	return [...data.data.items, ...nextList];
}

async function getBookingDetail(hotelId, id, otaConfig) {
	const data = await fetchRetry(
		`${API_URI}/hms-premium/hotels/bookings?hotelId=${hotelId}&id=${id}`,
		null,
		otaConfig
	).then(res => res.json());

	if (!data || !data.data) {
		logger.error(`${OTA} getBookingDetail error`, hotelId, id, JSON.stringify(data));
		return null;
	}

	return data.data;
}

async function confirmReservation(reservation, status, otaConfig) {
	// const booking = await models.Booking.findOne({ otaBookingId: reservation.bookingCode, otaName: OTA });
	// if (booking) return;

	const detail = await getBookingDetail(reservation.hotelId || reservation.rootHotelId, reservation.id, otaConfig);
	if (!detail) return;

	const { bookingRooms, checkIn, checkOut, bookingCode } = detail;
	const from = moment(checkIn, 'DD-MM-Y').format('Y-MM-DD');
	const to = moment(checkOut, 'DD-MM-Y').format('Y-MM-DD');

	await _.entries(_.groupBy(bookingRooms, 'roomId')).asyncForEach(([roomId, rooms]) => {
		const room = _.head(rooms);
		const data = {
			otaName: OTA,
			otaBookingId: bookingCode,
			otaListingId: roomId,
			from,
			to,
			amount: rooms.length,
			status,
			guest: {
				name: room.customerName,
				fullName: room.customerName,
				ota: OTA,
				phone: room.customerPhoneNumber,
				otaId: `${OTA}_${bookingCode}`,
			},
			numberChilden: _.sumBy(rooms, 'numChildren'),
			numberAdults: _.sumBy(rooms, 'numAdults'),
			// price: room.totalPriceRoom,
			roomPrice: _.sumBy(rooms, 'totalPriceRoom'),
			// otaFee: room.totalCommission, // commission
			otaFee: _.sumBy(rooms, 'totalCommission'),

			currency: Currency.VND,
			rateType: RateType.PAY_NOW,
			createdAt: new Date(),
			thread: { id: bookingCode },
			inquiryPostId: bookingCode,
		};

		return apis.confirmReservation(data);
	});

	// await bookingRooms.asyncForEach(async room => {
	// 	const data = {
	// 		otaName: OTA,
	// 		otaBookingId: bookingCode,
	// 		otaListingId: room.roomId,
	// 		from,
	// 		to,
	// 		amount: 1,
	// 		status,
	// 		guest: {
	// 			name: room.customerName,
	// 			fullName: room.customerName,
	// 			ota: OTA,
	// 			phone: room.customerPhoneNumber,
	// 			otaId: room.customerPhoneNumber || bookingCode,
	// 		},
	// 		numberChilden: room.numChildren,
	// 		numberAdults: room.numAdults,
	// 		price: room.totalPriceRoom,
	// 		otaFee: room.totalCommission, // commission
	// 		currency: Currency.VND,
	// 		rateType: RateType.PAY_NOW,
	// 		createdAt: new Date(),
	// 		thread: { id: bookingCode },
	// 		inquiryPostId: bookingCode,
	// 	};

	// 	await apis.confirmReservation(data);
	// });
}

function getBookingStatus({ bookingStatus }) {
	// if (bookingStatus === 2) return BookingStatus.CANCELED;
	if (bookingStatus === 'success') return BookingStatus.CONFIRMED;
	return BookingStatus.CANCELED;
	// return BookingStatus.REQUEST;
	// if ([0, 1].includes(boo_view)) return BookingStatus.REQUEST;
}

async function getFuncForReservation(reservation, propertyId, otaConfig) {
	const status = getBookingStatus(reservation);

	try {
		switch (status) {
			case BookingStatus.CONFIRMED:
			case BookingStatus.REQUEST:
				await confirmReservation(reservation, status, otaConfig);
				break;
			case BookingStatus.CANCELED:
			case BookingStatus.DECLINED:
			case BookingStatus.NOSHOW:
				await cancelReservation(reservation, status);
				break;
			default:
				break;
		}
	} catch (error) {
		logger.error(error);
	}
}

async function cancelReservation(reservation, status) {
	const data = {
		otaName: OTA,
		otaBookingId: reservation.bookingCode,
		declined: status === BookingStatus.DECLINED,
		status,
	};
	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function reservationsCrawler(otaConfig, from, to) {
	const propertIds = await models.Block.getPropertiesId(OTA, otaConfig.account);

	const dateFrom = from ? new Date(from) : new Date();
	dateFrom.setDate(dateFrom.getDate() - 1);
	const dateTo = to ? new Date(to) : new Date();

	for (const propertyId of propertIds) {
		const reservations = await getReservations(otaConfig, propertyId, dateFrom, dateTo);
		for (const reservation of reservations) {
			await getFuncForReservation(reservation, propertyId, otaConfig);
		}
	}
}

async function checkApi(otaConfig) {
	const rs = await fetchRetry(`${API_URI}/ams/account/simple-info`, null, otaConfig)
		.then(res => res.json())
		.catch(() => false);

	return rs && rs.code === 200;
	// const lastSeen = new Date(ota.updatedAt).valueOf();
	// return lastSeen + 20 * 60 * 1000 > Date.now();
}

module.exports = {
	reservationsCrawler,
	checkApi,
};

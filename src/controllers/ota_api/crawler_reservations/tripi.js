// const moment = require('moment');
// const _ = require('lodash');

// const fetchRetry = require('@utils/fetchRetry');
// const genUri = require('@utils/uri');
// const { BookingStatus, OTAs, DefaultRateId, RateType, DELAY_MINUTE_CHECK_HEADER } = require('@utils/const');
// const { logger } = require('@utils/logger');
// const models = require('@models');
// const apis = require('@controllers/booking/reservation');

// const OTAName = OTAs.Tripi;

// function getBookingStatus(status) {
// 	switch (status) {
// 		case 'success':
// 		case 'waiting':
// 			return BookingStatus.CONFIRMED;
// 		case 'refunded':
// 			return BookingStatus.CANCELED;
// 		case 'fail':
// 			return BookingStatus.DECLINED;
// 		default:
// 			return BookingStatus.DECLINED;
// 	}
// }

// function getProperties(account) {
// 	return models.Block.getPropertiesId(OTAName, account);
// }

// async function getListingId(blockId, account, otaListingName) {
// 	const listing = await models.Listing.findOne({
// 		blockId,
// 		OTAs: {
// 			$elemMatch: {
// 				account,
// 				otaName: OTAName,
// 				otaListingName: new RegExp(_.escapeRegExp(otaListingName), 'i'),
// 			},
// 		},
// 	}).select('_id');

// 	return listing && listing._id;
// }

// async function getPropertyBookings(data) {
// 	const { hotelId, fromDate, toDate, page = 0, otaConfig } = data;
// 	const page_size = 100;
// 	const uri = genUri('https://hms-api.tripi.vn/api/hotels/getHotelsBooking', {
// 		page_offset: page,
// 		page_size,
// 		fromDate,
// 		toDate,
// 		paymentStatusList: 'success',
// 		hotelId,
// 	});

// 	try {
// 		const res = await fetchRetry(uri, null, otaConfig);
// 		const json = await res.json();
// 		if (json.code !== 200) {
// 			logger.error(`${OTAName} get Property Bookings error`, hotelId, json);
// 			return [];
// 		}
// 		if (json.data.totalResults > (page + 1) * page_size)
// 			return [...json.data.hotelBookings, ...(await getPropertyBookings({ ...data, page: page + 1 }))];
// 		return json.data.hotelBookings;
// 	} catch (e) {
// 		logger.error(`${OTAName} get Property Bookings error`, hotelId, e);
// 		return [];
// 	}
// }

// async function getInboxReservations(otaConfig, from, to) {
// 	const properties = await getProperties(otaConfig.account);
// 	const dateFrom = from || new Date();
// 	const dateTo = to || new Date();

// 	const bookings = [];
// 	for (const propery of properties) {
// 		const result = await getPropertyBookings({
// 			hotelId: propery.propertyId,
// 			fromDate: moment(dateFrom).format('DD-MM-Y'),
// 			toDate: moment(dateTo).format('DD-MM-Y'),
// 			otaConfig,
// 		});
// 		for (const book of result) {
// 			const listingId = await getListingId(propery.blockId, otaConfig.account, book.roomTitle);
// 			bookings.push({
// 				...book,
// 				status: getBookingStatus(book.paymentStatus),
// 				listingId,
// 			});
// 		}
// 	}

// 	return bookings;
// }

// async function getDetailBook(bookingId, otaConfig) {
// 	try {
// 		const uri = `https://hms-api.tripi.vn/api/hotels/getBookingDetailsForProvider?bookingId=${bookingId}`;
// 		const results = await fetchRetry(uri, null, otaConfig).then(text => text.json());
// 		if (results.code === 200) {
// 			const { data } = results;
// 			const price = Number(data.finalPrice.replace(/\D/g, ''));
// 			return {
// 				price,
// 			};
// 		}
// 		return null;
// 	} catch (e) {
// 		return null;
// 	}
// }

// async function confirmReservation(reservation, otaConfig) {
// 	const data = {
// 		otaName: OTAName,
// 		otaBookingId: reservation.orderCode,
// 		listingId: reservation.listingId,
// 		from: new Date(moment(reservation.checkin, 'DD/MM/Y').format('Y-MM-DD')),
// 		to: new Date(moment(reservation.checkout, 'DD/MM/Y').format('Y-MM-DD')),
// 		amount: reservation.numRooms,
// 		status: reservation.status,
// 		guest: {
// 			name: reservation.customerName,
// 			fullName: reservation.customerName,
// 			ota: OTAName,
// 			otaId: reservation.hotelBookingId,
// 		},
// 		numberAdults: reservation.numAdults,
// 		numberChilden: reservation.numChildren,
// 		roomPrice: reservation.totalPrice,
// 		currency: 'VND',
// 		rateType: RateType.PAY_NOW,
// 	};
// 	const detail = await getDetailBook(reservation.hotelBookingId, otaConfig);
// 	if (detail) {
// 		Object.assign(data, detail);
// 	}

// 	data.thread = { id: reservation.hotelBookingId };
// 	await apis.confirmReservation(data);
// }

// async function cancelReservation(reservation) {
// 	const data = {
// 		otaName: OTAName,
// 		otaBookingId: reservation.orderCode,
// 		declined: reservation.status === BookingStatus.DECLINED,
// 		status: reservation.status,
// 	};

// 	await apis.cancelReservation({
// 		reservation: data,
// 		fullCancelled: true,
// 		cancelFromOTA: true,
// 	});
// }

// async function reservationsCrawler(otaConfig, from, to) {
// 	const reservations = await getInboxReservations(otaConfig, from, to);
// 	reservations.sort((r1, r2) => r2.status - r1.status);

// 	for (const reservation of reservations) {
// 		try {
// 			switch (reservation.status) {
// 				case BookingStatus.CONFIRMED:
// 				case BookingStatus.REQUEST:
// 					await confirmReservation(reservation, otaConfig);
// 					break;
// 				case BookingStatus.CANCELED:
// 				case BookingStatus.DECLINED:
// 					await cancelReservation(reservation);
// 					break;
// 				default:
// 					break;
// 			}
// 		} catch (error) {
// 			logger.error(error);
// 		}
// 	}
// }

// /**
//  * @param {object} ota
//  * @param {string} otaListingId
//  * @param {Date} from
//  * @param {Date} to
//  */
// async function priceCrawler(otaConfig, otaPropertyId, otaListing, from, to) {
// 	const body = {
// 		hotelId: parseInt(otaPropertyId),
// 		roomTypeId: parseInt(otaListing.otaListingId),
// 		rateTypeId: DefaultRateId,
// 		providerId: otaConfig.other.ui,
// 		timeFrom: moment(from).format('DD-MM-Y'),
// 		timeTo: moment(to).format('DD-MM-Y'),
// 	};

// 	let data = [];

// 	try {
// 		const result = await fetchRetry(
// 			'https://hms-api.tripi.vn/api/hotels/rate-control/list',
// 			{
// 				method: 'POST',
// 				body: JSON.stringify(body),
// 			},
// 			otaConfig
// 		);
// 		if (result.ok) {
// 			data = await result.json();
// 		}
// 	} catch (e) {
// 		logger.error(`${OTAName} crawler price error`);
// 		return [];
// 	}

// 	const rs = [];
// 	if (Array.isArray(data)) {
// 		data.forEach(rate => {
// 			const fromMoment = moment(rate.timeFrom, 'DD/MM/Y');
// 			const toMoment = moment(rate.timeTo, 'DD/MM/Y');
// 			while (fromMoment.isSameOrBefore(toMoment, 'day')) {
// 				rs.push({
// 					rateId: rate.rateTypeId,
// 					date: fromMoment.toDate(),
// 					price: rate.singleBedPrice,
// 				});
// 				fromMoment.add(1, 'day');
// 			}
// 		});
// 	}

// 	return rs;
// }

// function checkApi(ota) {
// 	const delay = (DELAY_MINUTE_CHECK_HEADER + 1) * 60 * 1000;
// 	return Date.now() + delay < ota.other.expiry;
// }

// module.exports = {
// 	reservationsCrawler,
// 	priceCrawler,
// 	checkApi,
// };

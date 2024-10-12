// const _ = require('lodash');

// const fetchRetry = require('@utils/fetchRetry');
// const {
// 	BookingStatus,
// 	BookingStatusOrder,
// 	OTAs,
// 	DefaultRateId,
// 	CurrencyConvert,
// 	RateType,
// 	Currency,
// } = require('@utils/const');
// const { logger } = require('@utils/logger');
// const Uri = require('@utils/uri');
// const MessageModel = require('@models/messages.model');
// const BookingModel = require('@models/booking.model');
// const apis = require('@controllers/booking/reservation');

// // admin page: https://host.luxstay.net
// const OTAName = OTAs.Luxstay;
// const URL = 'https://host.luxstay.net';
// const PER_PAGE = 50;
// const MAX_PAGE = 10;

// function getOtaListingId(otaListing) {
// 	return Number(otaListing.secondaryId || otaListing.otaListingId);
// }

// function getBookingStatus(status) {
// 	switch (status) {
// 		case 'completed':
// 		case 'checked_in':
// 		case 'paid':
// 			return BookingStatus.CONFIRMED;
// 		case 'guest_cancelled':
// 		case 'guest_aborted':
// 		case 'host_cancelled':
// 		case 'no_response':
// 		case 'expired':
// 			return BookingStatus.CANCELED;
// 		case 'requested':
// 		case 'payment_pending':
// 			return BookingStatus.REQUEST;
// 		case 'declined':
// 			return BookingStatus.DECLINED;
// 		default:
// 			return BookingStatus.CONFIRMED;
// 	}
// }

// async function getInboxReservations(params) {
// 	const { from, to, page = 1, otaConfig } = params;
// 	const fromDate = from || new Date();
// 	const toDate = to || new Date();
// 	if (!from) fromDate.setDate(fromDate.getDate() - 1);

// 	const query = [
// 		'status[]=payment_pending',
// 		'status[]=no_response',
// 		'status[]=declined',
// 		'status[]=guest_aborted',
// 		'status[]=guest_cancelled',
// 		'status[]=host_cancelled',
// 		'status[]=requested',
// 		'status[]=paid',
// 		'status[]=completed',
// 		'status[]=checked_in',
// 		'status[]=expired',
// 		`page=${page}`,
// 		`per_page=${PER_PAGE}`,
// 		`sort=${encodeURI('id|desc')}`,
// 		`from=${fromDate.toDateMysqlFormat()}`,
// 		`to=${toDate.toDateMysqlFormat()}`,
// 	];

// 	const uri = `${URL}/api/bookings?${query.join('&')}`;

// 	const data = await fetchRetry(uri, null, otaConfig)
// 		.then(res => res.json())
// 		.catch(err => logger.error(`${OTAName} get reservations error ${err}`));

// 	if (!data || !data.data) {
// 		logger.error('Luxstay get reservations error', data);
// 		return [];
// 	}

// 	// meet limit, return reservations
// 	if (page * PER_PAGE >= (data.total || 0) || page > MAX_PAGE) return data.data;

// 	// get remain reservations
// 	const remainReservations = await getInboxReservations({ ...params, page: page + 1 });
// 	return [...data.data, ...remainReservations];
// }

// async function getDetailBook(otaBookingId, otaConfig) {
// 	const uri = `${URL}/api/bookings/${otaBookingId}`;
// 	const result = await fetchRetry(uri, null, otaConfig);

// 	if (result.status !== 200) {
// 		logger.error('Luxstay get reservation detail error', await result.text());
// 		return null;
// 	}

// 	const { data } = await result.json();
// 	const priceItems = [];
// 	const { price } = data;
// 	const { currency } = price;

// 	// ACCOMMODATION
// 	priceItems.push({
// 		title: _.map(data.daily_prices, daily => `${daily.price}(${daily.currency}) x 1`).join(', '),
// 		amount: +price.original_price,
// 		priceType: 'ACCOMMODATION',
// 		currency,
// 	});

// 	// CLEANING FEE
// 	const cleaning = +price.room_fee;
// 	if (cleaning)
// 		priceItems.push({
// 			title: `Cleaning Fee`,
// 			amount: cleaning,
// 			priceType: 'CLEANING_FEE',
// 			currency,
// 		});

// 	// ADDITIONAL GUESTS
// 	const additional = +price.additional_guest_fee;
// 	if (additional)
// 		priceItems.push({
// 			title: `Additional Guests`,
// 			amount: additional,
// 			priceType: 'ADDITIONAL_GUESTS',
// 			currency,
// 		});

// 	// PROMOTION
// 	const promotion = +price.discount_by_host;
// 	if (promotion)
// 		priceItems.push({
// 			title: 'Promotions',
// 			amount: -promotion,
// 			priceType: 'PROMOTION',
// 			currency,
// 		});

// 	const total =
// 		price.payout / (1 - price.commission_rate) ||
// 		+price.total_booking_host * _.get(CurrencyConvert, currency.toUpperCase(), 1);
// 	const otaFee = total - price.payout || total * price.commission_rate;

// 	return { total, priceItems, currency, data, otaFee };
// }

// async function getConversationId(otaBookingId, otaConfig) {
// 	const result = await fetchRetry(`${URL}/api/chat/conversations/${otaBookingId}`, null, otaConfig);
// 	if (result.status === 200) {
// 		const json = await result.json();
// 		return json.data.id;
// 	}
// 	logger.error('Luxstay get conservation id error');
// 	return null;
// }

// async function confirmReservation(reservation, status, detail, otaConfig) {
// 	if (!reservation.thread) {
// 		const messages = await MessageModel.findOne({ otaBookingId: reservation.code, otaName: OTAName }).select(
// 			'threadId'
// 		);
// 		if (!messages || !messages.threadId) reservation.thread = await getConversationId(reservation.code, otaConfig);
// 	}
// 	const oldBook = await BookingModel.findOne({ otaBookingId: reservation.code, otaName: OTAName }).populate(
// 		'guestId'
// 	);
// 	detail = detail || (await getDetailBook(reservation.code, otaConfig));
// 	if (!detail) {
// 		return;
// 	}

// 	const guest = _.get(detail, ['data', 'guests', 0]) || _.get(oldBook, 'guestId') || {};
// 	const price = _.get(detail, 'total') || Number(reservation.price);

// 	const data = {
// 		otaName: OTAName,
// 		otaBookingId: reservation.code,
// 		otaListingId: reservation.property_id,
// 		from: reservation.check_in,
// 		to: reservation.check_out,
// 		amount: reservation.quantity || 1,
// 		status,
// 		guest: {
// 			name: reservation.full_name,
// 			fullName: reservation.full_name,
// 			ota: OTAName,
// 			otaId: guest.otaId || guest.phone || `${reservation.code}-${OTAName}`,
// 			phone: guest.phone,
// 			email: guest.email,
// 		},
// 		thread: {
// 			id: reservation.thread,
// 		},
// 		numberAdults: reservation.occupancy.number_of_adults,
// 		numberChilden: reservation.occupancy.number_of_children,
// 		price,
// 		otaFee: detail.otaFee,
// 		currency: price > 5000 ? Currency.VND : Currency.USD,
// 		priceItems: _.get(detail, 'priceItems'),
// 		inquiryPostId: reservation.code,
// 		approved: reservation.status === 'payment_pending',
// 	};
// 	if (status === BookingStatus.CONFIRMED) {
// 		data.rateType = RateType.PAY_NOW;
// 	}

// 	await apis.confirmReservation(data);
// }

// async function cancelReservation(reservation, status) {
// 	const data = {
// 		otaName: OTAName,
// 		otaBookingId: reservation.code,
// 		declined: status === BookingStatus.DECLINED,
// 		status,
// 	};
// 	await apis.cancelReservation({
// 		reservation: data,
// 		fullCancelled: true,
// 		cancelFromOTA: true,
// 	});
// }

// async function mapStatusToAction(reservation, detail, otaConfig) {
// 	const status = getBookingStatus(reservation.status);
// 	switch (status) {
// 		case BookingStatus.CONFIRMED:
// 		case BookingStatus.REQUEST:
// 			await confirmReservation(reservation, status, detail, otaConfig);
// 			break;
// 		case BookingStatus.CANCELED:
// 		case BookingStatus.DECLINED:
// 			await cancelReservation(reservation, status);
// 			break;
// 		default:
// 			break;
// 	}
// }

// async function reservationsCrawler(otaConfig, from, to) {
// 	const reservations = await getInboxReservations({ from, to, otaConfig });

// 	reservations.sort((r1, r2) => {
// 		const o1 = BookingStatusOrder[getBookingStatus(r1.status)];
// 		const o2 = BookingStatusOrder[getBookingStatus(r2.status)];
// 		return o1 - o2;
// 	});

// 	for (const reservation of reservations) {
// 		await mapStatusToAction(reservation, null, otaConfig).catch(e => {
// 			logger.error(e);
// 		});
// 	}
// }

// async function crawlerReservationWithId(otaConfig, propertyId, reservationId) {
// 	const detail = await getDetailBook(reservationId, otaConfig);
// 	if (!detail) {
// 		return Promise.reject(`${OTAName} crawlerReservationWithId error`);
// 	}

// 	const guest = _.get(detail, 'data.guests[0]', {});
// 	const prices = _.get(detail, 'data.price');
// 	const price = +(prices.payout || prices.total_booking_host);

// 	const reservation = {
// 		...detail.data,
// 		full_name: guest.full_name,
// 		price,
// 		currency: price > 5000 ? 'VND' : 'USD',
// 	};

// 	await mapStatusToAction(reservation, detail, otaConfig);
// }

// /**
//  * @param {object} ota
//  * @param {object} otaListing
//  * @param {Date} from
//  * @param {Date} to
//  */
// async function priceCrawler(otaConfig, otaPropertyId, otaListing, from, to) {
// 	const uri = Uri(`${URL}/api/prices`, {
// 		accommodation_id: getOtaListingId(otaListing),
// 	});

// 	const result = await fetchRetry(uri, null, otaConfig);

// 	if (!result.ok) {
// 		logger.error('Luxstay crawler price error');
// 		return [];
// 	}

// 	const data = await result.json();
// 	const toDate = to.toDateMysqlFormat();
// 	const index = data.data.findIndex(d => d.date === toDate);
// 	return data.data
// 		.slice(0, index + 1)
// 		.filter(calendar => calendar.price > 0)
// 		.map(calendar => ({
// 			rateId: DefaultRateId,
// 			date: new Date(calendar.date),
// 			price: calendar.price,
// 		}));
// }

// async function checkApi(otaConfig) {
// 	// const result = await fetchRetry(`${URL}/api/properties?sort=id|desc&page=1&per_page=1&status=all`, null, otaConfig);
// 	// if (result.status >= 500) {
// 	// 	return true;
// 	// }

// 	// return result.ok;
// 	return true;
// }

// async function fetchListingConfig(otaListing, otaConfig) {
// 	try {
// 		const uri = `${URL}/api/properties/${otaListing.otaListingId}`;

// 		const response = await fetchRetry(uri, null, otaConfig);

// 		if (response && response.status !== 200) {
// 			throw new Error(await response.text());
// 		}

// 		const { data } = await response.json();

// 		return _.pickBy({
// 			secondaryId: data.accommodations[0].id,
// 			currency: data.currency.toUpperCase(),
// 		});
// 	} catch (e) {
// 		logger.error('Luxstay fetchListingConfig error', otaListing.otaListingId, e);
// 	}
// }

// module.exports = {
// 	crawlerReservationWithId,
// 	reservationsCrawler,
// 	priceCrawler,
// 	checkApi,
// 	fetchListingConfig,
// };

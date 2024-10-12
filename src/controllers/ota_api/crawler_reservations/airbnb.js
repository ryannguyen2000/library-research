const cheerio = require('cheerio');
const _ = require('lodash');
const JSONbig = require('json-bigint');

const fetchRetry = require('@utils/fetchRetry');
const Uri = require('@utils/uri');
const { BookingStatus, BookingStatusOrder, OTAs, RateType, Currency } = require('@utils/const');
const { logger } = require('@utils/logger');
const { normPhone } = require('@utils/phone');
const apis = require('@controllers/booking/reservation');
const models = require('@models');
const { AIRBNB_HOST } = require('@controllers/ota_api/header_helper');

// admin page: https://airbnb.com/hosting
const OTAName = OTAs.Airbnb;
const LIMIT = 50;
const MICRO_NUMBER = 1000000;
const MAX_PAGE = 20;

const MapStatus = {
	timedout: BookingStatus.DECLINED,
	denied: BookingStatus.DECLINED,

	cancelled: BookingStatus.CANCELED,
	canceled_by_guest: BookingStatus.CANCELED,
	canceled_by_host: BookingStatus.CANCELED,
	canceled_by_admin: BookingStatus.CANCELED,

	accepted: BookingStatus.CONFIRMED,
	complete: BookingStatus.CONFIRMED,
	current: BookingStatus.CONFIRMED,

	request: BookingStatus.REQUEST,
	requested: BookingStatus.REQUEST,
	pending: BookingStatus.REQUEST,
};

async function listingDetail(otaListingId, otaConfig) {
	const html = await fetchRetry(`${AIRBNB_HOST}/manage-your-space/${otaListingId}/details`, null, otaConfig).then(
		res => res.text()
	);

	const $ = cheerio.load(html);
	let meta = $('#data-state').contents().text().replace('<!--', '').replace('-->', '').trim();

	const {
		amenity_categories,
		summary,
		bedrooms,
		beds,
		bathrooms,
		person_capacity,
		photos,
		room_type,
		property_type_group,
	} = JSON.parse(meta).uiState[0][1][1][1].data.reduxBootstrap.listingDetails.listingDetail;

	const images = photos.reduce((list, cur) => {
		list.push(cur.extra_large_url);
		return list;
	}, []);

	return {
		amenities: amenity_categories,
		images,
		description: summary,
		accommodates: person_capacity,
		bedrooms,
		bathrooms,
		beds,
		roomType: room_type,
		propertyType: property_type_group,
	};
}

async function getInboxReservations(otaConfig, from, to, _offset = 0) {
	const uri = Uri(`${AIRBNB_HOST}/api/v2/reservations`, {
		_format: 'for_remy',
		_offset,
		_limit: LIMIT,
		collection_strategy: 'for_reservations_list',
		date_min: from ? from.toDateMysqlFormat() : new Date().toDateMysqlFormat(),
		date_max: to ? to.toDateMysqlFormat() : '',
		sort_field: 'start_date',
		sort_order: 'desc',
		key: otaConfig.other.key,
		currency: 'USD',
		locale: 'en',
	});

	const results = await fetchRetry(uri, null, otaConfig);
	if (!results.ok) {
		logger.error('Airbnb get reservations error', otaConfig.account, uri, await results.text());
		return [];
	}

	const { reservations } = await results.json();

	reservations.sort((r1, r2) => {
		const o1 = BookingStatusOrder[MapStatus[r1.user_facing_status_key]];
		const o2 = BookingStatusOrder[MapStatus[r2.user_facing_status_key]];
		return o1 - o2;
	});

	for (const reservation of reservations) {
		const status = MapStatus[reservation.user_facing_status_key];
		await processBooking(reservation, status, otaConfig).catch(error => {
			logger.error(error);
		});
	}

	// meet limit, return reservations
	if (reservations.length < LIMIT || _offset >= MAX_PAGE * LIMIT) return reservations;

	// get remain reservations

	await getInboxReservations(otaConfig, from, to, _offset + LIMIT);
	// const remainReservations = await getInboxReservations(otaConfig, from, to, _offset + LIMIT);
	// return [...data.reservations, ...remainReservations];

	// return data.reservations;
}

async function getPriceItems(reservationId, force, otaConfig) {
	if (!force) {
		const booking = await models.Booking.findOne({
			otaName: OTAName,
			otaBookingId: reservationId,
		}).select('priceItems');
		if (_.get(booking, 'priceItems.length')) return null;
	}

	const uri = Uri(`${AIRBNB_HOST}/api/v2/homes_host_booking_pricing_quotes/${reservationId}`, {
		key: otaConfig.other.key,
		currency: 'USD',
		locale: 'en',
	});

	const result = await fetchRetry(uri, null, otaConfig);
	if (result.ok) {
		const json = await result.json();
		const hostPrice = json.homes_host_booking_pricing_quote.pricing_quote.host_payout_breakdown;
		return {
			priceItems: hostPrice.price_items.map(item => ({
				title: item.localized_title,
				amount: item.total.is_micros_accuracy ? item.total.amount_micros / MICRO_NUMBER : item.total.amount,
				priceType: item.type,
			})),
			total: {
				price: hostPrice.total.is_micros_accuracy
					? hostPrice.total.amount_micros / MICRO_NUMBER
					: hostPrice.total.amount,
				currency: hostPrice.total.currency,
			},
		};
	}
	logger.error('Airbnb get reservation price error', await result.text());
	return null;
}

async function getReservationDetail(reservationId, otaConfig) {
	const uri = Uri(`${AIRBNB_HOST}/api/v2/homes_booking_details/${reservationId}`, {
		currency: 'USD',
		key: otaConfig.other.key,
		locale: 'en',
	});

	const res = await fetchRetry(uri, null, otaConfig);
	if (!res.ok) {
		throw new Error(await res.text());
	}

	// const json = await res.json();
	const text = await res.text();
	const json = JSONbig.parse(text);

	if (json && json.homes_booking_detail) {
		const uri2 = Uri(`${AIRBNB_HOST}/api/v2/homes_booking_details/${reservationId}`, {
			_format: 'for_host_reservation_details_v2',
			currency: 'USD',
			key: otaConfig.other.key,
			locale: 'en',
		});
		const res2 = await fetchRetry(uri2, null, otaConfig);
		// const json2 = await res2.json();
		const text2 = await res2.text();
		const json2 = JSONbig.parse(text2);

		const data = json.homes_booking_detail;

		data.bessie_thread_id = data.bessie_thread_id || json2.homes_booking_detail.bessie_thread_id;
		data.special_offer = data.special_offer || json2.homes_booking_detail.special_offer;
		data.thread = data.thread || json2.homes_booking_detail.thread;

		return data;
	}

	throw new Error(json);
}

function parsePrice(priceText) {
	let price = parseFloat(priceText.toString().replace(/[^0-9.-]+/g, ''));
	let currency = '';
	if (priceText[0] === '$') {
		currency = Currency.USD;
	} else if (priceText[0] === '₫') {
		currency = Currency.VND;
	} else {
		logger.error(`Airbnb can't not parse price ${priceText}`);
		currency = '';
	}

	if (Number.isNaN(price)) {
		logger.error(`Airbnb can't not parse price ${priceText}`);
		price = 0;
	}

	return { price, currency };
}

async function isBookingUpdated(data, otaAlterations) {
	if (_.some(otaAlterations, a => a.status === 0)) return true;

	const booking = await models.Booking.findOne({
		otaName: data.otaName,
		otaBookingId: data.otaBookingId,
	})
		.select('amount guestId roomPrice currency listingId from to manual')
		.populate('listingId', 'OTAs');

	return (
		!booking ||
		!booking.roomPrice ||
		!booking.roomPrice !== data.roomPrice ||
		!booking.listingId ||
		(!booking.manual &&
			(booking.from.toDateMysqlFormat() !== data.from.slice(0, 10) ||
				booking.to.toDateMysqlFormat() !== data.to.slice(0, 10))) ||
		data.otaListingId !== _.get(booking.listingId.getOTA(data.otaName), 'otaListingId')
	);
}

async function confirmReservation(reservation, status, otaConfig) {
	const { price, currency } = parsePrice(reservation.earnings);

	const otaAlterations = _.get(reservation, 'alterations') || [];

	const data = {
		otaName: OTAName,
		otaBookingId: reservation.confirmation_code,
		otaListingId: reservation.listing_id_str || reservation.listing_id,
		from: reservation.start_date,
		to: reservation.end_date,
		amount: 1,
		status,
		guest: {
			name: reservation.guest_user.first_name,
			fullName: reservation.guest_user.full_name,
			email: reservation.guest_user.email,
			phone: reservation.guest_user.phone,
			ota: OTAName,
			otaId: normPhone(reservation.guest_user.phone) || `${OTAName}_${reservation.guest_user.id}`,
		},
		thread: {
			id: reservation.bessie_thread_id || reservation.confirmation_code,
		},
		numberAdults: reservation.guest_details.number_of_adults,
		numberChilden: reservation.guest_details.number_of_children,
		roomPrice: price,
		currency,
	};

	if (!(await isBookingUpdated(data, otaAlterations))) {
		return;
	}

	data.alterations = await otaAlterations.asyncMap(async alt => {
		const alteration = {
			from: new Date(alt.check_in),
			to: new Date(alt.check_out),
			numberAdults: alt.guest_details.number_of_adults,
			numberChilden: alt.guest_details.number_of_children,
			id: alt.id.toString(),
			status: alt.status,
		};
		if (alt.status === 0) alteration.price = await getAlterationPrice(alteration.id, otaConfig);
		return alteration;
	});

	if (status === BookingStatus.CONFIRMED) {
		data.rateType = RateType.PAY_NOW;
		reservation.forcePriceItems = !!data.alterations.length;
	} else {
		reservation.forcePriceItems = true;
	}

	const priceItems = await getPriceItems(reservation.confirmation_code, reservation.forcePriceItems, otaConfig);
	if (priceItems) {
		data.priceItems = priceItems.priceItems;
		data.roomPrice = priceItems.total.price;
		data.currency = priceItems.total.currency;
	}

	data.inquiryDetails = {
		otaName: OTAName,
		from: data.from,
		to: data.to,
		numberAdults: data.numberAdults,
		numberChilden: data.numberChilden,
		currency: data.currency,
		price: data.price,
		priceItems: data.priceItems,
		expireAt: data.alterations.length ? null : reservation.pending_expires_at,
	};

	await apis.confirmReservation(data);
}

async function cancelReservation(reservation, status) {
	const data = {
		otaName: OTAName,
		otaBookingId: reservation.confirmation_code,
		declined: status === BookingStatus.DECLINED,
		status,
	};
	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function processBooking(reservation, status, otaConfig) {
	switch (status) {
		case BookingStatus.CONFIRMED:
		case BookingStatus.REQUEST:
			await confirmReservation(reservation, status, otaConfig);
			break;
		case BookingStatus.CANCELED:
		case BookingStatus.DECLINED:
			await cancelReservation(reservation, status);
			break;
		default:
			break;
	}
}

async function reservationsCrawler(otaConfig, from, to) {
	await getInboxReservations(otaConfig, from, to);

	// reservations.sort((r1, r2) => {
	// 	const o1 = BookingStatusOrder[MapStatus[r1.user_facing_status_key]];
	// 	const o2 = BookingStatusOrder[MapStatus[r2.user_facing_status_key]];
	// 	return o1 - o2;
	// });

	// for (const reservation of reservations) {
	// 	const status = MapStatus[reservation.user_facing_status_key];
	// 	await processBooking(reservation, status, otaConfig).catch(error => {
	// 		logger.error(error);
	// 	});
	// }
}

async function getAlterationPrice(alterationId, otaConfig) {
	try {
		const uri = `${AIRBNB_HOST}/reservation/alteration/${alterationId}`;

		const res = await fetchRetry(uri, null, otaConfig);
		if (!res.ok) {
			throw new Error('Request Alteration Price Error');
		}

		const html = await res.text();
		const json = html.match(/<!--({"bootstrapData.*)-->/);
		if (!json) {
			throw new Error('Not found bootstrapData');
		}

		const data = JSON.parse(json[1]);
		// const path = 'bootstrapData.reduxBootstrap.entities.alteration.new_host_payable.amount_micros';
		const newPayoutIems = _.get(
			data,
			'niobeMinimalClientData[1].data.presentation.alteration.reservationAlterationPage.sections.hostPayoutSection.items'
		);

		const newPayoutItem = _.find(newPayoutIems, item => item.title === 'New payout');

		return parsePrice(_.get(newPayoutItem, 'subtitle')).price;
	} catch (err) {
		logger.error('Airbnb getAlterationPrice error', err);
	}
}

async function crawlerReservationWithId(otaConfig, propertyId, reservationId) {
	const { reservation, listing, bessie_thread_id } = await getReservationDetail(reservationId, otaConfig);
	Object.assign(reservation.guest, {
		full_name: reservation.guest.full_name || reservation.guest_name,
		email: reservation.guest.email || reservation.guest_email,
	});
	Object.assign(reservation, {
		listing_id: listing.listing_id_str || listing.id,
		start_date: reservation.check_in,
		end_date: reservation.check_out,
		guest_user: reservation.guest,
		forcePriceItems: true,
	});
	reservation.guest_user = reservation.guest;
	reservation.bessie_thread_id = bessie_thread_id;
	const status = MapStatus[reservation.status];

	await processBooking(reservation, status, otaConfig);
}

// async function priceCrawler(otaConfig, otaPropertyId, otaListing, from, to) {
// 	const uri = Uri(`${AIRBNB_HOST}/api/v2/calendar_days`, {
// 		key: otaConfig.other.key,
// 		_format: 'host_calendar_detailed',
// 		listing_id: otaListing.otaListingId,
// 		start_date: from.toDateMysqlFormat(),
// 		end_date: to.toDateMysqlFormat(),
// 	});

// 	const result = await fetchRetry(uri, null, otaConfig);
// 	if (!result.ok) {
// 		logger.error('Airbnb crawler price error');
// 		return [];
// 	}

// 	const data = await result.json();

// 	return data.calendar_days.map(calendar => ({
// 		rateId: DefaultRateId,
// 		date: new Date(calendar.date),
// 		smartPrice: !calendar.demand_based_pricing_overridden,
// 		price: calendar.price.local_price,
// 	}));
// }

function checkApi(ota) {
	// const uri = `${AIRBNB_HOST}/api/v2/users/me?currency=USD&key=${ota.other.key}&locale=en`;
	// const headers = headerHelper.getAirbnbHeader(ota);

	// const result = await fetch(uri, {
	// 	headers,
	// });
	// return result.ok || result === 500;
	return true;
}

module.exports = {
	listingDetail,
	reservationsCrawler,
	// priceCrawler,
	checkApi,
	crawlerReservationWithId,
};

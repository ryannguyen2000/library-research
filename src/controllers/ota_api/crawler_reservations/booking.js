const { URLSearchParams } = require('url');
const _ = require('lodash');
const moment = require('moment');

const fetchRetry = require('@utils/fetchRetry');
// const isoFetch = require('@utils/isoFetch');

const {
	BookingStatus,
	BookingStatusOrder,
	VirtualBookingPhone,
	OTAs,
	ONE_HOUR,
	PAYMENT_CHARGE_STATUS,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const Uri = require('@utils/uri');
const { normPhone, isVirtualPhone } = require('@utils/phone');

const models = require('@models');
const { getAuthMessage } = require('@controllers/ota_api/headers/booking');
// const { getBookingHeader } = require('@controllers/ota_api/header_helper');
const apis = require('@controllers/booking/reservation');
// const { sendExtRequest } = require('@controllers/ota_helper');

// admin page: https://admin.booking.com
const END_POINT = 'https://admin.booking.com/fresa/extranet';
const OTAName = OTAs.Booking;
const LIMIT = 50;
const MAX_PAGE = 20;

// function fetchRetry(uri, options, otaInfo) {
// 	options = options || {};
// 	options.headers = getBookingHeader(otaInfo, options.headers);

// 	return isoFetch(uri, options);
// }

function getRates(roomReservation) {
	const rates = [];

	let isNonRefundable;

	if (roomReservation.ratesAndAddons) {
		const { ratesAndAddons } = roomReservation;
		const dailyRates = _.filter(ratesAndAddons, { rowType: 'daily_rate' });

		dailyRates.forEach(dailyRate => {
			const { date, rate: name, price } = dailyRate;
			isNonRefundable = name.toLowerCase().includes('non-refundable');

			rates.push({
				date: date.value,
				name,
				isNonRefundable,
				// commission: Number,
				price: Number(price.amount),
			});
		});
	}

	return { rates, isNonRefundable };
}

function mergeRates(currentRates, newRates) {
	newRates.forEach(rate => {
		const current = currentRates.find(r => r.date === rate.date);
		if (current) {
			current.price += rate.price;
		} else {
			currentRates.push(rate);
		}
	});

	return currentRates;
}

function getBookingStatus(status) {
	switch (status) {
		case 'ok':
			return BookingStatus.CONFIRMED;
		case 'no_show':
		case 'cancelled_by_guest':
		case 'fraudulent':
		case 'cancelled_by_hotel':
		case 'cancelled_refund_needed':
		case 'overbooked':
			return BookingStatus.CANCELED;
		case 'cancelled_by_owner':
			return BookingStatus.DECLINED;
		default:
			throw new Error(`Not valid booking status: ${status}`);
	}
}

async function getReservations(otaConfig, propertyId, from, to, page = 1) {
	from = from || moment().add(-1, 'day').toDate();
	to = to || moment().add(2, 'day').toDate();

	const uri = Uri(`${END_POINT}/reservations/retrieve_list_v2`, {
		page,
		perpage: LIMIT,
		hotel_id: propertyId,
		lang: 'en',
		date_type: 'arrival',
		date_from: from.toDateMysqlFormat(),
		date_to: to.toDateMysqlFormat(),
		ses: otaConfig.other.ses,
		token: otaConfig.token,
		user_triggered_search: 1,
	});
	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
		},
		otaConfig
	);

	if (!res.ok) {
		logger.error(`${OTAName} getReservations error`, res.status, propertyId);
		return [];
	}

	const data = await res.json();
	const reservations = _.get(data, 'data.reservations') || [];

	reservations.sort((r1, r2) => {
		const o1 = BookingStatusOrder[getBookingStatus(r1.reservationStatus)];
		const o2 = BookingStatusOrder[getBookingStatus(r2.reservationStatus)];
		return o1 - o2;
	});

	for (const reservation of reservations) {
		try {
			const status = getBookingStatus(reservation.reservationStatus);
			switch (status) {
				case BookingStatus.CONFIRMED:
				case BookingStatus.REQUEST:
					await confirmReservation(reservation, propertyId, status, otaConfig);
					break;
				case BookingStatus.CANCELED:
				case BookingStatus.DECLINED:
					await cancelReservation(reservation, status, otaConfig);
					break;
				default:
					break;
			}
		} catch (error) {
			logger.error(error);
		}
	}

	if (reservations.length < LIMIT || page > MAX_PAGE || !data.hasNextPage) return reservations;

	await getReservations(otaConfig, propertyId, from, to, page + 1);
}

async function getPhoneNumber(hotelId, resId, otaConfig) {
	const uri = Uri(`${END_POINT}/security/booking_phone_number`, {
		hotel_id: hotelId,
		bn: resId,
		hotel_account_id: otaConfig.other.accountId,
		ses: otaConfig.other.ses,
		lang: 'en',
	});

	try {
		const data = await fetchRetry(
			uri,
			{
				redirect: 'manual',
			},
			otaConfig
		).then(res => res.json());

		if (!data.data.success) {
			throw new Error(data);
		}
		return data.data.phone && data.data.phone.replace(/\s/g, '');
	} catch (err) {
		logger.error(`${OTAName} get phone number error ${err}`);
		return undefined;
	}
}

async function findThreadId(bookingId, otaConfig) {
	const authJson = getAuthMessage(otaConfig);
	const json = {
		auth: authJson,
		reservation_ids: [bookingId.toString()],
		presentation: 'hotel_2',
		lang: 'en-us',
	};
	const uri = `https://chat.booking.com/3/find_thread?json=${JSON.stringify(json)}`;

	const data = await fetchRetry(
		uri,
		{
			redirect: 'manual',
		},
		otaConfig
	).then(res => res.json());

	const thread = _.get(data, 'threads[0].thread.id');
	if (thread) {
		return thread;
	}

	logger.error('Booking get thread id error', uri, data);
	return Promise.reject(data);
}

async function getReservationDetail(reservationId, propertyId, otaConfig) {
	if (!reservationId || !propertyId) return;

	const uri = `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/booking.html?res_id=${reservationId}&hotel_id=${propertyId}&ses=${otaConfig.other.ses}`;

	// let html = await isoFetch(uri, {
	// 	headers: {
	// 		Cookie: otaConfig.cookie,
	// 		'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8,vi-VN;q=0.7',
	// 		Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
	// 	},
	// }).then(res => res.text());

	// const data = await sendExtRequest(otaConfig, uri, {
	// 	timeout: 15 * 1000,
	// });
	const res = await fetchRetry(uri, null, otaConfig);

	// if (data.error) {
	// logger.warn('booking.com getReservationDetail from extension error', uri, data.error);
	// return getReservationDetailApi(reservationId, propertyId, otaConfig);
	// }

	// let html = data.rawData;
	let html = await res.text();

	let match = html.match(/window.__GOLEM__ = "(.*)"/);

	if (!match) {
		logger.warn('booking.com getReservationDetail html not __GOLEM__', uri, html);
		return Promise.reject('getReservationDetail error not found __GOLEM__', uri);
		// return getReservationDetailApi(reservationId, propertyId, otaConfig);
	}

	const dataStr = match[1].replace(/\\"/g, '"').replace(/\\\\"/g, '');
	const json = JSON.parse(dataStr);

	return json.initialState;
}

// async function getMsgConfig(propertyId, otaConfig) {
// 	try {
// 		const uri = `${END_POINT}/messaging/get_config?hotel_id=${propertyId}&hotel_account_id=${otaConfig.other.accountId}&ses=${otaConfig.other.ses}`;

// 		const res = await fetchRetry(
// 			uri,
// 			{
// 				method: 'POST',
// 			},
// 			otaConfig
// 		);

// 		const json = await res.json();

// 		return json.data;
// 	} catch (e) {
// 		logger.error('getMsgConfig error', propertyId, e);
// 	}
// }

// async function getReservationRooms(resId, hotelId, otaConfig) {
// 	const uri = `${END_POINT}/reservations/details/room_details?hres_id=${resId}&hotel_id=${hotelId}&ses=${otaConfig.other.ses}`;

// 	const res = await fetchRetry(
// 		uri,
// 		{
// 			method: 'POST',
// 		},
// 		otaConfig
// 	);

// 	const json = await res.json();
// 	if (!json.success) {
// 		throw new Error(JSON.stringify(json));
// 	}

// 	return json.data;
// }

// async function getReservationDetailApi(resId, hotelId, otaConfig) {
// 	if (!hotelId) {
// 		throw new Error('not found hotelId');
// 	}

// 	const uri = `${END_POINT}/reservations/details/get_details?hres_id=${resId}&hotel_id=${hotelId}&ses=${otaConfig.other.ses}`;

// 	const res = await fetchRetry(
// 		uri,
// 		{
// 			method: 'POST',
// 		},
// 		otaConfig
// 	);

// 	const json = await res.json();
// 	if (!json.success || !json.data) {
// 		throw new Error(json);
// 	}

// 	const { data } = json;

// 	data.messaging = await getMsgConfig(hotelId, otaConfig);
// 	data.roomReservations = await getReservationRooms(resId, hotelId, otaConfig);
// 	data.context = {
// 		hotel_account_id: otaConfig.other.accountId,
// 		hotel_id: hotelId,
// 	};

// 	if (!data.guestDetails && _.get(data.roomReservations, [0, 'guest', 'name'])) {
// 		data.guestDetails = {
// 			name: data.roomReservations[0].guest.name,
// 		};
// 	}

// 	return data;
// }

async function searchBookings(hotelId, resId, otaConfig) {
	try {
		const uri = `${END_POINT}/header/get_search_results?hotel_account_id=${otaConfig.other.accountId}&hotel_id=${hotelId}&ses=${otaConfig.other.ses}&lang=xu&query=${resId}&search_type=property_level&fields[]=rooms.guest_name&fields[]=rooms.checkin&fields[]=rooms.checkout&fields[]=booker_firstname&fields[]=booker_lastname&count=10&offset=0`;

		const res = await fetchRetry(
			uri,
			{
				method: 'POST',
			},
			otaConfig
		);

		const json = await res.json();

		return _.get(json, 'data.results');
	} catch (e) {
		logger.error('searchBookings', resId, hotelId);
	}
}

async function confirmReservation(reservation, propertyId, status, otaConfig) {
	const oldBook = await models.Booking.findOne({
		otaName: OTAName,
		otaBookingId: reservation.id.toString(),
	}).select('_id roomPrice from to manual');

	if (
		oldBook &&
		(oldBook.manual ||
			!oldBook.roomPrice ||
			(oldBook.roomPrice === _.round(Number(reservation.price.amount)) &&
				oldBook.from.toDateMysqlFormat() === reservation.checkin &&
				oldBook.to.toDateMysqlFormat() === reservation.checkout))
	) {
		return;
	}

	await crawlerReservationWithId(otaConfig, propertyId, reservation.id.toString(), reservation);
	await Promise.delay(500);
}

function getRoomStatus(status) {
	if (_.get(status, 'cancellationByGuest.happened')) {
		return BookingStatus.CANCELED;
	}
	if (status.completedBooking && status.roomOk) {
		return BookingStatus.CONFIRMED;
	}
	logger.error(`Not valid booking room status ${JSON.stringify(status)}`);
}

function getListingAndRooms_Detail(roomReservations) {
	const group = roomReservations
		.map(r => {
			const dailyRate = r.ratesAndAddons.find(rate => rate.rowType === 'daily_rate');
			const addons = (dailyRate && dailyRate.addons) || [];
			const breakfast = addons.find(a => a.name === 'Breakfast');
			const { rates, isNonRefundable } = getRates(r);

			const rs = {
				id: r.room.id,
				status: getRoomStatus(r.status),
				price: r.totalPrice.amount,
				currency: r.totalPrice.currency,
				breakfastAmount: +!!r.meals.includedTypes.find(inc => inc.mealType === 'breakfast'),
				breakfastPrice: (breakfast && breakfast.totalPrice.amount) || 0,
				breakfastCurrency: (breakfast && breakfast.totalPrice.currency) || r.totalPrice.currency,
				rresId: _.get(r.rres, 'id'),
				rates,
				rateDetail: {
					isNonRefundable,
				},
			};
			if (dailyRate && dailyRate.rate) {
				rs.otaRateName = _.head(dailyRate.rate.split(','));
			}
			if (addons.length) {
				_.assign(rs.rateDetail, {
					benefits: _.map(addons, 'name').join(', '),
					name: rs.otaRateName,
					breakfastIncluded: !!breakfast,
				});
			}

			return rs;
		})
		.filter(s => s.status === BookingStatus.CONFIRMED)
		.reduce((obj, s) => {
			if (!obj[s.id]) {
				obj[s.id] = { ...s, rates: [], amount: 0, price: 0, breakfastAmount: 0, breakfastPrice: 0 };
			}

			obj[s.id].amount += 1;
			obj[s.id].price += s.price;
			obj[s.id].breakfastAmount += s.breakfastAmount;
			obj[s.id].breakfastPrice += s.breakfastPrice;
			obj[s.id].rresIds = obj[s.id].rresIds || [];
			obj[s.id].rresIds.push(s.rresId);

			mergeRates(obj[s.id].rates, s.rates);

			return obj;
		}, {});

	return Object.values(group);
}

async function isBookingUpdated(bookings, reservation, otaListingIds) {
	if (
		!bookings[0] ||
		!bookings[0].listingId ||
		!bookings[0].roomPrice ||
		(!bookings[0].manual &&
			(bookings[0].from.toDateMysqlFormat() !== reservation.from.slice(0, 10) ||
				bookings[0].to.toDateMysqlFormat() !== reservation.to.slice(0, 10)))
	) {
		return true;
	}

	const listings = await models.Listing.find({ _id: _.compact(_.map(bookings, 'listingId')) }).select('OTAs');

	const currentListingIds = listings.map(listing => _.get(listing.getOTA(OTAName), 'otaListingId')).filter(l => l);

	return (
		_.xor(
			otaListingIds.map(l => l.id.toString()),
			currentListingIds
		).length > 0
	);
}

async function confirmedReservationDetail(detail, status, otaConfig, resListInfo) {
	const { roomReservations } = detail;

	if (_.isEmpty(roomReservations)) {
		return logger.error('Booking cannot found listing id');
	}

	const otaListingIds = getListingAndRooms_Detail(roomReservations);
	const otaBookingId = _.toString(detail.id || detail.reservationId);

	const oldBookings = await models.Booking.find({ otaBookingId, otaName: OTAName });

	const totalPrice = parseFloat(detail.commission.commissionable.amount);
	const feePercent = parseFloat(detail.commission.original.amount) / totalPrice;

	const data = {
		status,
		guest: {
			email: _.get(detail.guestDetails, 'email'),
			address: _.get(detail.guestDetails, 'address.address'),
			country: _.toUpper(_.get(detail.guestDetails, 'address.countryCode')) || undefined,
			ota: OTAName,
			genius: !!_.get(detail.guestDetails, 'isGenius'),
		},
		otaName: OTAName,
		otaBookingId,
		from: detail.checkin,
		to: detail.checkout,
		numberChilden: 0,
		currency: detail.currency_code || detail.price.currency,
		specialRequests: _.map(detail.importantInfo, 'value'),
	};

	if (oldBookings[0] && !(await isBookingUpdated(oldBookings, data, otaListingIds))) {
		return;
	}

	const numberAdults = _.get(detail.occupancy, 'guests');
	if (numberAdults) {
		data.numberAdults = numberAdults;
	}

	const fullName = detail.guestDetails ? detail.guestDetails.name : _.get(resListInfo, 'guestName');
	const name = detail.guestDetails ? detail.guestDetails.name.split(' ')[0] : _.get(resListInfo, 'guestName');

	if (fullName) {
		data.guest.fullName = fullName;
	}
	if (name) {
		data.guest.name = name;
	}

	if (!oldBookings.length) {
		if (!data.guest.fullName) {
			const bookings = await searchBookings(detail.context.hotel_id, otaBookingId, otaConfig);
			if (bookings && bookings[0] && bookings[0].bookerFirstname) {
				data.guest.fullName = `${bookings[0].bookerFirstname} ${bookings[0].bookerLastname}`;
				data.guest.name = bookings[0].bookerLastname;
			}
		}

		const phone = await getPhoneNumber(detail.context.hotel_id, otaBookingId, otaConfig);

		if (phone) {
			if (!isVirtualPhone(phone)) {
				data.guest.otaId = normPhone(phone);
				data.guest.phone = phone;
				if (!data.guest.fullName) {
					data.guest.fullName = phone;
				}
			} else {
				data.guest.otaId = data.guest.email || `${OTAName}_${otaBookingId}`;
			}

			if (VirtualBookingPhone.some(vphone => phone.includes(vphone))) {
				data.guestOta = OTAs.Agoda;
			}
		} else {
			data.guest.otaId = data.guest.email || `${OTAName}_${otaBookingId}`;
		}

		if (!data.guest.fullName) {
			data.guest.fullName = otaBookingId;
		}

		const threadId = await findThreadId(otaBookingId, otaConfig);
		data.thread = { id: threadId };
	} else {
		data.guestId = oldBookings[0].guestId;
		data.threadId = oldBookings[0].messages;
	}

	await apis.changeListing(oldBookings, otaListingIds).catch(err => {
		logger.error('apis.changeListing', OTAName, otaBookingId, otaListingIds, err);
	});

	for (const listing of otaListingIds) {
		const roomData = {
			...data,
			rates: listing.rates,
			otaListingId: listing.id,
			amount: listing.amount,
			roomPrice: listing.price || totalPrice,
			meals: {
				breakfast: {
					amount: listing.breakfastAmount,
					price: listing.breakfastPrice,
					currency: listing.breakfastCurrency,
				},
			},
			other: {
				rresIds: listing.rresIds,
			},
			otaRateName: listing.otaRateName,
			rateDetail: listing.rateDetail,
		};

		roomData.otaFee = roomData.roomPrice * feePercent || 0;

		await apis.confirmReservation(roomData);
	}
}

async function cancelReservation(reservation, status, otaConfig) {
	const otaBookingId = _.toString(reservation.id || reservation.reservationId);

	const data = {
		otaName: OTAName,
		otaBookingId,
		declined: status === BookingStatus.DECLINED,
		status,
	};

	if (status && reservation.context) {
		const booking = await models.Booking.findOne({
			otaName: data.otaName,
			otaBookingId: data.otaBookingId,
		}).select('other paymentCardState');

		if (
			!_.get(booking, 'other.waivedCancellationFee') &&
			_.get(booking, 'paymentCardState.chargedStatus') !== PAYMENT_CHARGE_STATUS.CHARGED
		) {
			await waiveCancellationFee(
				reservation.context.hotel_id,
				data.otaBookingId,
				_.map(reservation.roomReservations, 'rres.id'),
				otaConfig
			);
		}
	}

	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function reservationsCrawler(otaConfig, from, to) {
	const propertyIds = await models.Block.getPropertiesId(OTAName, otaConfig.account);

	for (const propertyId of propertyIds) {
		await getReservations(otaConfig, propertyId, from, to);
	}
}

async function crawlerReservationWithId(otaConfig, propertyId, reservationId, resListInfo) {
	const reservation = await getReservationDetail(reservationId, propertyId, otaConfig);

	const status = getBookingStatus(reservation.reservationStatus);

	const intercomAuth =
		_.get(reservation.messaging, 'intercom_auth') || _.get(reservation.messaging, 'messagingConfig.intercomToken');

	if (intercomAuth) {
		otaConfig.set(
			'other.json',
			JSON.stringify({
				intercom_auth: intercomAuth,
			})
		);
		await otaConfig.save();
	}

	switch (status) {
		case BookingStatus.CONFIRMED:
		case BookingStatus.REQUEST:
			await confirmedReservationDetail(reservation, status, otaConfig, resListInfo);
			break;
		case BookingStatus.CANCELED:
		case BookingStatus.DECLINED:
			await cancelReservation(reservation, status, otaConfig);
			break;
		default:
			break;
	}
}

async function priceCrawler(otaConfig, otaPropertyId, otaListing, from, to) {
	const uri = Uri(`${END_POINT}/inventory/fetch`, {
		hotel_id: otaPropertyId,
		lang: 'xu',
		ses: otaConfig.other.ses,
	});
	const request = {
		dates: {
			range: true,
			dates: [from.toDateMysqlFormat(), to.toDateMysqlFormat()],
		},
		hotel: {
			fields: ['rooms'],
			rooms: {
				id: [otaListing.otaListingId],
				fields: ['permissions', 'num_guests', 'rates'],
				rates: {
					fields: ['price'],
				},
			},
		},
	};
	const form = new URLSearchParams();
	form.append('request', JSON.stringify(request));
	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: form,
		},
		otaConfig
	);
	if (!result.ok) {
		logger.error('Booking crawler price error');
		return [];
	}

	const data = await result.json();
	const roomData = data.data.hotel[otaPropertyId].rooms[otaListing.otaListingId];
	const rateIds = roomData.rate_ids;
	const prices = [];
	rateIds.forEach(rate => {
		const { dates, occupancies } = roomData.rates[rate];
		prices.push(
			...Object.keys(dates).map(d => ({
				rateId: rate.toString(),
				date: new Date(d),
				price: parseInt(dates[d].price[occupancies['0']]),
			}))
		);
	});
	return prices;
}

async function waiveCancellationFee(propertyId, bookingId, rresIds, otaConfig) {
	try {
		const uri = `${END_POINT}/reservations/details/waive_cancellation_fees`;
		const queries = [
			`hres_id=${bookingId}`,
			`hotel_account_id=${otaConfig.other.accountId}`,
			`hotel_id=${propertyId}`,
			`lang=xu`,
			`ses=${otaConfig.other.ses}`,
			...rresIds.map(rresId => `rres_ids_affected[]=${rresId}`),
		];

		const res = await fetchRetry(
			`${uri}?${queries.join('&')}`,
			{
				method: 'POST',
				redirect: 'manual',
			},
			otaConfig
		);
		const json = await res.json();
		if (!json.success) {
			logger.error('waiveCancellationFee not success', JSON.stringify(json));
		}

		await models.Booking.updateMany(
			{ otaName: OTAName, otaBookingId: bookingId },
			{ 'other.waivedCancellationFee': json.success || res.status === 403, 'other.rresIds': rresIds }
		);
	} catch (e) {
		logger.error('waiveCancellationFee error', e);
	}
}

async function checkApi(otaConfig) {
	const timeExpired = ONE_HOUR * 0.5;

	return new Date(otaConfig.other.updatedAt || otaConfig.updatedAt).valueOf() + timeExpired > Date.now();

	// try {
	// 	const [home] = await models.Block.getPropertiesId(OTAName, otaConfig.account);
	// 	const uri = `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/home.html?ses=${otaConfig.other.ses}&hotel_id=${home}&lang=xu`;
	// 	const res = await fetchRetry(
	// 		uri,
	// 		{
	// 			// redirect: 'manual',
	// 		},
	// 		otaConfig
	// 	);

	// 	const html = await res.text();
	// 	const { json } = getAuthFromHtml(html);

	// 	if (json) {
	// 		await models.OTAManager.updateMany(
	// 			{ name: otaConfig.name, username: otaConfig.username },
	// 			{
	// 				$set: {
	// 					'other.json': json,
	// 				},
	// 			}
	// 		);
	// 	}

	// 	return true;
	// } catch (e) {
	// 	logger.warn(`${OTAName} checkApi error`, e);
	// 	return true;
	// }
}

module.exports = {
	reservationsCrawler,
	priceCrawler,
	checkApi,
	crawlerReservationWithId,
};

// const { URLSearchParams } = require('url');
const _ = require('lodash');
const moment = require('moment');
const AsyncLock = require('async-lock');

// const fetchRetry = require('@utils/fetchRetry');
const isoFetch = require('@utils/isoFetch');
const { BookingStatus, OTAs, RateType, Services } = require('@utils/const');
const { logger } = require('@utils/logger');
const { isVirtualPhone } = require('@utils/phone');
const models = require('@models');
const apis = require('@controllers/booking/reservation');
const { getAgodaHeader } = require('@controllers/ota_api/header_helper');

// admin page: https://ycs.agoda.com
const OTAName = OTAs.Agoda;
const HOST = `https://ycs.agoda.com/mldc/vi-vn/api`;
const Locker = new AsyncLock();

function sfetch(uri, options, otaInfo) {
	options = options || {};
	options.headers = _.assign(options.headers, {
		Cookie: otaInfo.cookie,
		Origin: 'https://ycs.agoda.com',
		'Content-type': 'application/json; charset=UTF-8',
	});

	return isoFetch(uri, options);
}

async function request(uri, options, otaInfo) {
	const res = await sfetch(uri, options, otaInfo);

	if (!res.ok) {
		logger.error('agoda request error', res.status, otaInfo.account, uri);
		return Promise.reject(res.status);
	}

	return res.json();
}

function mapAckRequestType(type) {
	if (type === 1 || type === 3) return BookingStatus.CONFIRMED;
	if (type === 2) return BookingStatus.CANCELED;

	logger.error('AckRequestType cannot map to BookingStatus', type);
}

async function getPropertyBookings({ otaConfig, propertyId, from, to, bookingId }) {
	try {
		const uri = `${HOST}/reporting/Booking/list/${propertyId}`;

		const stayDatePeriod = {};

		if (from) {
			stayDatePeriod.from = `/Date(${new Date(from).valueOf()})/`;
		}
		if (to) {
			stayDatePeriod.to = `/Date(${new Date(to).valueOf()})/`;
		}

		const body = JSON.stringify({
			hotelId: Number(propertyId),
			customerName: '',
			ackRequestTypes: ['All'],
			bookingId: bookingId ? Number(bookingId) : null,
			bookingDatePeriod: {},
			stayDatePeriod,
			lastUpdateDatePeriod: {},
			pageIndex: 1,
			pageSize: 100,
		});

		const json = await request(
			uri,
			{
				method: 'POST',
				body,
			},
			otaConfig
		);

		return json.bookings;
	} catch (e) {
		logger.error('Agoda get Property Bookings error', propertyId, otaConfig.account, e);
		return [];
	}
}

async function getBookingPrice({ propertyId, bookingToken, otaConfig }) {
	const priceDetails = await request(
		`${HOST}/reporting/Booking/details/${propertyId}/pricebreakdown?bookingToken=${encodeURIComponent(
			bookingToken
		)}`,
		{
			method: 'GET',
		},
		otaConfig
	);

	await Promise.delay(400);

	priceDetails.details = await request(
		`${HOST}/reporting/Booking/details/${propertyId}/pricingDetails?bookingToken=${encodeURIComponent(
			bookingToken
		)}`,
		{
			method: 'GET',
		},
		otaConfig
	);

	return priceDetails;
}

async function getPropertyBookingDetail({ propertyId, bookingToken, otaConfig }) {
	const uri = `${HOST}/reporting/Booking/details/${propertyId}/bookingDetails?bookingToken=${encodeURIComponent(
		bookingToken
	)}`;

	const json = await request(
		uri,
		{
			method: 'GET',
		},
		otaConfig
	);

	return json;
}

function parsePrice(txt) {
	if (!txt) return [];

	let [currency, price] = txt.split(' ');
	if (currency && currency.length !== 3) {
		price = currency;
		currency = price && price.length === 3 ? price : null;
	}
	price = price && Number(price.replace(/,/g, ''));

	return [price, currency];
}

function getBookingData(reservation, detail, pricing) {
	const isPaid = reservation.paymentModel === 1;
	const rateType = isPaid ? RateType.PAY_NOW : RateType.PAY_AT_PROPERTY;
	const from = reservation.checkinDate.slice(0, 10);
	const to = reservation.checkoutDate.slice(0, 10);

	const roomTypeId = reservation.roomTypeId;
	const guestName = reservation.guestName;

	const data = {
		otaName: OTAName,
		otaBookingId: _.toString(reservation.bookingId),
		from,
		to,
		numberAdults: reservation.adults || 1,
		numberChilden: reservation.children || 0,
		rateType,
		thread: {
			id: reservation.bookingToken || `${reservation.propertyId},${reservation.bookingId}`,
		},
		guest: {
			name: guestName,
			fullName: guestName,
			ota: OTAName,
			otaId: guestName + reservation.bookingId,
		},
		otaListingId: `${reservation.propertyId},${roomTypeId}`,
	};

	if (from === to) {
		const fromHour = reservation.checkinDate.split('T')[1];
		const toHour = reservation.checkoutDate.split('T')[1];

		if (fromHour && toHour) {
			data.serviceType = Services.Hour;
			data.fromHour = fromHour.slice(0, 5);
			data.toHour = toHour.slice(0, 5);
		}
	}

	if (detail) {
		if (detail.email) data.guest.email = detail.email;
		if (detail.specialRequest) data.specialRequests = [detail.specialRequest];

		const { bookingDate } = detail;

		if (bookingDate && moment(bookingDate).isValid()) {
			data.createdAt = moment(bookingDate).toDate();
		}

		if (detail.phoneNumber) {
			const phone = detail.phoneNumber.replace(/(\s|\+)/g, '');
			if (phone && !isVirtualPhone(phone)) {
				data.guest.phone = phone;
			}
		}
	}

	if (pricing) {
		data.currency = pricing.currencyCode;

		data.roomPrice = pricing.totalRefSell || pricing.totalNetInclusive || pricing.totalSellInclusive;

		data.rates = _.filter(pricing.dailyRates, r => r && r.date).map(rate => ({
			date: rate.date.slice(0, 10),
			price: rate.refSell || rate.netInclusive || rate.sellInclusive,
			currency: pricing.currencyCode,
			name: pricing.rateType,
			promotion: pricing.details.promotionText,
			commission: rate.refComm,
		}));

		data.rateDetail = {
			benefits: detail.benefits,
			name: pricing.details.rateCategory,
			breakfastIncluded: _.includes(detail.benefits, 'Breakfast'),
		};

		data.otaRateName = pricing.details.rateCategory.replace(/ \(\d+\)/, '');
		if (pricing.totalNetInclusive) data.otaFee = data.roomPrice - pricing.totalNetInclusive;
	}

	return data;
}

async function isBookingUpdated(booking, reservation, otaListingId) {
	if (
		!booking ||
		!booking.listingId ||
		!booking.roomPrice ||
		(!booking.manual &&
			(booking.from.toDateMysqlFormat() !== reservation.checkinDate.slice(0, 10) ||
				booking.to.toDateMysqlFormat() !== reservation.checkoutDate.slice(0, 10)))
	) {
		return true;
	}

	const listing = await models.Listing.findById(booking.listingId).select('OTAs');

	return otaListingId !== _.get(listing.getOTA(OTAName), 'otaListingId');
}

async function confirmReservation(reservation, status, otaConfig) {
	const { roomTypeId } = reservation;

	if (!roomTypeId) {
		logger.error('not found roomTypeId', reservation);
		return;
	}

	const otaBookingId = _.toString(reservation.bookingId);
	const bookings = await models.Booking.find({ otaBookingId, otaName: OTAName });

	const emailData = await models.JobCrawler.findOne({
		otaName: OTAName,
		reservationId: _.toString(reservation.bookingId),
		bookingInfo: { $ne: null },
	}).sort({ createdAt: -1 });

	let amount = Number(_.get(emailData, 'bookingInfo.roomNo'));

	const otaListingId = `${reservation.propertyId},${roomTypeId}`;

	if (
		bookings[0] &&
		(!amount || bookings[0].manual || amount === bookings[0].amount) &&
		!(await isBookingUpdated(bookings[0], reservation, otaListingId))
	) {
		return;
	}

	if (bookings.length) {
		logger.warn('Agoda confirmReservation refetch', status, reservation);
	}

	const detail = await getPropertyBookingDetail({
		propertyId: reservation.propertyId,
		bookingToken: reservation.bookingToken,
		otaConfig,
	});

	await Promise.delay(500);

	const pricing = await getBookingPrice({
		propertyId: reservation.propertyId,
		bookingToken: reservation.bookingToken,
		otaConfig,
	});

	amount = amount || _.get(detail, 'numberOfRoom') || _.get(bookings, '[0].amount') || 1;

	await apis
		.changeListing(bookings, [
			{
				id: otaListingId,
				amount,
			},
		])
		.catch(err => {
			logger.error('apis.changeListing', OTAName, otaBookingId, err);
		});

	const data = getBookingData(reservation, detail, pricing);

	data.otaListingId = otaListingId;
	data.status = status;
	data.amount = amount;

	if (bookings[0]) {
		data.guestId = bookings[0].guestId;
		data.messages = bookings[0].messages;
	}

	if (!detail && emailData && emailData.bookingInfo.amountPayable) {
		let [roomPrice, currency] = parsePrice(emailData.bookingInfo.amountPayable);
		let [netPrice] = parsePrice(emailData.bookingInfo.amountToProperty);

		if (currency) data.currency = currency;
		if (roomPrice) data.roomPrice = roomPrice;
		if (roomPrice && netPrice) {
			data.otaFee = roomPrice - netPrice;
		} else {
			let [com] = parsePrice(emailData.bookingInfo.commission);
			if (com) {
				data.otaFee = Math.abs(com);
				if (data.roomPrice) {
					data.roomPrice += data.otaFee;
				}
			}
		}
	}

	if (data.guest && !data.guest.phone && emailData && emailData.bookingInfo.guestPhone) {
		data.guest.phone = emailData.bookingInfo.guestPhone;
	}

	await apis.confirmReservation(data);
}

async function cancelReservation(reservation, status, otaConfig) {
	const otaBookingId = _.toString(reservation.bookingId);
	const booking = await models.Booking.findOne({ otaBookingId, otaName: OTAName });

	if (!booking) {
		logger.warn('Agoda cancelReservation not found old booking', reservation, status);
		const detail = await getPropertyBookingDetail({
			propertyId: reservation.propertyId,
			bookingToken: reservation.bookingToken,
			otaConfig,
		});

		const pricing = await getBookingPrice({
			propertyId: reservation.propertyId,
			bookingToken: reservation.bookingToken,
			otaConfig,
		});

		const data = getBookingData(reservation, detail, pricing);
		data.status = status;

		await apis.confirmReservation(data).catch(e => {
			logger.error(e);
		});
	}

	await apis.cancelReservation({
		reservation: { otaName: OTAName, otaBookingId, status },
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function setReservation(reservation, otaConfig) {
	const status = mapAckRequestType(reservation.ackRequestType);

	switch (status) {
		case BookingStatus.CONFIRMED:
		case BookingStatus.REQUEST:
			await confirmReservation(reservation, status, otaConfig);
			break;
		case BookingStatus.CANCELED:
			await cancelReservation(reservation, status, otaConfig);
			break;
		default:
			break;
	}
}

async function reservationsCrawler(otaConfig, from, to, resId) {
	if (Locker.isBusy(otaConfig.account)) {
		logger.warn('Agoda reservationsCrawler isBusy', otaConfig.account);
		return;
	}

	await Locker.acquire(otaConfig.account, async () => {
		const properties = await models.Block.getPropertiesId(OTAName, otaConfig.account);

		const dateFrom = moment().startOf('day').add(-1, 'date').toDate();
		const dateTo = moment().endOf('day').add(5, 'date').toDate();

		for (const propertyId of _.uniq(properties)) {
			const bookings = await getPropertyBookings({
				otaConfig,
				propertyId,
				from: dateFrom,
				to: dateTo,
				bookingId: resId,
			});

			for (const booking of bookings) {
				await Promise.delay(1000);

				await setReservation(booking, otaConfig).catch(err => {
					logger.error(err);
				});
			}

			await Promise.delay(3000);
		}
	});
}

async function crawlerReservationWithId(otaConfig, propertyId, reservationId) {
	let properties = [];

	if (propertyId) {
		properties = [propertyId];
	} else {
		properties = await models.Block.getPropertiesId(OTAName, otaConfig.account);
	}

	for (const pId of _.uniq(properties)) {
		const [booking] = await getPropertyBookings({ otaConfig, propertyId: pId, bookingId: reservationId });

		if (booking) {
			await Promise.delay(1000);

			await setReservation(booking, otaConfig);

			return;
		}

		await Promise.delay(3000);
	}

	throw new Error(`Agoda crawlerReservationWithId not found ${propertyId} ${reservationId}`);
}

async function checkApi(ota) {
	const res = await fetch(`https://ycs.agoda.com/mldc/en-us/api/iam/PropertySearch/FiltersInformation`, {
		method: 'GET',
		headers: getAgodaHeader(ota),
	});

	logger.info('Agoda checkApi', ota.account, res.status);

	return res.status !== 401;
}

module.exports = {
	reservationsCrawler,
	crawlerReservationWithId,
	checkApi,
};

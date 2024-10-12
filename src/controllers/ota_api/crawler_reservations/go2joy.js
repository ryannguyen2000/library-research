const _ = require('lodash');
const moment = require('moment');

const fetch = require('@utils/fetch');
const {
	BookingStatus,
	OTAs,
	RuleDay,
	Services,
	RuleOvernight,
	RateType,
	Currency,
	DELAY_MINUTE_CHECK_HEADER,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const Uri = require('@utils/uri');

const models = require('@models');
const apis = require('@controllers/booking/reservation');
const { getGo2joyHeader } = require('@controllers/ota_api/header_helper');

// admin page: https://ha.go2joy.vn/
const OTAName = OTAs.Go2joy;
const PER_PAGE = 50;
const MAX_PAGE = 10;
const END_POINT = 'https://api-ha.go2joy.vn/api/v1';
const HOTEL_CACHE = {};

function getBookingStatus(status) {
	if (status === 8 || status === 10) return;

	if (status === 3 || status === 4) return BookingStatus.CANCELED;
	// if (status === 4) return BookingStatus.NOSHOW;

	return BookingStatus.CONFIRMED;
}

async function request(uri, options) {
	const res = await fetch(uri, options);

	if (!res.ok) {
		logger.error('go2joy request error', uri, options, await res.text());
		return Promise.reject(res.status);
	}

	const json = await res.json();

	if (json.code !== 1) {
		logger.error('go2joy request error', uri, options, json);

		return Promise.reject(json);
	}

	return json.data;
}

async function getHotelDetail(hotelSn, otaConfig) {
	if (HOTEL_CACHE[hotelSn]) {
		return HOTEL_CACHE[hotelSn];
	}

	const uri = `${END_POINT}/web/ha/home-hotel?hotelSn=${hotelSn}`;
	const headers = getGo2joyHeader(otaConfig);

	const data = await request(uri, {
		headers,
	});

	if (data) {
		HOTEL_CACHE[hotelSn] = data;
	}

	return data;
}

async function getReservations(otaConfig, query) {
	const { propertyId, page = 1, ...q } = query;

	const uri = Uri(`${END_POINT}/web/ha/user-bookings`, {
		// startDate: fromDate,
		hotelSn: propertyId,
		bookingStatus: 0,
		limit: PER_PAGE,
		page,
		...q,
	});

	try {
		const headers = getGo2joyHeader(otaConfig);

		const data = await request(uri, {
			headers,
		});

		if (data.bookingList.length) {
			await processBookings(data.bookingList, propertyId, otaConfig);
		}

		if (data.meta.lastPage > page && page <= MAX_PAGE) {
			return await getReservations(otaConfig, { ...query, page: page + 1 });
		}

		return data.bookingList;
	} catch (e) {
		logger.error('getReservations', e, query);
		return [];
	}
}

async function getBookingDetail({ otaConfig, reservationId }) {
	const headers = getGo2joyHeader(otaConfig);

	const sn = Number(reservationId) - 100000;

	const data = await request(`${END_POINT}/web/ha/user-bookings/${sn}/details`, {
		headers,
	});

	return data;
}

function getCheckinTime({ checkInDatePlan, endDate, type, startTime, endTime }) {
	let checkin = checkInDatePlan;
	let checkout = endDate || checkInDatePlan;

	if (type === Services.Hour) {
		checkin += ` ${startTime}`;
		checkout += ` ${endTime}`;
	} else if (type === Services.Night) {
		checkin += ` ${RuleOvernight.from}:00`;
		checkout += ` ${RuleOvernight.to}:00`;
	} else {
		checkin += ` ${RuleDay.from}:00`;
		checkout += ` ${RuleDay.to}:00`;
	}

	checkin = moment(checkin, 'Y-MM-DD HH:mm:ss');
	checkout = moment(checkout, 'Y-MM-DD HH:mm:ss');

	return {
		from: checkin,
		to: checkout,
	};
}

async function confirmReservation(reservation, status, hotelDetail, otaConfig) {
	const {
		bookingNo,
		appUserNickName,
		email,
		// appUserSn,
		mobile,
		roomTypeSn,
		totalAmount,
		totalGo2JoyDiscount,
		totalHotelDiscount,
		amountFromUser,
		prepayAmount,
		type,
		// commissionAmount,
		sn,
		couponName,
		roomTypeAmount,
		hotelProductList,
	} = reservation;

	const priceItems = [];
	const specialRequests = [];

	const { from, to } = getCheckinTime(reservation);
	const expectCheckIn = from.format('HH:mm');
	const expectCheckOut = to.format('HH:mm');

	if (from.isSame(to, 'day')) {
		to.add(1, 'day');
	}

	if (type !== Services.Day) {
		specialRequests.push(
			`Khách đặt ${type === Services.Hour ? `theo giờ: ${expectCheckIn} -> ${expectCheckOut}` : 'qua đêm'}`
		);
	}
	if (couponName) {
		specialRequests.push(`Coupon: ${couponName}`);
	}

	if (totalAmount) {
		priceItems.push({
			title: 'Tổng giá',
			amount: totalAmount,
			priceType: 'totalPrice',
		});
	}
	if (totalGo2JoyDiscount) {
		priceItems.push({
			title: 'Khuyến mãi G2J',
			amount: -totalGo2JoyDiscount,
			priceType: 'promotionG2j',
		});
	}
	if (totalHotelDiscount) {
		priceItems.push({
			title: 'Khuyến mãi KS',
			amount: -totalHotelDiscount,
			priceType: 'promotionHotel',
		});
	}

	if (roomTypeAmount !== totalAmount) {
		// have other services
		let products = hotelProductList;

		if (!products) {
			const detail = await getBookingDetail({ otaConfig, reservationId: bookingNo });
			if (detail) {
				products = detail.hotelProductList;
			}
		}

		if (products && products.length) {
			specialRequests.push([`Sản phẩm đi kèm:`, ...products.map(p => `- ${p.name} x ${p.num}`)].join('\n'));

			priceItems.push(
				{
					title: 'Giá phòng',
					amount: roomTypeAmount,
					priceType: 'roomPrice',
				},
				...products.map(p => ({
					title: `${p.name} x ${p.num}`,
					amount: p.price,
					priceType: 'productPrice',
				}))
			);
		}
	}

	const otaId = `${OTAName}_${bookingNo}`;
	const data = {
		otaName: OTAName,
		otaBookingId: bookingNo,
		otaListingId: roomTypeSn,
		serviceType: type,
		from: from.toDate(),
		to: to.toDate(),
		fromHour: expectCheckIn,
		toHour: expectCheckOut,
		amount: 1,
		status,
		guest: {
			name: appUserNickName || 'Khách 1',
			fullName: appUserNickName || 'Khách 1',
			ota: OTAName,
			email,
			phone: `84${mobile}`,
			otaId,
		},
		priceItems,
		roomPrice: amountFromUser,
		currency: Currency.VND,
		rateType: prepayAmount >= amountFromUser ? RateType.PAY_NOW : RateType.PAY_AT_PROPERTY,
		thread: { id: otaId },
		specialRequests,
		expectCheckIn,
		expectCheckOut,
		other: {
			sn,
		},
	};

	const commission = hotelDetail && Number(hotelDetail.commission);
	if (_.isNumber(commission)) {
		data.otaFeePercent = _.round(commission / 100, 4);
		data.otaFee = (totalAmount - (totalHotelDiscount || 0)) * data.otaFeePercent;

		if (totalGo2JoyDiscount) {
			data.otaFee -= totalGo2JoyDiscount;
		}
		if (data.otaFee < 0 && data.rateType === RateType.PAY_NOW) {
			data.roomPrice += Math.abs(data.otaFee);
			data.otaFee = 0;
		}
	}

	await apis.confirmReservation(data);
}

async function cancelReservation(reservation, status) {
	const data = {
		otaName: OTAName,
		otaBookingId: reservation.bookingNo,
		declined: status === BookingStatus.DECLINED,
		status,
	};
	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function processBookings(reservations, propertyId, otaConfig) {
	if (!reservations.length) return;

	const hotelDetail = await getHotelDetail(propertyId, otaConfig);

	for (const reservation of reservations) {
		const status = getBookingStatus(reservation.bookingStatus);

		try {
			switch (status) {
				case BookingStatus.CONFIRMED:
				case BookingStatus.REQUEST:
					await confirmReservation(reservation, status, hotelDetail, otaConfig);
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
			logger.error(error, reservation);
		}
	}
}

async function reservationsCrawler(otaConfig, from) {
	const propertyIds = await models.Block.getPropertiesId(OTAName, otaConfig.account);
	const startDate = moment(from).add(-1, 'day').format('Y-MM-DD');

	// get reservations
	for (const propertyId of propertyIds) {
		await getReservations(otaConfig, { propertyId, startDate });
	}
}

async function crawlerReservation(otaConfig, reservationId) {
	const booking = await getBookingDetail({ otaConfig, reservationId }).catch(e => {
		logger.error('go2joy getBookingDetail e', e);
	});

	if (booking) {
		await processBookings([booking], booking.hotelSn, otaConfig);
	}

	return booking;
}

async function crawlerReservationWithId(otaConfig, propertyId, reservationId) {
	const booking = await crawlerReservation(otaConfig, reservationId);

	if (booking) {
		return;
	}

	if (!propertyId) {
		const otaConfigs = await models.OTAManager.findActiveOTAs({
			otaName: OTAName,
			account: { $ne: otaConfig.account },
		});

		for (const otherConfig of otaConfigs) {
			const otherBooking = await crawlerReservation(otherConfig, reservationId);

			if (otherBooking) {
				return;
			}
		}
	}

	throw new Error(`${OTAName} crawlerReservationWithId data null ${propertyId} ${reservationId}`);

	// for (const pId of propertyIds) {
	// 	const bookings = await getReservations(otaConfig, { propertyId: pId, keyword: reservationId });

	// 	if (bookings.length) {
	// 		error = false;
	// 		break;
	// 	}
	// }

	// if (error) {
	// 	throw new Error(`${OTAName} crawlerReservationWithId data null ${propertyId} ${reservationId}`);
	// }
}

function checkApi(ota) {
	const expireMinutes = DELAY_MINUTE_CHECK_HEADER + 1;
	return !!ota.other.expiresAt && ota.other.expiresAt > Date.now() / 1000 + expireMinutes * 60;
}

module.exports = {
	reservationsCrawler,
	checkApi,
	crawlerReservationWithId,
};

// const jwt = require('jsonwebtoken');
// const moment = require('moment');

// const fetchRetry = require('@utils/fetchRetry');
// const {
// 	BookingStatus,
// 	BookingStatusOrder,
// 	OTAs,
// 	Services,
// 	RateType,
// 	DELAY_MINUTE_CHECK_HEADER,
// } = require('@utils/const');
// const { logger } = require('@utils/logger');
// const { normPhone } = require('@utils/phone');
// const apis = require('@controllers/booking/reservation');

// // admin page: https://admin.grabhotel.net/
// const OTAName = OTAs.Grabhotel;
// const RES_URI = 'https://apiv2.grabhotel.net/booking/list';
// const PER_PAGE = 50;
// const MAX_PAGE = 20;

// function getBookingStatus(status) {
// 	switch (status) {
// 		case 'booked':
// 		case 'check-in':
// 		case 'check-out':
// 			return BookingStatus.CONFIRMED;
// 		case 'trash':
// 		case 'cancel':
// 			return BookingStatus.CANCELED;
// 		case 'no-show':
// 			return BookingStatus.NOSHOW;
// 		default:
// 			return BookingStatus.CONFIRMED;
// 	}
// }

// async function getReservations(otaConfig, from, to, page = 1) {
// 	const fromDate = from || moment().add(-1, 'day').toDate();
// 	const toDate = to || new Date();

// 	const query = [
// 		`page=${page}`,
// 		`limit=${PER_PAGE}`,
// 		'status=all',
// 		'discard_hidden=false',
// 		`order_by=check_in-desc`,
// 		`check_in_from=${fromDate.toDateMysqlFormat()}`,
// 		`check_in_to=${toDate.toDateMysqlFormat()} 23:59:59`,
// 	];

// 	const data = await fetchRetry(`${RES_URI}?${query.join('&')}`, null, otaConfig).then(res => res.json());

// 	if (data.status !== 1) {
// 		logger.error(`${OTAName} get reservations error`, data);
// 		return [];
// 	}

// 	if (page * PER_PAGE >= (data.data.total || 0) || page > MAX_PAGE) return data.data.rows;

// 	const nextList = await getReservations(otaConfig, from, to, page + 1);
// 	return [...data.data.rows, ...nextList];
// }

// async function confirmReservation(reservation, status) {
// 	let { userInfo, check_out, check_in, point = 0, extend_data, total, hotel } = reservation;

// 	let { coupon } = extend_data;
// 	const specialRequests = [];
// 	const from = moment(check_in);
// 	const to = moment(check_out);

// 	if (from.isSame(to, 'day')) {
// 		to.add(1, 'day');
// 	}

// 	const comission = hotel.commission ? hotel.commission / 100 : 0.15;
// 	const expectCheckIn = from.format('HH:mm');
// 	const expectCheckOut = to.format('HH:mm');
// 	const grabCoupon = (coupon && coupon.created_by !== 'admin-hotel' ? coupon.promotion_price : 0) || 0;

// 	await reservation.extend_data.rooms.asyncForEach(async listing => {
// 		const { type } = listing;
// 		const priceItems = [
// 			{
// 				title: listing.room_name,
// 				amount: listing.price,
// 				priceType: type,
// 			},
// 		];
// 		if (type !== Services.Day) {
// 			specialRequests.push(
// 				`Khách đặt ${type === Services.Hour ? `theo giờ: ${expectCheckIn} -> ${expectCheckOut}` : 'qua đêm'}`
// 			);
// 		}

// 		if (coupon) {
// 			priceItems.push({
// 				title: coupon.coupon_title,
// 				amount: -coupon.promotion_price,
// 				priceType: coupon.coupon_name,
// 			});
// 		} else if (point) {
// 			priceItems.push({
// 				title: 'Point',
// 				amount: -(point * 1000),
// 				priceType: 'point',
// 			});
// 		}
// 		const data = {
// 			otaName: OTAName,
// 			expectCheckIn,
// 			expectCheckOut,
// 			otaBookingId: reservation.order_code,
// 			otaListingId: listing.room_id,
// 			from: from.toDate(),
// 			to: to.toDate(),
// 			amount: listing.quantity,
// 			status,
// 			guest: {
// 				name: userInfo.full_name,
// 				fullName: userInfo.full_name,
// 				email: userInfo.email,
// 				ota: OTAName,
// 				phone: userInfo.phone,
// 				otaId:
// 					normPhone(userInfo.phone) ||
// 					userInfo.email ||
// 					`${OTAName}_${userInfo.id || reservation.order_code}`,
// 			},
// 			priceItems,
// 			numberChilden: 0,
// 			roomPrice: total,
// 			currency: reservation.currency.toUpperCase(),
// 			serviceType: type,
// 			rateType: reservation.payment_method === 'cash' ? RateType.PAY_AT_PROPERTY : RateType.PAY_NOW,
// 			createdAt: new Date(reservation.created_at),
// 			thread: { id: userInfo.id },
// 			otaFee: (coupon ? listing.price : total) * comission - grabCoupon, // commission 15%
// 			specialRequests,
// 		};

// 		await apis.confirmReservation(data);
// 	});
// }

// async function cancelReservation(reservation, status) {
// 	const data = {
// 		otaName: OTAName,
// 		otaBookingId: reservation.order_code,
// 		declined: status === BookingStatus.DECLINED,
// 		status,
// 	};
// 	await apis.cancelReservation({
// 		reservation: data,
// 		fullCancelled: true,
// 		cancelFromOTA: true,
// 	});
// }

// async function reservationsCrawler(otaConfig, from, to) {
// 	const reservations = await getReservations(otaConfig, from, to);

// 	reservations.sort((r1, r2) => {
// 		const o1 = BookingStatusOrder[getBookingStatus(r1.status)];
// 		const o2 = BookingStatusOrder[getBookingStatus(r2.status)];
// 		return o1 - o2;
// 	});

// 	for (const reservation of reservations) {
// 		const status = getBookingStatus(reservation.status);
// 		try {
// 			switch (status) {
// 				case BookingStatus.CONFIRMED:
// 				case BookingStatus.REQUEST:
// 					await confirmReservation(reservation, status);
// 					break;
// 				case BookingStatus.CANCELED:
// 				case BookingStatus.DECLINED:
// 				case BookingStatus.NOSHOW:
// 					await cancelReservation(reservation, status);
// 					break;
// 				default:
// 					break;
// 			}
// 		} catch (error) {
// 			logger.error(error);
// 		}
// 	}
// }

// function checkApi(ota) {
// 	const decoded = jwt.decode(ota.token, { complete: true });
// 	const expireMinutes = DELAY_MINUTE_CHECK_HEADER + 1;

// 	return decoded.payload.exp > Date.now() / 1000 + expireMinutes * 60;
// }

// module.exports = {
// 	reservationsCrawler,
// 	checkApi,
// };

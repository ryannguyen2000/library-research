const moment = require('moment');
const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { BookingStatus, OTAs, Services, RuleOvernight, RateType, DELAY_MINUTE_CHECK_HEADER } = require('@utils/const');
const { logger } = require('@utils/logger');
const { normPhone } = require('@utils/phone');
const models = require('@models');
const apis = require('@controllers/booking/reservation');

// admin page: https://motel.vntrip.vn/partner
const OTAName = OTAs.Quickstay;

async function getReservationStatistic(otaConfig, status = 4) {
	// const start = moment().add(-2, 'day').format('Y-MM-DD');
	// const end = moment(start).add(10, 'day').format('Y-MM-DD');

	// const data = await fetchRetry(
	// 	`https://motel.vntrip.vn/api/partner/statistic?start_time=${start}&end_time=${end}&status=${status}`,
	// 	{
	// 		timeout: 60000,
	// 	},
	// 	otaConfig,
	// 	1
	// )
	// 	.then(res => res.json())
	// 	.catch(e => e);

	// if (!data || !_.isArray(data)) {
	// 	// logger.error(`${OTAName} getReservationStatistic error`, data);
	// 	return [];
	// }

	// return data;

	return [];
}

async function getReservations(otaConfig) {
	const data = await fetchRetry('https://motel.vntrip.vn/api/partner/v2/order', null, otaConfig)
		.then(res => res.json())
		.catch(e => e);

	if (!data || !_.isArray(data.data)) {
		logger.error(`${OTAName} getReservations error`, data);
		return [];
	}

	return data.data;
}

async function confirmReservation(reservation, status) {
	let {
		total_amount,
		amount,
		discount_amount,
		payment_status,
		id,
		time_booking,
		code,
		room_id,
		customer_phone,
		booking_type,
		original_price_after_hour,
		hotel_discount_amount,
		addition_time,
		time_checkin,
	} = reservation;

	total_amount = reservation.note_total_amount || total_amount;
	amount = reservation.note_amount || amount;
	discount_amount = reservation.note_discount_amount || discount_amount;
	addition_time = reservation.note_addition_time || addition_time;
	const quickstay_discount_amount = discount_amount - hotel_discount_amount;

	const serviceType = booking_type === '0' ? Services.Hour : Services.Night;
	const isHour = serviceType === Services.Hour;

	const from = moment(time_checkin || time_booking, 'Y-MM-DD HH:mm:ss');
	const to = moment(from).add(2, 'hour');

	if (addition_time) {
		to.add(addition_time, 'hour');
	}

	if (!isHour) {
		const [startHour, startMinute] = RuleOvernight.from.split(':');
		const [endHour, endMinute] = RuleOvernight.to.split(':');

		from.hour(startHour).minute(startMinute);
		to.hour(endHour).minute(endMinute);
	}

	const expectCheckIn = from.format('HH:mm');
	const expectCheckOut = to.format('HH:mm');
	const price = parseInt(total_amount) * 1000;

	const specialRequests = [
		`${isHour ? 'Theo giờ' : 'Qua đêm'}: ${price} đ. ${
			original_price_after_hour ? `Giá bán giờ tiếp theo: ${original_price_after_hour * 1000} đ.` : ''
		}`,
	];

	const priceItems = [];
	priceItems.push(
		{
			title: 'Tiền phòng',
			amount: amount * 1000,
			priceType: 'origin_amount',
		},
		{
			title: 'KM Khách sạn',
			amount: -(hotel_discount_amount * 1000),
			priceType: 'hotel_discount_amount',
		},
		{
			title: 'KM Quickstay',
			amount: -(quickstay_discount_amount * 1000),
			priceType: 'quickstay_discount_amount',
		},
		{
			title: 'Tổng cộng',
			amount: total_amount * 1000,
			priceType: 'total_amount',
		}
	);

	const otaFee = (amount - quickstay_discount_amount) * 0.15 - quickstay_discount_amount;
	const data = {
		otaName: OTAName,
		otaBookingId: code,
		otaListingId: room_id.toString(),
		from: from.format('Y-MM-DD'),
		to: moment(from).add(1, 'day').format('Y-MM-DD'),
		expectCheckIn,
		expectCheckOut,
		amount: 1,
		status,
		guest: {
			name: reservation.customer_name,
			fullName: reservation.customer_name,
			email: reservation.boo_customer_email,
			ota: OTAName,
			phone: customer_phone,
			otaId: normPhone(customer_phone) || `${OTAName}_${reservation.customer_id || code}`,
		},
		numberChilden: 0,
		numberAdults: 2,
		roomPrice: price,
		otaFee: otaFee * 1000, // 15% for commission
		currency: 'VND',
		rateType: payment_status === 0 ? RateType.PAY_AT_PROPERTY : RateType.PAY_NOW,
		createdAt: from.toDate(),
		thread: { id },
		inquiryPostId: id,
		serviceType,
		specialRequests,
		priceItems,
	};

	await apis.confirmReservation(data);
}

function getBookingStatus({ status, note_status }) {
	const stt = note_status === null || note_status === undefined ? status : note_status;

	if (stt === 0) return BookingStatus.CANCELED;
	return BookingStatus.CONFIRMED;
}

async function getFuncForReservation(reservation, blockId, otaConfig) {
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
		otaName: OTAName,
		otaBookingId: reservation.boo_code,
		declined: status === BookingStatus.DECLINED,
		status,
	};
	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function reservationsCrawler(otaConfig) {
	const listing = await models.Listing.findOne({
		OTAs: { $elemMatch: { otaName: OTAName, account: otaConfig.account, active: true } },
	});
	if (!listing) return;

	const [reservations, reservationStatistic, reservationCancled] = await Promise.all([
		getReservations(otaConfig),
		getReservationStatistic(otaConfig),
		getReservationStatistic(otaConfig, 0),
	]);

	const allRes = _.uniqBy([...reservationStatistic, ...reservationCancled, ...reservations], 'id');

	for (const reservation of allRes) {
		await getFuncForReservation(reservation, listing.blockId, otaConfig);
	}
}

function checkApi(ota) {
	const lastSeen = new Date(ota.updatedAt).valueOf();
	const expire = 6048000; // 100 mins
	const delay = (DELAY_MINUTE_CHECK_HEADER + 1) * 60 * 1000;

	return Date.now() - lastSeen < expire - delay;
}

module.exports = {
	reservationsCrawler,
	checkApi,
};

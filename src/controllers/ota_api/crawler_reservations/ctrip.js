const _ = require('lodash');
const moment = require('moment');

const fetch = require('@utils/fetch');
const { BookingStatus, OTAs, RateType, DELAY_MINUTE_CHECK_HEADER, OTA_ACCOUNT_TYPE } = require('@utils/const');
const { Settings } = require('@utils/setting');
const { logger } = require('@utils/logger');
// const { normPhone, isVirtualPhone } = require('@utils/phone');
const models = require('@models');
const apis = require('@controllers/booking/reservation');
const { getCtripHeader } = require('@controllers/ota_api/header_helper');

// admin page: https://ebooking.trip.com/
const OTAName = OTAs.Ctrip;
const URL = `https://ebooking.trip.com`;

const _mapOrderTypeToStatus = {
	N: BookingStatus.CONFIRMED,
	M: BookingStatus.CONFIRMED,
	D: BookingStatus.CONFIRMED,
	C: BookingStatus.CANCELED,
	S: BookingStatus.CANCELED,
	T: BookingStatus.CANCELED,
};

function mapOrderTypeToStatus(type, orderStatus) {
	const status = _mapOrderTypeToStatus[type];

	if (!status) {
		logger.error('AckRequestType cannot map to BookingStatus', type);
		return status;
	}

	if (status === BookingStatus.CONFIRMED && (orderStatus === 1 || orderStatus === 0)) {
		return BookingStatus.REQUEST;
	}

	return status;
}

async function sendMessage(detail, ota) {
	const uri = `${URL}/ebkorderv2/api/order/SendSMS`;

	const body = JSON.stringify({
		orderId: detail.orderID,
		formID: detail.formID,
		hotel: detail.hotelID,
		hotelTel: Settings.Hotline.value,
		smsType: '2',
	});

	await fetch(uri, {
		method: 'POST',
		headers: await getCtripHeader(ota),
		body,
	})
		.then(res => {
			if (!res.ok) {
				logger.error('Ctrip send hotel_tel -> error', res);
			}
		})
		.catch(e => {
			logger.error('Ctrip send hotel_tel -> error', e);
		});
}

async function getBookingDetail(reservation, otaConfig) {
	const { reqHead } = otaConfig.other;

	const clientId = _.get(reqHead, 'client.clientId');
	const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
	const uri = `${URL}/restapi/soa2/27204/getOrderDetail?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

	const bodyData = {
		// orderKey: reservation.orderKey,
		formID: reservation.formID,
		// token: reservation.token,
		sourceType: reservation.ctripOrderSourceType,
		// ctripOrderSourceType: reservation.ctripOrderSourceType,
		hotel: reservation.hotel.toString(),
		orderSource: reservation.sourceType,
	};
	try {
		const res = await fetch(uri, {
			method: 'POST',
			headers: await getCtripHeader(otaConfig, {
				hotelId: reservation.hotel,
			}),
			body: JSON.stringify(bodyData),
		});
		if (!res.ok) {
			throw new Error(await res.text());
		}

		const result = await res.json();

		if (!result.detail || result.resStatus.rcode !== 200) {
			throw new Error(JSON.stringify(result));
		}

		return result.detail;
	} catch (e) {
		logger.error('Ctrip getBookingDetail error', bodyData, e);
	}
}

async function getReservations(otaConfig, propertyId, from, to, page = 1, reservationId) {
	const uri = `${URL}/ebkorderv2/api/order/allOrderList`;
	const bodyData = {
		customFilter: 'None',
		dateType: 'ArrivalDate',
		dateStart: reservationId ? '' : from,
		dateEnd: reservationId ? '' : to,
		orderType: 'ALL',
		orderStatus: '0',
		orderID: reservationId || '',
		clientName: '',
		bookingNo: '',
		roomName: '',
		confirmName: '',
		isGuarantee: false,
		isPP: false,
		isUrgent: false,
		isCreditOrder: false,
		receiveType: '',
		isHoldRoom: false,
		isFreeSale: false,
		pageInfo: {
			pageIndex: page,
			orderBy: 'FormDate',
		},
		searchAllHotel: false,
	};
	try {
		const response = await fetch(uri, {
			method: 'POST',
			headers: await getCtripHeader(otaConfig, {
				hotelId: propertyId,
			}),
			body: JSON.stringify(bodyData),
		});
		if (!response.ok) {
			throw new Error(await response.text());
		}
		const result = await response.json();
		if (result.code !== 200) {
			throw new Error(result);
		}

		const { orders, pageCount } = result.data || {};
		if (!orders) return [];

		for (const reservation of orders) {
			await getFuncForReservation(reservation, propertyId, otaConfig);
		}

		const maxPage = 5;
		if (pageCount > page && page <= maxPage) {
			return await getReservations(otaConfig, propertyId, from, to, page + 1);
		}

		return orders;
	} catch (e) {
		logger.error('Ctrip getReservations error', propertyId, from, to, e);
		return [];
	}
}

async function getPhoneNumber(reservation, otaConfig) {
	const hotelId = reservation.hotel || reservation.hotelId || reservation.hotelID;

	const body = JSON.stringify({
		callSource: 'PC',
		hotel: hotelId,
		orderId: reservation.orderID || reservation.orderId,
		sourceType: reservation.sourceType,
	});

	try {
		const clientId = _.get(otaConfig.other.reqHead, 'client.clientId');
		const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
		const uri = `${URL}/restapi/soa2/27204/getOrderContactNumber?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

		const response = await fetch(uri, {
			method: 'POST',
			headers: await getCtripHeader(otaConfig, {
				hotelId,
			}),
			body,
		});

		const json = await response.json();

		if (json.resStatus.rcode === 200) {
			return json.orderContactInfo.isNotSupportVirtualNum ? json.orderContactInfo.clientPhone : null;
		}

		throw json;
	} catch (e) {
		logger.error('Ctrip getPhoneNumber error', body, e);
		return null;
	}
}

async function confirmReservation(reservation, status, ota) {
	// get reservation details
	const detail = await getBookingDetail(reservation, ota);
	if (!detail) return;

	const data = {
		otaName: OTAName,
		otaBookingId: reservation.orderID,
		otaListingId: detail.roomID.toString(),
		from: reservation.arrival,
		to: reservation.departure,
		amount: reservation.quantity || 1,
		status,
		guest: {
			name: reservation.clientName,
			fullName: reservation.clientName,
			email: detail.didEmail,
			ota: OTAName,
			phone: detail.clientPhone,
			otaId:
				detail.didEmail ||
				`${OTAName}_${detail.formId || detail.formID || detail.FormID || reservation.clientName}`,
		},
		thread: {
			id: detail.formId || detail.formID || detail.FormID,
		},
		numberAdults: reservation.guests,
		numberChilden: reservation.childCount,
		// roomPrice: price || netPrice,
		// otaFee: price ? price - netPrice : 0,
		currency: reservation.currency,
		rateType: reservation.IsPP ? RateType.PAY_NOW : RateType.PAY_AT_PROPERTY,
		other: {
			token: reservation.token,
			otoken: reservation.oToken,
		},
		otaRateId: detail.ratePlanInfo ? detail.ratePlanInfo.ratePlanId : detail.roomID,
		specialRequests: detail.remarks && [detail.remarks],
		// rates: _.map(detail.orderRoomPrices, p => ({
		// 	date: p.originLivingDate,
		// 	price: p.price || p.sellPrice,
		// })),
	};
	const price = Number(reservation.totalSalePrice);
	const netPrice = Number(reservation.amount);

	if (reservation.IsPP) {
		data.roomPrice = netPrice || price;
		data.rates = _.map(detail.orderRoomPrices, p => ({
			date: p.originLivingDate || p.etaStr,
			price: p.price || p.costPrice || p.sellPrice,
		}));
		data.otaFee = 0;
	} else {
		data.roomPrice = price || netPrice;
		data.rates = _.map(detail.orderRoomPrices, p => ({
			date: p.originLivingDate || p.etaStr,
			price: p.sellPrice || p.price,
		}));
		data.otaFee = price ? price - netPrice : 0;
	}

	const existsBooking = await models.Booking.findOne({
		otaName: OTAName,
		otaBookingId: reservation.orderID.toString(),
	})
		.select('guestId')
		.populate('guestId', 'phone');

	if (!existsBooking) {
		sendMessage(detail, ota);
	}
	if (!_.get(existsBooking, 'guestId.phone') && !data.guest.phone) {
		const phone = await getPhoneNumber(reservation, ota);
		if (phone) {
			data.guest.phone = phone;
			// data.guest.otaId = normPhone(data.guest.phone);
		}
	}

	await apis.confirmReservation(data);
}

async function cancelReservation(reservation, status) {
	const data = {
		otaName: OTAName,
		otaBookingId: reservation.OrderID,
		declined: status === BookingStatus.DECLINED,
		status,
	};

	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function getFuncForReservation(reservation, propertyId, otaConfig) {
	try {
		const { orderType, orderStatus } = reservation;
		const status = mapOrderTypeToStatus(orderType, orderStatus);

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

async function reservationsCrawler(otaConfig, from, to) {
	if (_.get(otaConfig.other, 'account_type') === OTA_ACCOUNT_TYPE.CM_API) return;

	const propertIds = await models.Block.getPropertiesId(OTAName, otaConfig.account);

	from = from || moment().add(-2, 'day').toDate();
	to = to || moment().add(10, 'day').toDate();

	for (const propertyId of propertIds) {
		await getReservations(otaConfig, propertyId, from.toDateMysqlFormat(), to.toDateMysqlFormat());
	}
}

async function crawlerReservationWithId(otaConfig, propertyId, reservationId) {
	if (_.get(otaConfig.other, 'account_type') === OTA_ACCOUNT_TYPE.CM_API) return;

	const propertIds = propertyId ? [propertyId] : await models.Block.getPropertiesId(OTAName, otaConfig.account);
	if (!propertIds.length) return;

	let error = true;

	for (const hotelId of propertIds) {
		const reservations = await getReservations(otaConfig, hotelId, null, null, 1, reservationId);

		if (reservations.length) {
			error = false;
		}
	}

	if (error) {
		throw new Error(`${OTAName} crawlerReservationWithId data null ${propertyId} ${reservationId}`);
	}
}

function checkApi(ota) {
	if (_.get(ota.other, 'account_type') === OTA_ACCOUNT_TYPE.CM_API) return true;

	// cookie expired after 30 days

	const expireDays = 30;
	const oneMinute = 60 * 1000;
	const oneDay = 24 * 60 * oneMinute;
	const delayMinutes = DELAY_MINUTE_CHECK_HEADER + 2;
	const lastSeen = new Date(ota.updatedAt).valueOf();

	return lastSeen + (expireDays * oneDay - delayMinutes * oneMinute) > Date.now();
}

module.exports = {
	reservationsCrawler,
	crawlerReservationWithId,
	checkApi,
};

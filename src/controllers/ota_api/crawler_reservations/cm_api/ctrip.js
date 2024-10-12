// const express = require('express');

// const xmlparser = require('express-xml-bodyparser');
const _ = require('lodash');
const { md5 } = require('@utils/crypto');

// const models = require('@models');
const { logger } = require('@utils/logger');
const { OTAs, BookingStatus, RateType } = require('@utils/const');
const apis = require('@controllers/booking/reservation');
const { generateXMLResponse, getPaymentCardInfo, getHotelReservationId } = require('../../utils');
const { CTRIP_REQUEST_TYPE, CTRIP_APPENDIX } = require('../../const');

const AppendixAgeQualifyCode = {
	Child: '8',
	Adult: '10',
};

function validatePaymentCard(paymentCard, md5Value) {
	const paymentString = md5(`${paymentCard.cardNumber}&${paymentCard.cardHolderName}&${paymentCard.expireDate}`);
	return paymentString === md5Value;
}

async function onCancelReservation(reservation) {
	logger.info('On cancel reservation', otaBookingId, reservation);

	const echoToken = _.get(reservation, 'ota_cancelrq.$.EchoToken');
	const uniqId = _.get(reservation, 'ota_cancelrq.uniqueid');

	const { resIdValue, resIdType } = getHotelReservationId(uniqId);

	// const resValue = _.isArray(uniqId)
	// 	? _.get(
	// 			_.find(uniqId, resId => (_.get(resId, '$.ResID_Type') || _.get(resId, '$.Type')) !== '10'),
	// 			'$'
	// 	  )
	// 	: _.get(uniqId, '$');

	const otaBookingId = resIdValue;

	const reason = _.get(reservation, ['ota_cancelrq', 'reasons', 'reason']);

	const data = {
		otaName: OTAs.Ctrip,
		otaBookingId,
		// declined: status === BookingStatus.DECLINED,
		status: BookingStatus.CANCELED,
	};

	await apis.cancelReservation({
		reservation: data,
		reason,
		fullCancelled: true,
		cancelFromOTA: true,
	});

	const responseData = {
		elementName: CTRIP_REQUEST_TYPE.OTA_CANCELRQ.responseElement,
		errors: false,
		echoToken,
	};
	// ----- Success Response Data -----
	responseData.success = true;
	responseData.mainElement = `<UniqueID ID="${resIdValue}" Type="${resIdType}" ID_Context="Trip.com" />`;

	return generateXMLResponse(responseData);
}

function getReservationInfo(reservation) {
	const echoToken = _.get(reservation, 'ota_hotelresrq.$.EchoToken');
	const hotelreservation = _.get(reservation, ['ota_hotelresrq', 'hotelreservations', 'hotelreservation']);
	const roomTypeCode = _.get(hotelreservation, [
		'roomstays',
		'roomstay',
		'roomtypes',
		'roomtype',
		'$',
		'RoomTypeCode',
	]);
	const resglobalInfo = _.get(hotelreservation, ['resglobalinfo']);
	const start = _.get(resglobalInfo, ['timespan', '$', 'Start']);
	const end = _.get(resglobalInfo, ['timespan', '$', 'End']);

	// Special Request
	const specialrequestReservation = _.get(resglobalInfo, ['specialrequests', 'specialrequest']);
	const specialRequests = _.isArray(specialrequestReservation)
		? _.map(specialrequestReservation, item => item.text)
		: [_.get(specialrequestReservation, 'text')];
	// Currency code
	const currencyCode = _.get(resglobalInfo, ['total', '$', 'CurrencyCode']);
	// Guest
	const guestCount = _.get(resglobalInfo, ['guestcounts', 'guestcount']);
	const totalAdults =
		guestCount.length > 0
			? _.reduce(
					guestCount,
					(total, guest) => {
						if (guest.$.AgeQualifyingCode === AppendixAgeQualifyCode.Adult) {
							return total + parseInt(guest.$.Count);
						}
						return total;
					},
					0
			  )
			: _.get(guestCount, '$.Count');
	const totalChildren =
		guestCount.length > 0
			? guestCount.reduce((total, guest) => {
					if (guest.$.AgeQualifyingCode === AppendixAgeQualifyCode.Child) {
						return total + parseInt(guest.$.Count);
					}
					return total;
			  }, 0)
			: _.get(guestCount, '$.Count');

	// Prepay
	const depositPayments = _.get(resglobalInfo, ['depositpayments']);
	const virtualCreditCardInfo = _.get(depositPayments, 'guaranteepayment.acceptedpayments.acceptedpayment');
	let paymentCard = [];

	if (virtualCreditCardInfo) {
		paymentCard = _.isArray(virtualCreditCardInfo)
			? _.map(virtualCreditCardInfo, item => getPaymentCardInfo(item.paymentcard))
			: _.compact([getPaymentCardInfo(virtualCreditCardInfo.paymentcard)]);
	}

	// Pay at hotel
	const guarantee = _.get(resglobalInfo, ['guarantee']);
	const creditCardInfo = _.get(guarantee, ['guaranteesaccepted', 'guaranteeaccepted']); //  credit card
	if (creditCardInfo) {
		paymentCard = _.isArray(creditCardInfo)
			? _.map(creditCardInfo, item => getPaymentCardInfo(item.paymentcard))
			: _.compact([getPaymentCardInfo(creditCardInfo.paymentcard)]);
	}

	const hasCreditCard = !_.isEmpty(creditCardInfo) || !_.isEmpty(virtualCreditCardInfo);

	const hotelReservationid = _.get(resglobalInfo, ['hotelreservationids', 'hotelreservationid']);

	const { resIdValue, resIdType, resIdMd5Value } = getHotelReservationId(hotelReservationid);

	const amountAfterTax = _.get(resglobalInfo, ['total', '$', 'AmountAfterTax']);
	const taxesReservation = _.get(resglobalInfo, ['total', 'taxes', 'tax']);

	const taxes = _.isArray(taxesReservation)
		? _.map(taxesReservation, tax => _.get(tax, '$'))
		: [_.get(taxesReservation, '$')];

	// Reguest
	let resguest = _.get(hotelreservation, 'resguests.resguest');
	resguest = _.isArray(resguest) ? resguest[0] : resguest;

	const profile = _.get(resguest, ['profiles', 'profileinfo', 'profile']);

	const personName = _.get(profile, 'customer.personname');

	const name =
		_.get(personName, '[0].givenname') ||
		_.get(personName, 'givenname') ||
		_.get(personName, '[0].GivenName') ||
		_.get(personName, 'GivenName');

	const surname = _.get(personName, '[0].surname') || _.get(personName, 'surname');

	const fullName = `${surname} ${name}`;

	const arrivalTime = _.get(resguest, ['$', 'ArrivalTime']);

	// Rates
	const rateReservation = _.get(hotelreservation, [
		'roomstays',
		'roomstay',
		'roomrates',
		'roomrate',
		'rates',
		'rate',
	]);
	const numberOfUnits = _.get(hotelreservation, [
		'roomstays',
		'roomstay',
		'roomrates',
		'roomrate',
		'$',
		'NumberOfUnits',
	]); // 	Room quantity

	const rates = _.map(_.isArray(rateReservation) ? rateReservation : [rateReservation], item => ({
		date: _.get(item, '$.EffectiveDate'),
		price: Number(_.get(item, 'base.$.AmountAfterTax')) * numberOfUnits,
		currency: _.get(item, 'base.$.CurrencyCode'),
	}));

	const ratePlans = _.get(hotelreservation, ['roomstays', 'roomstay', 'rateplans', 'rateplan']);

	// Rate type
	const rateType = depositPayments ? RateType.PAY_NOW : RateType.PAY_AT_PROPERTY;

	return {
		resIdValue,
		resIdType,
		resIdMd5Value,
		start,
		end,
		currencyCode,
		rates,
		ratePlans,
		amountAfterTax,
		roomTypeCode,
		totalAdults,
		totalChildren,
		depositPayments,
		numberOfUnits,
		profile,
		fullName,
		name,
		paymentCard,
		specialRequests,
		arrivalTime,
		rateType,
		echoToken,
		hasCreditCard,
		taxes,
	};
}

async function onConfirmReservation(reservation) {
	// otaRateId: detail.ratePlanInfo ? detail.ratePlanInfo.ratePlanId : detail.roomID,
	// 	specialRequests: detail.remarks && [detail.remarks],
	const {
		resIdValue,
		resIdType,
		resIdMd5Value,
		start,
		end,
		currencyCode,
		amountAfterTax,
		profile,
		roomTypeCode,
		numberOfUnits,
		totalChildren,
		totalAdults,
		rates,
		ratePlans,
		paymentCard,
		specialRequests,
		arrivalTime,
		rateType,
		echoToken,
		fullName,
		name,
		// hasCreditCard,
		taxes,
	} = getReservationInfo(reservation);
	const from = start;
	const to = end;
	const price = Number(amountAfterTax);

	const contactPerson = _.get(profile, ['customer', 'contactperson']);
	const guestEmail = _.get(contactPerson, ['email']);
	const guestPhone = _.get(contactPerson, ['telephone', '$', 'PhoneNumber']);

	const otaRateId = _.get(ratePlans, '$.RatePlanCode');
	const priceItems = _.map(taxes, tax => {
		const feeTax = _.get(CTRIP_APPENDIX.FEE_TAX_TYPE, [tax.Code]);
		const priceItem = {
			title: _.get(feeTax, 'title') || `Fee code ${tax.Code}`,
			amount: tax.Amount,
			currency: tax.CurrencyCode,
			priceType: '',
		};
		return priceItem;
	});
	// const rateType = depositPayments ? RateType.PAY_NOW : RateType.PAY_AT_PROPERTY;
	const data = {
		otaName: OTAs.Ctrip,
		otaBookingId: resIdValue,
		otaListingId: roomTypeCode,
		from,
		to,
		status: BookingStatus.CONFIRMED,
		amount: numberOfUnits,
		guest: {
			name,
			fullName,
			ota: OTAs.Ctrip,
			otaId: `${OTAs.Ctrip}_${resIdValue}`,
			email: guestEmail,
			phone: guestPhone,
		},
		numberAdults: totalAdults,
		numberChilden: totalChildren,
		currency: currencyCode,
		rateType,
		otaRateId,
		specialRequests,
		expectCheckIn: arrivalTime,
		priceItems,
	};

	if (paymentCard) {
		data.paymentCards = paymentCard;
	}
	data.roomPrice = price;
	data.rates = rates;
	const responseData = {
		elementName: CTRIP_REQUEST_TYPE.OTA_HOTELRESRQ.responseElement,
		errors: false,
		echoToken,
	};

	if (resIdMd5Value && _.head(paymentCard)) {
		if (!validatePaymentCard(_.head(paymentCard), resIdMd5Value)) {
			responseData.errors = [
				{
					type: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.TYPE.MD5CheckFailed.code,
					code: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.CODE.MD5CheckFailed.codeValue,
					shortText: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.CODE.MD5CheckFailed.codeName,
				},
			];
			responseData.hotelReservation = {
				resStatus: CTRIP_APPENDIX.RESERVATION.STATUS.REJECTED.code,
				resGlobalInfo: {
					hotelReservationIDs: { resID_Value: resIdValue, resID_Type: resIdType },
				},
			};
			logger.error('Validate payment card failed', responseData);
			return generateXMLResponse(responseData);
		}
	}

	logger.info('On Receive reservation data from Trip.com', data);

	const bookingInfo = await apis.confirmReservation(data);
	// const bookingInfo = null;
	// ----- Success Response Data -----
	if (bookingInfo) {
		responseData.success = true;
		responseData.hotelReservation = {
			resStatus: CTRIP_APPENDIX.RESERVATION.STATUS.SUCESS.code,
			uniqueID: { type: resIdType, id: resIdValue },
			resGlobalInfo: {
				hotelReservationIDs: { resID_Value: resIdValue, resID_Type: resIdType },
			},
		};
	}
	logger.info(generateXMLResponse(responseData));
	return generateXMLResponse(responseData);
}

async function onReceivedBooking(req) {
	const reservation = req.body;
	const requestType = _.values(CTRIP_REQUEST_TYPE).find(item => reservation[item.key]);

	let responseData = generateXMLResponse({
		elementName: _.get(requestType, 'responseElement', ''),
		success: false,
		warnings: [],
		errors: [],
	});
	if (reservation[CTRIP_REQUEST_TYPE.OTA_HOTELRESRQ.key]) {
		responseData = await onConfirmReservation(reservation);
	}

	if (reservation[CTRIP_REQUEST_TYPE.OTA_CANCELRQ.key]) {
		responseData = await onCancelReservation(reservation);
	}

	return responseData;
}

module.exports = {
	onReceivedBooking,
};

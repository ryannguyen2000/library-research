// const moment = require('moment');
const _ = require('lodash');

const { OTAs, BookingStatus, RateType } = require('@utils/const');
const { logger } = require('@utils/logger');
const apis = require('@controllers/booking/reservation');

const OTAName = OTAs.Tiket;

async function confirmReservation(data, status) {
	const otaListingIds = _.uniq(_.map(data.RoomStays.RoomStay, 'RoomRates.RoomRate[0]._RoomTypeCode'));

	const globalData = {
		status,
		otaName: OTAName,
		otaBookingId: data.UniqueID._ID,
		rateType: RateType.PAY_NOW,
		paymentMethod: _.get(data.TPA_Extensions, 'Payer.Payments.Payment[0]._PaymentMethod'),
		paymentCards: _.map(
			_.get(data.ResGlobalInfo, 'ResGlobalInfo.Guarantee.GuaranteesAccepted.GuaranteeAccepted'),
			c => ({
				cardHolderName: c.PaymentCard.CardHolderName,
				cardNumber: c.PaymentCard._CardNumber,
				cardCode: c.PaymentCard._CardCode,
				cardType: c.PaymentCard._CardType,
				expireDate: c.PaymentCard._ExpireDate,
				seriesCode: c.PaymentCard._SeriesCode,
			})
		),
	};

	const bookings = [];

	for (const otaListingId of otaListingIds) {
		const rooms = data.RoomStays.RoomStay.filter(r => r.RoomRates.RoomRate[0]._RoomTypeCode === otaListingId);

		const amount = _.sumBy(rooms, 'RoomRates.RoomRate[0]._NumberOfUnits');
		const roomPrice = _.sumBy(rooms, 'Total._AmountAfterTax');
		const currency = rooms[0].Total._CurrencyCode;

		const rates = _.map(rooms[0].RoomRates.RoomRate[0].Rates.Rates, (__, index) => ({
			name: __._RoomPricingType,
			date: __._EffectiveDate,
			price: _.sumBy(rooms, `RoomRates.RoomRate[0].Rates.Rates[${index}].Base._AmountAfterTax`),
			currency,
		}));
		const resGuestRPHs = _.map(rooms, 'ResGuestRPHs');

		const resGuests = data.ResGuests.ResGuest.filter(resGuest => resGuestRPHs.includes(resGuest._ResGuestRPH));
		const guests = resGuests.map(resGuest => {
			const { Customer } = resGuest.Profiles.ProfileInfo[0].Profile;
			return {
				name: Customer.PersonName.GivenName,
				fullName: `${Customer.PersonName.GivenName} ${Customer.PersonName.Surname}`,
				email: Customer.Email,
				phone: Customer.Telephone,
				ota: OTAName,
				otaId: `${OTAName}_${Customer.Telephone || `${globalData.otaBookingId}_${resGuest._ResGuestRPH}`}`,
			};
		});
		const specialRequest = _.get(resGuests[0], 'SpecialRequests.SpecialRequest[0].Text.value');

		const roomData = {
			...globalData,
			from: rooms[0].TimeSpan._Start,
			to: rooms[0].TimeSpan._End,
			otaListingId,
			amount,
			roomPrice,
			rates,
			currency,
			guest: guests[0],
			guests: guests.slice(1),
			specialRequests: specialRequest ? [specialRequest] : [],
			numberAdults: _.sumBy(rooms, 'GuestCounts.GuestCount[2]._Count') || undefined,
			numberChilden: _.sumBy(rooms, 'GuestCounts.GuestCount[1]._Count') || undefined,
			otaRateId: _.get(rooms[0], 'RoomRates.RoomRate[0]._RatePlanCode'),
		};

		const booking = await apis.confirmReservation(roomData);
		bookings.push(booking);
	}

	return bookings;
}

async function cancelReservation(reservation, status) {
	const data = {
		otaName: OTAName,
		otaBookingId: reservation.UniqueID._ID,
		declined: status === BookingStatus.DECLINED,
		status,
	};
	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

function mapAckRequestType(type) {
	const MAP_STATUS = {
		Commit: BookingStatus.CONFIRMED,
		Modify: BookingStatus.CONFIRMED,
		Cancel: BookingStatus.CANCELED,
	};
	const status = MAP_STATUS[type];

	if (!status) {
		logger.warn(`${OTAName} AckRequestType cannot map to BookingStatus`, type);
	}

	return status || BookingStatus.CONFIRMED;
}

async function mapStatusToAction(reservation) {
	const status = mapAckRequestType(reservation._Status);

	switch (status) {
		case BookingStatus.CONFIRMED:
		case BookingStatus.REQUEST:
			await confirmReservation(reservation, status);
			break;
		case BookingStatus.CANCELED:
		case BookingStatus.DECLINED:
			await cancelReservation(reservation, status);
			break;
		// case AMENDED:
		// 	await changeDateReservation(reservation, status);
		// 	break;
		default:
			break;
	}
}

async function onReceivedBooking(data) {
	const reservations = _.get(data, 'OTA_HotelResNotifRQ.HotelReservations.HotelReservation') || [];

	const defRes = {
		OTA_HotelResNotifRS: {
			_Version: _.get(data, 'OTA_HotelResNotifRQ._Version'),
			_TimeStamp: new Date().toISOString(),
			_EchoToken: _.get(data, 'OTA_HotelResNotifRQ._EchoToken'),
		},
	};

	try {
		await reservations.asyncMap(reservation => mapStatusToAction(reservation));

		defRes.OTA_HotelResNotifRS.HotelReservations = {
			HotelReservation: _.map(reservations, res => ({
				UniqueID: res.UniqueID,
				ResGlobalInfo: {
					HotelReservationIDs: res.ResGlobalInfo.HotelReservationIDs,
				},
			})),
		};
	} catch (e) {
		logger.error('onReceivedBooking', e);

		defRes.OTA_HotelResNotifRS.Errors = {
			Error:
				e.code === 404
					? [
							{
								_Type: '3',
								_Code: '99999',
								_Value: 'Cannot find hotelier HOTEL1',
							},
					  ]
					: [
							{
								_Type: '4',
								_Code: '1',
								_Value: 'Unknown error',
							},
					  ],
		};
	}

	return defRes;
}

module.exports = {
	onReceivedBooking,
};

const _ = require('lodash');
const moment = require('moment');

const fetch = require('@utils/fetch');
const fetchRetry = require('@utils/fetchRetry');
const { BookingStatus, BookingStatusOrder, OTAs, RateType } = require('@utils/const');
const { logger } = require('@utils/logger');
const Uri = require('@utils/uri');
const models = require('@models');
const apis = require('@controllers/booking/reservation');

// admin page: https://www.expediapartnercentral.com/
const OTAName = OTAs.Expedia;
const URI = 'https://apps.expediapartnercentral.com';
const API_URI = 'https://api.expediapartnercentral.com';
const ROOM_TYPES = {};

function getBookingStatus(status) {
	status = _.toLower(status);
	switch (status) {
		case 'cancelled':
			return BookingStatus.CANCELED;
		default:
			return BookingStatus.CONFIRMED;
	}
}

async function getReservations(otaConfig, propertyId, from, to, searchParam) {
	searchParam = searchParam ? `"${searchParam}"` : null;

	const uri = `${API_URI}/supply/experience/gateway/graphql`;
	const requestBody = {
		query: `query getReservationsBySearchCriteria {reservationSearchV2(input: {propertyId: ${+propertyId}, booked: true, bookingItemId: null, canceled: true, confirmationNumber: null, confirmed: true, startDate: "${from}", endDate: "${to}", dateType: "checkIn", evc: false, expediaCollect: true, timezoneOffset: "+07:00", firstName: null, hotelCollect: true, isSpecialRequest: false, isVIPBooking: false, lastName: null, reconciled: false, returnBookingItemIDsOnly: false, searchParam: ${searchParam}, unconfirmed: true searchForCancelWaiversOnly: false }) { reservationItems{ reservationItemId reservationInfo {reservationTpid propertyId startDate endDate createDateTime brandDisplayName newReservationItemId country reservationAttributes {businessModel bookingStatus fraudCancelled fraudReleased stayStatus } specialRequestDetails accessibilityRequestDetails product {productTypeId unitName unitCode bedTypeName propertyVipStatus} customerArrivalTime {arrival}readyToReconcile epsBooking } customer {id guestName phoneNumber email emailAlias country} loyaltyInfo {loyaltyStatus vipAmenities} confirmationInfo {productConfirmationCode} conversationsInfo {conversationsSupported id unreadMessageCount conversationStatus cpcePartnerId}totalAmounts {totalAmountForPartners {value currencyCode}totalCommissionAmount {value currencyCode}totalReservationAmount {value currencyCode}propertyBookingTotal {value currencyCode}totalReservationAmountInPartnerCurrency {value currencyCode}}reservationActions {requestToCancel {reason actionSupported actionUnsupportedBehavior {hide disable}}changeStayDates {reason actionSupported}requestRelocation {reason actionSupported}actionAttributes {highFence}reconciliationActions {markAsNoShow {reason actionSupported actionUnsupportedBehavior {hide disable openVa}virtualAgentParameters {intentName taxonomyId}}undoMarkNoShow {reason actionSupported actionUnsupportedBehavior {hide disable}}changeCancellationFee {reason actionSupported actionUnsupportedBehavior {hide disable}}resetCancellationFee {reason actionSupported actionUnsupportedBehavior {hide disable}}markAsCancellation {reason actionSupported actionUnsupportedBehavior {hide disable}}undoMarkAsCancellation {reason actionSupported actionUnsupportedBehavior {hide disable}}changeReservationAmountsOrDates {reason actionSupported actionUnsupportedBehavior {hide disable}}resetReservationAmountsOrDates {reason actionSupported actionUnsupportedBehavior {hide disable}}}}reconciliationInfo {reconciliationDateTime reconciliationType}paymentInfo {evcCardDetailsExist expediaVirtualCardResourceId creditCardDetails { viewable viewCountLimit viewCountLeft viewCount hideCvvFromDisplay valid prevalidateCardOptIn cardValidationViewable inViewingWindow validationInfo {validationStatus validationType validationDate validationBy hasGuestProvidedNewCC newCreditCardReceivedDate is24HoursFromLastValidation } }}cancellationInfo {cancelDateTime cancellationPolicy {priceCurrencyCode costCurrencyCode policyType cancellationPenalties {penaltyCost penaltyPrice penaltyPerStayFee penaltyTime penaltyInterval penaltyStartHour penaltyEndHour }nonrefundableDatesList}}compensationDetails {reservationWaiverType reservationFeeAmounts {propertyWaivedFeeLineItem {costCurrency costAmount }}} searchWaiverRequest {serviceRequestId type typeDetails state orderNumber partnerId createdDate srConversationId lastUpdatedDate notes {text author {firstName lastName }}}} numOfCancelWaivers}}`,
		variables: {},
	};

	try {
		const results = await fetchRetry(
			uri,
			{
				method: 'POST',
				body: JSON.stringify(requestBody),
				redirect: 'manual',
			},
			otaConfig
		);

		if (results.status !== 200) {
			throw new Error(await results.text());
		}

		const json = await results.json();

		return _.get(json, 'data.reservationSearchV2.reservationItems') || [];
	} catch (e) {
		logger.error('Expedia get reservations error', propertyId, e);
		return [];
	}
}

// async function getPhoneNumber(propertyId, reservationId, otaConfig) {
// 	try {
// 		const uri = Uri(`${URI}/lodging/reservations/mfaViewContactInfo.json`, {
// 			htid: propertyId,
// 			bookingItemIds: reservationId,
// 		});

// 		const requestBody = {
// 			allBookingItemIds: [reservationId],
// 			bookingItemId: reservationId,
// 		};

// 		const res = await fetchRetry(
// 			uri,
// 			{
// 				method: 'POST',
// 				body: JSON.stringify(requestBody),
// 				redirect: 'manual',
// 			},
// 			otaConfig
// 		);
// 		if (res.status !== 200) {
// 			throw new Error(`${res.status} ${await res.text()}`);
// 		}
// 		const data = await res.json();
// 		return {
// 			phone: data.phoneNumber.replace(/\D/g, '').replace(/^0*/, ''),
// 			email: data.emailAlias,
// 		};
// 	} catch (e) {
// 		logger.warn(`${OTAName} getPhoneNumber`, reservationId, _.toString(e));
// 		return {};
// 	}
// }

async function getReservationDetail(propertyId, reservationId, otaConfig) {
	try {
		const uri = Uri(`${URI}/lodging/reservations/forceUpdateReservation.json`, {
			htid: propertyId,
			reservationId,
		});
		const data = await fetchRetry(
			uri,
			{
				redirect: 'manual',
			},
			otaConfig
		).then(res => res.json());

		const { lineItems } = data.bookingAmounts;
		const { adultCount, childCount, ratePlanName } = data.bookingInfo;

		// const promotion = _.get(data, 'promotionInfo.dynamicRateRuleSupplierCode');
		const prices = _.find(lineItems, l => l.type === 'TOTAL');
		const otaFee = _.find(lineItems, l => l.type === 'EC_CHARGE_RETAINED');
		// const fee = _.sumBy(lineItems, l => l.type === 'TAX' || l.type === 'FEE' || l.type === 'EC_CHARGE_RETAINED');

		// const rates = lineItems
		// 	.filter(l => l.type === 'DAILY_RATE')
		// 	.map((d, i, daily) => {
		// 		return {
		// 			date: daily.length === 1 ? checkInDate : d.date,
		// 			price: Number((d.costAmount + fee / daily.length).toFixed(1)),
		// 			currency: d.costCurrency,
		// 			promotion,
		// 			discount: (Math.abs(d.discountCostAmount) + d.costAmount) / d.costAmount,
		// 		};
		// 	});

		return {
			data,
			numberAdults: adultCount,
			numberChilden: childCount,
			currency: _.get(prices, 'costCurrency'),
			roomPrice: _.get(prices, 'costAmount'),
			otaFee: _.max([_.get(otaFee, 'costAmount'), _.get(data, 'totalAmounts.totalCommissionAmount.amount'), 0]),
			otaRateName: ratePlanName,
			// rates,
		};
	} catch (e) {
		logger.error(`${OTAName} get reservation detail error`, e);
		return {};
	}
}

function isBookingUpdated(booking, reservation) {
	if (
		!booking ||
		!booking.listingId ||
		booking.roomPrice !== reservation.roomPrice ||
		booking.rateType !== reservation.rateType ||
		(!booking.manual &&
			(booking.from.toDateMysqlFormat() !== reservation.from.slice(0, 10) ||
				booking.to.toDateMysqlFormat() !== reservation.to.slice(0, 10)))
	) {
		return true;
	}
}

async function confirmReservation(reservation, status, otaConfig) {
	const otaBookingId = reservation.reservationItemId;
	const { propertyId, startDate, endDate, product, reservationAttributes } = reservation.reservationInfo;

	const oldBook = await models.Booking.findOne({
		otaName: OTAName,
		otaBookingId: _.toString(otaBookingId),
	})
		.select('roomPrice listingId from to manual messages rateType otaFee guestId')
		.populate('guestId', 'phone')
		.lean();

	const data = {
		otaName: OTAName,
		otaBookingId,
		from: startDate,
		to: endDate,
		amount: 1,
		status,
		guest: {
			name: reservation.customer.guestName,
			fullName: reservation.customer.guestName,
			email: reservation.customer.emailAlias,
			// phone: contact.phone,
			ota: OTAName,
			otaId: `${reservation.customer.id}_${reservation.customer.guestName}`,
		},
		currency: reservation.totalAmounts.totalAmountForPartners.currencyCode,
		roomPrice: Math.max(
			_.get(reservation.totalAmounts, 'totalReservationAmountInPartnerCurrency.value'),
			_.get(reservation.totalAmounts, 'totalAmountForPartners.value')
		),
		otaFee: Math.max(_.get(reservation.totalAmounts, 'totalCommissionAmount.value'), 0),
		rateType: reservationAttributes.businessModel === 'DirectAgency' ? RateType.PAY_AT_PROPERTY : RateType.PAY_NOW,
	};

	if (!isBookingUpdated(oldBook, data)) {
		return;
	}

	ROOM_TYPES[propertyId] = ROOM_TYPES[propertyId] || (await getPropertyRoomTypes(otaConfig, propertyId));
	data.otaListingId =
		_.get(ROOM_TYPES[propertyId], product.unitCode) || _.get(ROOM_TYPES[propertyId], product.unitName);
	if (!data.otaListingId) {
		logger.error(
			`${OTAName} confirmReservation error otaListingId null`,
			propertyId,
			ROOM_TYPES[propertyId],
			JSON.stringify(reservation)
		);
		return;
	}

	const { data: detailData, ...detail } = await getReservationDetail(propertyId, otaBookingId, otaConfig);

	_.assign(data, detail);

	if (!oldBook || !oldBook.guestId.phone) {
		const crawler = await models.JobCrawler.findOne({
			otaName: OTAName,
			reservationId: data.otaBookingId,
			'bookingInfo.guestPhone': { $ne: null },
		});
		if (crawler) {
			data.guest.phone = crawler.bookingInfo.guestPhone;
		} else {
			// const contact = await getPhoneNumber(propertyId, otaBookingId, otaConfig);
			// data.guest.phone = contact.phone;
			// data.guest.email = contact.email;
		}
	}

	if (oldBook) {
		data.threadId = oldBook.messages;
	} else {
		const threadId =
			_.get(reservation.conversationsInfo, 'id') ||
			(_.get(reservation.conversationsInfo, 'conversationsSupported') &&
				(await getConservationId(propertyId, otaBookingId, otaConfig)));

		data.thread = {
			id: threadId || otaBookingId,
		};
	}

	await apis.confirmReservation(data);
}

async function cancelReservation(otaBookingId, status) {
	const data = {
		otaName: OTAName,
		otaBookingId,
		declined: false,
		status,
	};
	await apis.cancelReservation({
		reservation: data,
		fullCancelled: true,
		cancelFromOTA: true,
	});
}

async function getPropertyRoomTypes(otaConfig, propertyId) {
	try {
		const uri = Uri(`${URI}/lodging/roomsandrates/getRoomTypeRatePlanInfo-React.json`, {
			htid: propertyId,
			_time: Date.now(),
		});
		const resuls = await fetchRetry(uri, { redirect: 'manual' }, otaConfig);
		if (resuls.status !== 200) {
			throw new Error(await resuls.text());
		}

		const data = await resuls.json();
		const roomTypes = {};
		for (const room of data.activeRoomInformation) {
			roomTypes[room.roomTypeInformationModel.roomTypeCode] = room.roomTypeInformationModel.roomTypeId.toString();
			roomTypes[room.roomTypeInformationModel.roomTypeId] = room.roomTypeInformationModel.roomTypeId.toString();
		}
		return roomTypes;
	} catch (e) {
		logger.error(`${OTAName} getPropertyRoomTypes error ${propertyId}`, e);
		return null;
	}
}

async function getConservationId(propertyId, bookingItemId, otaConfig) {
	try {
		const result = await fetchRetry(
			`https://apps.expediapartnercentral.com/lodging/bookings/conversation/create?htid=${propertyId}`,
			{
				method: 'POST',
				body: JSON.stringify({
					hotelId: propertyId,
					bookingItemId,
					creatorTpid: otaConfig.other.creatorTPID,
				}),
			},
			otaConfig
		);

		if (result && result.status === 200) {
			const data = await result.json();
			return data._id;
		}
		throw new Error(await result.text());
	} catch (e) {
		logger.error(`${OTAName} getConservationId error`, e);
		return null;
	}
}

async function processReservation(otaConfig, reservation) {
	const status = getBookingStatus(reservation.reservationInfo.reservationAttributes.bookingStatus);
	try {
		switch (status) {
			case BookingStatus.CONFIRMED:
			case BookingStatus.REQUEST:
				await confirmReservation(reservation, status, otaConfig);
				break;
			case BookingStatus.CANCELED:
			case BookingStatus.DECLINED:
				await cancelReservation(reservation.reservationItemId, status);
				break;
			default:
				break;
		}
	} catch (error) {
		logger.error(error);
	}
}

async function reservationsCrawler(otaConfig, from, to) {
	const properties = await models.Block.getPropertiesId(OTAName, otaConfig.account);

	from = from || moment().add(-1, 'day').toDate();
	to = to || moment().add(3, 'day').toDate();

	for (const propertyId of properties) {
		const reservations = await getReservations(
			otaConfig,
			propertyId,
			from.toDateMysqlFormat(),
			to.toDateMysqlFormat()
		);
		reservations.sort((r1, r2) => {
			const o1 = BookingStatusOrder[getBookingStatus(r1.reservationInfo.reservationAttributes.bookingStatus)];
			const o2 = BookingStatusOrder[getBookingStatus(r2.reservationInfo.reservationAttributes.bookingStatus)];
			return o1 - o2;
		});

		for (const reservation of reservations) {
			await processReservation(otaConfig, reservation);
		}
	}
}

async function confirmReservationDetail(data, status, otaConfig) {
	const { bookingItemId, travelerInfo, conversationsInfo, bookingInfo } = data.data;
	const { hotelId, checkInDate, checkOutDate, roomTypeCode, businessModel } = bookingInfo;

	ROOM_TYPES[hotelId] = ROOM_TYPES[hotelId] || (await getPropertyRoomTypes(otaConfig, hotelId));
	const otaListingId = _.get(ROOM_TYPES[hotelId], roomTypeCode);
	if (!otaListingId) {
		logger.error(`${OTAName} confirmReservation error otaListingId null`, JSON.stringify(data));
		return;
	}

	// const contact = await getPhoneNumber(hotelId, bookingItemId, otaConfig);
	const rateType = businessModel === 'DirectAgency' ? RateType.PAY_AT_PROPERTY : RateType.PAY_NOW;

	const reservation = {
		otaName: OTAName,
		otaBookingId: bookingItemId,
		otaListingId,
		from: checkInDate,
		to: checkOutDate,
		amount: 1,
		status,
		guest: {
			name: travelerInfo.firstName,
			fullName: travelerInfo.fullName,
			email: travelerInfo.emailAlias,
			// phone: contact.phone,
			ota: OTAName,
			otaId: `${travelerInfo.tuid}_${travelerInfo.guestName}`,
		},
		rateType,
		currency: data.currency,
		roomPrice: data.roomPrice,
		otaFee: data.otaFee,
		numberChilden: data.numberChilden,
		numberAdults: data.numberAdults,
		dailyPrices: data.dailyPrices,
		otaRateName: data.otaRateName,
	};

	const threadId =
		conversationsInfo.conversationId ||
		(conversationsInfo.conversationsSupported && (await getConservationId(hotelId, bookingItemId, otaConfig)));

	reservation.thread = {
		id: threadId || bookingItemId,
	};

	await apis.confirmReservation(reservation);
}

async function crawlerReservationWithId(otaConfig, propertyId, reservationId) {
	if (!propertyId || !reservationId) {
		throw new Error(`${OTAName} crawlerReservationWithId data null ${propertyId} ${reservationId}`);
	}

	const detail = await getReservationDetail(propertyId, reservationId, otaConfig);

	const status = getBookingStatus(detail.data.bookingInfo.status);

	switch (status) {
		case BookingStatus.CONFIRMED:
		case BookingStatus.REQUEST:
			await confirmReservationDetail(detail, status, otaConfig);
			break;
		case BookingStatus.CANCELED:
		case BookingStatus.DECLINED:
			await cancelReservation(detail.data.bookingItemId, status);
			break;
		default:
			break;
	}
}

async function checkApi(otaConfig) {
	try {
		const results = await fetch(`${API_URI}/tpg/navigation/api/v1/dyff/SHOW_INFINITE_SCROLL`, {
			headers: {
				cookie: otaConfig.other.appCookie || otaConfig.cookie,
				clientId: 'tpg-navigation-default',
			},
		});
		const data = await results.json();
		return data.successful;
	} catch (e) {
		return e.code === 'ECONNRESET';
	}
}

module.exports = {
	reservationsCrawler,
	checkApi,
	crawlerReservationWithId,
};

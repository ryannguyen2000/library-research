const schedule = require('node-schedule');
const _ = require('lodash');
// const moment = require('moment');

const { logger } = require('@utils/logger');
const models = require('@models');
const { PAYMENT_CARD_STATUS, PAYMENT_CHARGE_STATUS, OTAs } = require('@utils/const');
// const { Settings } = require('@utils/setting');
// const { markInvalidCard } = require('@controllers/finance/payment/api');
const { checkCardUpdated } = require('@controllers/finance/payment/card');

// let isGettingCard = false;
// let isChargingCard = false;
// let isMarkingCard = false;
let isCheckingCard = false;

// const MAX_COUNT_GETTING_CARD = 2;

// async function jobGetBookingCard() {
// 	if (isGettingCard) return;

// 	if (!Settings.ActiveAutoChargeNonRefundable.value) {
// 		return;
// 	}

// 	isGettingCard = true;

// 	try {
// 		const bookings = await models.Booking.find({
// 			otaName: OTAs.Booking,
// 			paid: 0,
// 			'rateDetail.isNonRefundable': true,
// 			'paymentCardState.status': { $in: [null, PAYMENT_CARD_STATUS.INVALID] },
// 			'paymentCardState.chargedStatus': {
// 				$nin: [PAYMENT_CHARGE_STATUS.CHARGED, PAYMENT_CHARGE_STATUS.IGNORED],
// 			},
// 			'paymentCardState.gettingCount': {
// 				$lt: MAX_COUNT_GETTING_CARD,
// 			},
// 		})
// 			.select('_id otaName otaBookingId listingId paymentCardState')
// 			.lean();

// 		await bookings.asyncForEach(async booking => {
// 			try {
// 				await getCardInfo(booking);
// 			} catch (e) {
// 				logger.error('jobGetBookingCard', booking, e);
// 			}
// 		});
// 	} catch (e) {
// 		logger.error('jobGetBookingCard', e);
// 	}

// 	isGettingCard = false;
// }

// async function jobChargeBookings() {
// 	if (isChargingCard) return;

// 	if (!Settings.ActiveAutoChargeNonRefundable.value) {
// 		return;
// 	}

// 	isChargingCard = true;

// 	try {
// 		const bookings = await models.Booking.find({
// 			otaName: OTAs.Booking,
// 			paid: 0,
// 			'rateDetail.isNonRefundable': true,
// 			'paymentCardState.chargedStatus': PAYMENT_CHARGE_STATUS.NEED_TO_CHARGE,
// 		})
// 			.select('_id')
// 			.lean();

// 		const bookingIds = _.uniqBy(_.map(bookings, '_id'), _.toString);

// 		await bookingIds.asyncForEach(async bookingId => {
// 			try {
// 				const booking = await models.Booking.findById(bookingId);
// 				await chargeBookingCard(booking);
// 			} catch (e) {
// 				logger.error('jobChargeBookings', bookingId, e);
// 			}
// 		});
// 	} catch (e) {
// 		logger.error('jobChargeBookings', e);
// 	}

// 	isChargingCard = false;
// }

// async function markBookingsCardInvalid() {
// 	if (isMarkingCard) return;

// 	// if (!Settings.ActiveAutoChargeNonRefundable.value) {
// 	// 	return;
// 	// }

// 	isMarkingCard = true;

// 	try {
// 		const bookings = await models.Booking.find({
// 			otaName: OTAs.Booking,
// 			'rateDetail.isNonRefundable': true,
// 			paid: 0,
// 			'paymentCardState.status': PAYMENT_CARD_STATUS.INVALID,
// 			'paymentCardState.chargedStatus': {
// 				$nin: [
// 					PAYMENT_CHARGE_STATUS.CHARGED,
// 					PAYMENT_CHARGE_STATUS.IGNORED, //
// 				],
// 			},
// 			'paymentCardState.markedInvalid': { $ne: true },
// 		})
// 			.select('_id')
// 			.lean();

// 		const bookingIds = _.uniqBy(_.map(bookings, '_id'), _.toString);

// 		await bookingIds.asyncForEach(async bookingId => {
// 			try {
// 				const booking = await models.Booking.findById(bookingId);
// 				await markInvalidCard(booking);
// 			} catch (e) {
// 				logger.error('markBookingsCardInvalid', bookingId, e);
// 			}
// 		});
// 	} catch (e) {
// 		logger.error('markBookingsCardInvalid', e);
// 	}

// 	isMarkingCard = false;
// }

async function checkForCardUpdated() {
	if (isCheckingCard) return;

	isCheckingCard = true;

	try {
		const bookings = await models.Booking.find({
			'rateDetail.isNonRefundable': true,
			otaName: OTAs.Booking,
			paid: 0,
			'paymentCardState.status': PAYMENT_CARD_STATUS.INVALID,
			'paymentCardState.chargedStatus': {
				$in: [PAYMENT_CHARGE_STATUS.ERROR, PAYMENT_CHARGE_STATUS.NEED_TO_CHARGE],
			},
			'paymentCardState.markedInvalid': true,
		})
			.select('_id otaBookingId')
			.lean();

		const bookingIds = _.uniqBy(bookings, b => `${b.otaBookingId}`);

		await bookingIds.asyncForEach(async b => {
			try {
				const booking = await models.Booking.findById(b._id);
				const data = await checkCardUpdated(booking);

				if (data.updated) {
					await models.GuestCard.updateCardStatus(
						{
							otaName: booking.otaName,
							otaBookingId: booking.otaBookingId,
						},
						{
							'paymentCardState.markedInvalid': false,
							'paymentCardState.status': PAYMENT_CARD_STATUS.UPDATED,
							'paymentCardState.updatedAt': data.updatedAt,
							'paymentCardState.left': data.left,
						}
					);
				}
			} catch (e) {
				logger.error('checkForCardUpdated', b.otaBookingId, e);
			}
		});
	} catch (e) {
		logger.error('checkForCardUpdated', e);
	}

	isCheckingCard = false;
}

// schedule.scheduleJob('*/1 * * * *', jobGetBookingCard);
// schedule.scheduleJob('*/1 * * * *', jobChargeBookings);
// schedule.scheduleJob('*/5 * * * *', markBookingsCardInvalid);
schedule.scheduleJob('*/3 * * * *', checkForCardUpdated);

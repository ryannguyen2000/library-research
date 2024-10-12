const _ = require('lodash');
// const moment = require('moment');
const AsyncLock = require('async-lock');
// const { isMainThread } = require('worker_threads');

const ThrowReturn = require('@core/throwreturn');

const { PAYMENT_CARD_STATUS, OTAs, PAYMENT_CHARGE_STATUS } = require('@utils/const');
const { logger } = require('@utils/logger');
// const { Settings } = require('@utils/setting');
// const { eventEmitter, EVENTS } = require('@utils/events');
const BookingApi = require('@controllers/ota_api/headers/booking');
const BookingPaymentApi = require('@controllers/ota_api/payments/booking.payout');
const models = require('@models');

const { processPayment } = require('./automation');

const queueLock = new AsyncLock();

async function getBookingCard({ accountData, propertyId, otaBookingId, user }) {
	return await queueLock.acquire(`getBookingCard`, async () => {
		let currentCard = await models.GuestCard.findOne({
			otaBookingId,
			otaName: accountData.name,
			deleted: false,
		});

		const skipStatus = [PAYMENT_CARD_STATUS.VALID, PAYMENT_CARD_STATUS.UNKNOWN];

		let update = {
			$inc: {
				'paymentCardState.gettingCount': 1,
			},
		};
		let errorMsg = '';

		if (currentCard && skipStatus.includes(currentCard.cardStatus)) {
			errorMsg = 'Thông tin thẻ đã tồn tại';
			_.set(update, ['$set', 'paymentCardState.status'], currentCard.cardStatus);

			logger.warn(errorMsg, otaBookingId);
		}

		if (!errorMsg) {
			const { data } = await BookingPaymentApi.getBookingPaymentInfo({
				otaConfig: accountData,
				otaBookingId,
				propertyId,
			});

			if (!data.left.views) {
				errorMsg = 'Đã hết lượt xem thông tin thẻ';

				logger.warn(errorMsg, otaBookingId, JSON.stringify(data));

				_.set(update, ['$set', 'paymentCardState.status'], PAYMENT_CARD_STATUS.NO_INFO);
				_.set(update, ['$set', 'paymentCardState.description'], errorMsg);
			}

			if (!errorMsg) {
				if (
					currentCard &&
					data.invalidCc.marks &&
					(!data.invalidCc.updatedAt || new Date(data.invalidCc.updatedAt) < currentCard.cardUpdatedAt)
				) {
					errorMsg = 'Thông tin thẻ chưa được cập nhật';

					_.set(update, ['$set', 'paymentCardState.description'], errorMsg);
					_.unset(update, '$inc');

					logger.warn(errorMsg, otaBookingId, JSON.stringify(data));
				}

				if (!errorMsg) {
					const cardData = await BookingApi.getCardInfo({
						otaConfig: accountData,
						url: data.urls.iamLogin,
					}).catch(e => {
						logger.error('getBookingCard', otaBookingId, e);

						errorMsg = _.toString(e);
						_.set(update, ['$set', 'paymentCardState.description'], errorMsg);
					});

					if (!errorMsg && cardData) {
						const newCardInfo = models.GuestCard.encryptCardInfo(cardData.cardInfo);

						if (currentCard) {
							if (
								currentCard.cardStatus === PAYMENT_CARD_STATUS.INVALID &&
								currentCard.cardInfo === newCardInfo
							) {
								errorMsg = 'Thông tin thẻ chưa được cập nhật';

								// _.set(update, ['$set', 'paymentCardState.status'], PAYMENT_CARD_STATUS.NO_INFO);
								_.set(update, ['$set', 'paymentCardState.description'], errorMsg);
								// return currentCard;
							}

							if (!errorMsg) {
								currentCard.rawData = cardData.html;
								currentCard.cardStatus = PAYMENT_CARD_STATUS.UNKNOWN;
								if (user) currentCard.updatedBy = user._id;
								await currentCard.save();
							}

							currentCard.cardInfo = newCardInfo;

							_.set(
								update,
								['$set', 'paymentCardState.chargedStatus'],
								PAYMENT_CHARGE_STATUS.NEED_TO_CHARGE
							);
							_.set(update, ['$set', 'paymentCardState.markedInvalid'], false);
						} else {
							currentCard = await models.GuestCard.create({
								otaBookingId,
								otaName: accountData.name,
								cardInfo: newCardInfo,
								rawData: cardData.html,
								cardStatus: PAYMENT_CARD_STATUS.UNKNOWN,
								createdBy: user ? user._id : null,
							});

							_.set(
								update,
								['$set', 'paymentCardState.chargedStatus'],
								PAYMENT_CHARGE_STATUS.NEED_TO_CHARGE
							);
							_.set(update, ['$set', 'paymentCardState.markedInvalid'], false);
						}
					}
				}
			}
		}

		await models.GuestCard.updateCardStatus(
			{
				otaBookingId,
				otaName: accountData.name,
			},
			update
		);

		if (errorMsg) {
			throw new ThrowReturn(errorMsg);
		}

		return currentCard;
	});
}

async function markBookingCardInvalid({ booking, user }) {
	const { otaName, otaBookingId } = booking;

	const otaFilter = {
		active: true,
		name: otaName,
	};

	const listing = await models.Listing.findById(booking.listingId);
	const block = await models.Block.findById(listing.blockId);

	const otaListing = listing.OTAs.find(o => o.active && o.otaName === otaName);
	const otaProperty = block.OTAProperties.find(o => o.otaName === otaName);
	const propertyId = otaProperty.propertyId;

	otaFilter.account = otaListing.account;

	const accountData = await models.OTAManager.findOne(otaFilter);

	const currentCard = await models.GuestCard.findOne({
		otaBookingId,
		otaName: accountData.name,
		deleted: false,
	});
	const cardInfo = currentCard && models.GuestCard.decryptCardInfo(currentCard.cardInfo);

	const data = await BookingPaymentApi.markCardInvalid({
		otaConfig: accountData,
		otaBookingId,
		propertyId,
		cardInfo,
	}).catch(e => {
		throw new ThrowReturn(_.toString(e));
	});

	const now = new Date();

	if (currentCard) {
		currentCard.cardUpdatedAt = now;
		await currentCard.save();
	}

	await models.GuestCard.updateCardStatus(
		{
			otaBookingId,
			otaName,
		},
		{
			'paymentCardState.markedInvalid': true,
			'paymentCardState.markedBy': _.get(user, '_id'),
			'paymentCardState.markedAt': now,
		}
	);

	return data;
}

async function chargeReservation(...args) {
	return await queueLock.acquire(`chargeReservation`, async () => {
		return processPayment(...args);
	});
}

async function getCardInfo(booking, user) {
	let { otaBookingId, otaName } = booking;

	otaName = otaName || OTAs.Booking;

	const otaFilter = {
		active: true,
		name: otaName,
	};

	const listing = booking.listingId && (await models.Listing.findById(booking.listingId));
	const block = await models.Block.findById(listing ? listing.blockId : booking.blockId);

	const otaListing = listing && listing.OTAs.find(o => o.active && o.otaName === otaName);
	const otaProperty = block.OTAProperties.find(o => o.otaName === otaName);
	const propertyId = otaProperty.propertyId;

	otaFilter.account = _.get(otaListing, 'account') || otaProperty.account;

	const accountData = await models.OTAManager.findOne(otaFilter);

	return getBookingCard({ accountData, propertyId, otaBookingId, user });
}

async function checkCardUpdated(booking) {
	let { otaBookingId, otaName } = booking;

	otaName = otaName || OTAs.Booking;

	const otaFilter = {
		active: true,
		name: otaName,
	};

	const listing = booking.listingId && (await models.Listing.findById(booking.listingId));
	const block = await models.Block.findById(listing ? listing.blockId : booking.blockId);

	const otaListing = listing && listing.OTAs.find(o => o.active && o.otaName === otaName);
	const otaProperty = block.OTAProperties.find(o => o.otaName === otaName);
	const propertyId = otaProperty.propertyId;

	otaFilter.account = _.get(otaListing, 'account') || otaProperty.account;

	const accountData = await models.OTAManager.findOne(otaFilter);

	const { data } = await BookingPaymentApi.getBookingPaymentInfo({
		otaConfig: accountData,
		otaBookingId,
		propertyId,
	});

	if (!data.left.views) {
		return {
			updated: false,
			errorMsg: 'Đã hết lượt xem thông tin thẻ',
		};
	}

	const currentCard = await models.GuestCard.findOne({
		otaBookingId,
		otaName,
		deleted: false,
	});

	if (!data.invalidCc.updatedAt || (currentCard && new Date(data.invalidCc.updatedAt) < currentCard.cardUpdatedAt)) {
		return {
			updated: false,
			errorMsg: 'Thông tin thẻ chưa được cập nhật',
		};
	}

	return {
		updated: true,
		updatedAt: new Date(data.invalidCc.updatedAt),
		left: data.left,
	};
}

// async function getOTADirectUrl(booking) {
// 	let { otaBookingId, otaName } = booking;

// 	otaName = otaName || OTAs.Booking;

// 	const otaFilter = {
// 		active: true,
// 		name: otaName,
// 	};

// 	const listing = await models.Listing.findById(booking.listingId);
// 	const block = await models.Block.findById(listing.blockId);

// 	const otaListing = listing.OTAs.find(o => o.active && o.otaName === otaName);
// 	const otaProperty = block.OTAProperties.find(o => o.otaName === otaName);
// 	const propertyId = otaProperty.propertyId;

// 	otaFilter.account = otaListing.account;

// 	const otaConfig = await models.OTAManager.findOne(otaFilter);

// 	const { data } = await BookingPaymentApi.getBookingPaymentInfo({
// 		otaConfig,
// 		otaBookingId,
// 		propertyId,
// 	});

// 	const url = data.urls.iamLogin;

// 	return {
// 		url,
// 	};
// }

module.exports = {
	getCardInfo,
	chargeReservation,
	markBookingCardInvalid,
	checkCardUpdated,
	// getOTADirectUrl,
};

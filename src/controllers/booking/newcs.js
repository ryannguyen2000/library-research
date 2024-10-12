const _ = require('lodash');

// const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { newCSEventEmitter, NEWCS_EVENTS, eventEmitter, EVENTS } = require('@utils/events');
const {
	PayoutType,
	PayoutSources,
	BookingCallStatus,
	BookingGuideStatus,
	BookingGuideDoneStatus,
	BookingContactOTAStatus,
	BookingPaymentStatus,
	BookingPaymentSubStatus,
	BookingStatusKeys,
} = require('@utils/const');
const models = require('@models');

const KEYS_STATUS = _.values(BookingStatusKeys);

async function onUpdateStatus(booking, fields, update = true) {
	try {
		if (update) {
			if (
				fields.contactOTAStatus === undefined &&
				fields.guideStatus &&
				booking.contactOTAStatus === BookingContactOTAStatus.CantContactGuest
			) {
				fields.contactOTAStatus = BookingContactOTAStatus.None;
			}
			if (
				fields.callStatus === undefined &&
				booking.callStatus &&
				(fields.guideStatus === BookingGuideStatus.Responding || fields.guideStatus === BookingGuideStatus.Done)
			) {
				fields.callStatus = BookingCallStatus.None;
			}

			await models.Booking.updateMany({ otaName: booking.otaName, otaBookingId: booking.otaBookingId }, fields);
			await models.BlockInbox.updateMany(
				{ otaName: booking.otaName, otaBookingId: booking.otaBookingId },
				fields
			);
		}

		if (_.keys(fields).some(f => KEYS_STATUS.includes(f))) {
			const prevValues = {};

			_.forEach(fields, (value, key) => {
				if (!KEYS_STATUS.includes(key) || booking[key] === value) return;
				prevValues[key] = booking[key];
			});

			const items = [fields];

			if (!_.isEmpty(prevValues)) {
				items.push(prevValues);
			}

			eventEmitter.emit(
				EVENTS.BOOKING_BSTATUS_UPDATED,
				{
					bookingId: booking._id,
					otaName: booking.otaName,
					otaBookingId: booking.otaBookingId,
					blockId: booking.blockId,
				},
				items
			);
		}
	} catch (e) {
		logger.error(e);
	}
}

async function newCall(callLog) {
	try {
		await models.Booking.updateMany(
			{
				otaName: callLog.otaName,
				otaBookingId: callLog.otaBookingId,
			},
			{
				lastTimeCalled: new Date(callLog.data.start_time),
			}
		);

		const data = {};

		const booking = await models.Booking.findOne({
			otaName: callLog.otaName,
			otaBookingId: callLog.otaBookingId,
		}).select('-histories');

		if (!booking) return;

		if (!callLog.isMissCall()) {
			if (booking.isPaid) {
				data.callStatus = BookingCallStatus.None;
				if (
					!booking.guideStatus ||
					booking.guideStatus === BookingGuideStatus.CantContact ||
					booking.guideStatus === BookingGuideStatus.WaitingForResponse
				) {
					data.guideStatus = BookingGuideStatus.Done;
					data.guideDoneStatus = BookingGuideDoneStatus.Called;
				}
			} else if (
				!booking.guideStatus ||
				booking.guideStatus === BookingGuideStatus.CantContact ||
				booking.guideStatus === BookingGuideStatus.WaitingForResponse
			) {
				data.guideStatus = callLog.isCallout()
					? BookingGuideStatus.WaitingForResponse
					: BookingGuideStatus.Responding;
			}
		} else if (callLog.isCallout()) {
			if (
				booking.displayToday &&
				(booking.guideStatus === BookingGuideStatus.CantContact ||
					booking.guideStatus === BookingGuideStatus.WaitingForResponse)
			) {
				data.display = false;
				data.guideStatus = booking.guideStatus;
			}
		}

		if (!_.isEmpty(data)) {
			newCSEventEmitter.emit(NEWCS_EVENTS.UPDATE_STATUS, booking, data);
		}
	} catch (e) {
		logger.error(e);
	}
}

async function newSentMsg(msgLog) {
	try {
		await models.Booking.updateMany(
			{
				otaName: msgLog.otaName,
				otaBookingId: msgLog.otaBookingId,
			},
			{
				lastTimeSent: new Date(msgLog.time),
			}
		);
	} catch (e) {
		logger.error(e);
	}
}

async function newReceivedMsg(data, msg, read, inbox) {
	if (!inbox || !inbox.bookingId) return;

	try {
		const fields = {};

		if (
			!inbox.guideStatus ||
			inbox.guideStatus === BookingGuideStatus.CantContact ||
			inbox.guideStatus === BookingGuideStatus.WaitingForResponse
		) {
			fields.guideStatus = BookingGuideStatus.Responding;
			fields.display = true;
		}

		if (!_.isEmpty(fields)) {
			await onUpdateStatus(
				{
					_id: inbox.bookingId,
					otaName: inbox.otaName,
					otaBookingId: inbox.otaBookingId,
					blockId: inbox.blockId,
					callStatus: inbox.callStatus,
				},
				fields
			);
		}

		if (!read) {
			const prevValues = {};

			KEYS_STATUS.forEach(key => {
				if (inbox[key] !== undefined || inbox[key] !== null) {
					prevValues[key] = inbox[key];
				}
			});

			if (!_.isEmpty(prevValues)) {
				eventEmitter.emit(
					EVENTS.BOOKING_BSTATUS_UPDATED,
					{
						bookingId: inbox.bookingId,
						otaName: inbox.otaName,
						otaBookingId: inbox.otaBookingId,
						blockId: inbox.blockId,
					},
					prevValues
				);
			}
		}
	} catch (e) {
		logger.error(e);
	}
}

async function setBookingStatus(booking, body, user) {
	let {
		guideStatus,
		guideDoneStatus,
		callStatus,
		ignoreGuide,
		paymentStatus,
		paymentSubStatus,
		paymentCollectType,
		paymentDone,
		problemStatus,
		contactOTAStatus,
	} = body;

	const fields = {};

	if (!_.isNil(problemStatus)) fields.problemStatus = problemStatus;

	if (_.isBoolean(ignoreGuide)) {
		fields.ignoreGuide = ignoreGuide;
		if (guideStatus === undefined) {
			guideStatus = ignoreGuide ? BookingGuideStatus.Done : BookingGuideStatus.CantContact;
		}
	}

	if (_.isNumber(guideStatus)) {
		fields.guideStatus = guideStatus;
		fields.ignoreGuide = guideStatus === BookingGuideStatus.Done;

		if (fields.ignoreGuide && guideDoneStatus === undefined) {
			guideDoneStatus = BookingGuideDoneStatus.ByUser;
		}

		if (guideStatus !== BookingGuideStatus.CantContact) {
			contactOTAStatus = BookingContactOTAStatus.None;
		}

		if (fields.ignoreGuide) {
			_.assign(fields, {
				guideDoneStatus,
				guideDoneBy: user._id,
				display: true,
			});
			if (guideDoneStatus === BookingGuideDoneStatus.PayAtProperty) {
				fields.paymentStatus = BookingPaymentStatus.PayAtProperty;
				if (booking.checkin) {
					fields.paymentSubStatus = BookingPaymentSubStatus.CheckedInAndNoPayment;
				} else {
					fields.paymentSubStatus = BookingPaymentSubStatus.Collecting;
				}
			}
			if (guideDoneStatus === BookingGuideDoneStatus.PayAtHotel) {
				fields.paymentStatus = BookingPaymentStatus.PayAtHotel;
			}
		} else {
			_.assign(fields, {
				callStatus: BookingCallStatus.NeedCall,
				display: true,
			});
		}
	}

	if (_.isNumber(callStatus)) {
		fields.callStatus = callStatus;
		if (callStatus) {
			fields.contactOTAStatus = BookingContactOTAStatus.None;
		}
	}

	if (_.isNumber(contactOTAStatus)) {
		fields.contactOTAStatus = contactOTAStatus;
		if (contactOTAStatus === BookingContactOTAStatus.CantContactGuest) {
			fields.callStatus = BookingCallStatus.None;
		}
	}

	if (_.isNumber(paymentStatus)) {
		fields.paymentStatus = paymentStatus;
	}
	if (_.isNumber(paymentSubStatus)) {
		fields.paymentSubStatus = paymentSubStatus;
	}
	if (_.isNumber(paymentCollectType)) {
		fields.paymentCollectType = paymentCollectType;
	}
	if (_.isBoolean(paymentDone)) {
		fields.paymentDone = paymentDone;
		fields.ignorePrice = paymentDone;
		if (paymentDone) {
			fields.paymentDoneBy = user._id;
		}
	}

	if (!_.isEmpty(fields)) {
		await onUpdateStatus(booking, fields);
	}

	return fields;
}

function getPaymentStatus(payout) {
	if (payout.source === PayoutSources.BANKING || payout.source === PayoutSources.PERSONAL_BANKING) {
		return BookingPaymentStatus.Banking;
	}
	if (payout.source === PayoutSources.ONLINE_WALLET || payout.source === PayoutSources.THIRD_PARTY) {
		return BookingPaymentStatus.Auto;
	}
}

async function onUpdatedPaymentStatus(bookings, isPaid, payouts) {
	try {
		const csStatus = {
			isPaid,
			paymentDone: isPaid,
			ignorePrice: isPaid,
		};
		if (isPaid) {
			const payout = _.find(payouts, p => p.payoutType === PayoutType.RESERVATION);
			if (payout) {
				const paymentStatus = getPaymentStatus(payouts);
				if (paymentStatus) {
					csStatus.paymentStatus = paymentStatus;
				}
			} else {
				csStatus.paymentStatus = BookingPaymentStatus.Auto;
			}
		} else {
			csStatus.paymentStatus = BookingPaymentStatus.NoInfo;
		}

		await onUpdateStatus(bookings[0], csStatus);
	} catch (e) {
		logger.error(e);
	}
}

async function onCheckin(booking, guest, user) {
	if (booking.guideStatus !== BookingGuideStatus.Done) {
		const data = {
			guideStatus: BookingGuideStatus.Done,
			ignoreGuide: true,
		};
		if (user) {
			data.guideDoneStatus = BookingGuideDoneStatus.ByUser;
			data.guideDoneBy = user._id;
		} else {
			data.guideDoneStatus = BookingGuideDoneStatus.Sent;
		}
		await onUpdateStatus(booking, data);
	} else if (booking.guideDoneStatus === BookingGuideDoneStatus.CantContact) {
		await onUpdateStatus(
			booking,
			_.pickBy({
				guideDoneStatus: user ? BookingGuideDoneStatus.ByUser : BookingGuideDoneStatus.Sent,
				guideDoneBy: user && user._id,
			})
		);
	}
}

newCSEventEmitter.on(NEWCS_EVENTS.UPDATE_STATUS, onUpdateStatus);
newCSEventEmitter.on(NEWCS_EVENTS.NEW_CALL, newCall);
newCSEventEmitter.on(NEWCS_EVENTS.NEW_MSG, newSentMsg);

eventEmitter.on(EVENTS.MESSAGE_RECEIVE, newReceivedMsg);
eventEmitter.on(EVENTS.UPDATE_PAYMENT_STATUS, onUpdatedPaymentStatus);
eventEmitter.on(EVENTS.RESERVATION_CHECKIN, onCheckin);

module.exports = {
	setBookingStatus,
};

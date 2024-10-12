const schedule = require('node-schedule');
const _ = require('lodash');
const moment = require('moment');
const { logger } = require('@utils/logger');
const models = require('@models');
const { BookingStatus, CanceledByType } = require('@utils/const');
const { Settings } = require('@utils/setting');
const { cancelReservation } = require('@controllers/booking/reservation');

const DELAY_MINUTE = 5;

function checkTimeout({ createdAt, from }) {
	const diff = moment(createdAt).isSameOrAfter(from, 'day')
		? Settings.ShortPaymentExpirationTime.value
		: Settings.LongPaymentExpirationTime.value;

	const expiration = moment(createdAt).add(diff, 'minute');

	return moment().isSameOrAfter(expiration, 'minute');
}

async function cancelBookingTimeout() {
	try {
		const maxCD = parseInt(
			_.max([Settings.LongPaymentExpirationTime.value, Settings.ShortPaymentExpirationTime.value])
		);
		const minCD = parseInt(
			_.min([Settings.LongPaymentExpirationTime.value, Settings.ShortPaymentExpirationTime.value])
		);

		if (!maxCD && !minCD) return;

		const roundedMinute = DELAY_MINUTE * 2;

		const bookings = await models.Booking.find({
			createdAt: {
				$gte: moment()
					.subtract(maxCD + roundedMinute, 'minute')
					.toDate(),
				$lte: moment()
					.subtract(minCD - roundedMinute, 'minute')
					.toDate(),
			},
			status: BookingStatus.CONFIRMED,
			paid: 0,
			'rateDetail.isNonRefundable': true,
			'paymentCardState.autoCancel': true,
		})
			.select('_id createdAt from')
			.lean();

		await bookings.filter(checkTimeout).asyncForEach(({ _id }) =>
			cancelReservation({
				reservation: { bookingId: _id },
				canceledBy: { type: CanceledByType.SYSTEM, reason: 'Payment timeout' },
			}).catch(e => {
				logger.error(e);
			})
		);
	} catch (e) {
		logger.error('cancelBookingTimeout.job', e);
	}
}

schedule.scheduleJob(`*/${DELAY_MINUTE} * * * *`, cancelBookingTimeout);

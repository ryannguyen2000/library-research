const _ = require('lodash');

const { eventEmitter, EVENTS } = require('@utils/events');
const {
	OTTs,
	MessageAutoType,
	MessageGroupEvent,
	MessageVariable,
	Currency,
	RateType,
	MessageGroupType,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const messageOTT = require('@controllers/message/ott');

function formatPrice(price, currency = Currency.VND) {
	price = Number(price) || 0;
	return `${price.toLocaleString()}${currency === Currency.VND ? '' : ` ${currency}`}`;
}

async function sendAutoMessages(event, booking, guest, payment) {
	try {
		const groups = await models.Messages.find({
			isGroup: true,
			blockId: booking.blockId,
			groupType: MessageGroupType.HOST,
			autoMessages: event,
		}).populate('guestId');
		if (!groups.length) return;

		const template = await models.ChatAutomatic.findOne({
			event,
			autoType: MessageAutoType.HOST_GROUP,
			groupIds: booking.groupIds[0],
		});
		if (!template) return;

		const messages = await template.contents.asyncMap(async content => {
			let rs = content.content;

			if (rs.includes(MessageVariable.GUEST.text)) {
				rs = rs.replaceAll(MessageVariable.GUEST.text, guest.fullName);
			}
			if (rs.includes(MessageVariable.BOOKING_CODE.text)) {
				rs = rs.replaceAll(MessageVariable.BOOKING_CODE.text, booking.otaBookingId);
			}
			if (rs.includes(MessageVariable.OTA.text)) {
				const source = await models.BookingSource.findOne({ name: booking.otaName });
				rs = rs.replaceAll(MessageVariable.OTA.text, source ? source.label : booking.otaName);
			}
			if (rs.includes(MessageVariable.ROOM.text)) {
				let rooms = await models.Reservation.getReservatedRoomsDetails(booking._id);
				if (!rooms.length && booking.reservateRooms.length) {
					rooms = await models.Room.find({ _id: booking.reservateRooms }).select('info');
				}
				rs = rs.replaceAll(MessageVariable.ROOM.text, _.map(rooms, 'info.roomNo').join(', '));
			}
			if (rs.includes(MessageVariable.BOOKING_PRICE.text)) {
				rs = rs.replaceAll(MessageVariable.BOOKING_PRICE.text, formatPrice(booking.price, booking.currency));
			}
			if (rs.includes(MessageVariable.BOOKING_PAYMENT_STATUS.text)) {
				rs = rs.replaceAll(
					MessageVariable.BOOKING_PAYMENT_STATUS.text,
					booking.rateType === RateType.PAY_NOW ? 'Đã thanh toán' : 'Chưa thanh toán'
				);
			}
			if (rs.includes(MessageVariable.PAYMENT_AMOUNT.text)) {
				rs = rs.replaceAll(
					MessageVariable.PAYMENT_AMOUNT.text,
					formatPrice(payment.currencyAmount.exchangedAmount)
				);
			}

			return rs;
		});

		await groups.asyncMap(group => {
			return messages.asyncMap(message => {
				return messageOTT.sendOTTMessage({
					ottName: OTTs.Zalo,
					phone: group.guestId.ottIds[OTTs.Zalo],
					text: message,
					messageId: group._id,
					groupId: booking.groupIds,
					blockId: booking.blockId,
				});
			});
		});
	} catch (err) {
		logger.error('Auto group message error', booking._id, event, err);
	}
}

function onReservation(booking, guest) {
	sendAutoMessages(MessageGroupEvent.CONFIRMED, booking, guest);
}

function onCancelReservation(booking, guest) {
	sendAutoMessages(MessageGroupEvent.CANCELED, booking, guest);
}

function onNoshow(booking, guest) {
	sendAutoMessages(MessageGroupEvent.NOSHOW, booking, guest);
}

function onCheckin(booking, guests) {
	guests.forEach(guest => sendAutoMessages(MessageGroupEvent.CHECK_IN, booking, guest));
}

function onCheckout(booking, guests) {
	guests.forEach(guest => sendAutoMessages(MessageGroupEvent.CHECK_OUT, booking, guest));
}

async function onCreatePayout(payout) {
	if (!payout.createdBy || !payout.bookingId) return;

	const booking = await models.Booking.findById(payout.bookingId).populate('guestId');
	if (!booking) return;

	sendAutoMessages(MessageGroupEvent.PAYMENT, booking, booking.guestId, payout);
}

eventEmitter.on(EVENTS.RESERVATION, onReservation);
eventEmitter.on(EVENTS.RESERVATION_CANCEL, onCancelReservation);
eventEmitter.on(EVENTS.RESERVATION_NOSHOW, onNoshow);
eventEmitter.on(EVENTS.RESERVATION_CHECKIN, onCheckin);
eventEmitter.on(EVENTS.RESERVATION_CHECKOUT, onCheckout);
eventEmitter.on(EVENTS.CREATE_PAYOUT, onCreatePayout);

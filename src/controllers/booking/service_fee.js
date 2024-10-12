const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');

const {
	MessageAutoType,
	BookingLogs,
	ServiceFeeLogs,
	MessageVariable,
	OTTs,
	Currency,
	SERVICE_FEE_TYPES,
	AutoEvents,
} = require('@utils/const');
const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const messageOTT = require('@controllers/message/ott');
const { logger } = require('@utils/logger');
const { formatPrice } = require('@utils/price');

const ACTION = {
	laundryFee: BookingLogs.FEE_LAUNDRY,
	carFee: BookingLogs.FEE_CAR,
	motobikeFee: BookingLogs.FEE_MOTOBIKE,
	compensation: BookingLogs.FEE_COMPENSATION,
	drinkWaterFee: BookingLogs.FEE_DRINK_WATER,
};

function getUnitAndServiceTypeQuery(serviceType) {
	let unit = '';
	let serviceTypeQuery;

	if (_.includes([SERVICE_FEE_TYPES.CAR_FEE, SERVICE_FEE_TYPES.MOTOBIKE_FEE], serviceType)) {
		unit = 'night';
		serviceTypeQuery = { $in: [SERVICE_FEE_TYPES.CAR_FEE, SERVICE_FEE_TYPES.MOTOBIKE_FEE] };
	} else {
		serviceTypeQuery = serviceType;
	}
	if (serviceType === SERVICE_FEE_TYPES.LAUNDRY_FEE) unit = 'kg';
	if (serviceType === SERVICE_FEE_TYPES.DRINK_WATER_FEE) unit = 'bottle';

	return { unit, serviceTypeQuery };
}

async function getBookingAndReservation({ bookingId, roomId }) {
	const [booking, reservation] = await Promise.all([
		models.Booking.findById(bookingId),
		models.Reservation.findOne({ bookingId, roomId }),
	]);
	if (!booking) throw new ThrowReturn('Booking does not exist');
	if (!reservation) throw new ThrowReturn('Reseveration does not exist');
	return { booking, reservation };
}

async function updateBookingPrice({ booking, reservation, serviceFee, user }) {
	const { serviceType, roomId } = serviceFee;
	const [sfAmount, sfCRoomIdAmount] = await Promise.all([
		models.ServiceFee.amount({ bookingId: booking.id, serviceType }),
		models.ServiceFee.amount({ bookingId: booking.id, roomId, serviceType }),
	]);

	const prevData = booking[serviceType];
	booking[serviceType] = sfAmount;
	reservation[serviceType] = sfCRoomIdAmount;

	await reservation.save();
	await booking.save();

	models.Booking.addLog({
		bookingId: booking._id,
		userId: user._id,
		action: _.get(ACTION, serviceFee.serviceType),
		prevData,
		data: sfAmount,
	});
}

async function sendAutoMessages(booking, serviceFee, phone) {
	try {
		const images = [];
		if (!_.isEmpty(serviceFee.messages)) {
			_.forEach(serviceFee.messages, msg => {
				if (!_.isEmpty(msg.images)) {
					_.forEach(msg.images, img => images.push({ url: img }));
				}
			});
		}

		const template = await models.ChatAutomatic.findOne({
			event: AutoEvents.Payment,
			groupIds: booking.groupIds[0],
			autoType: MessageAutoType.GUEST,
			template: serviceFee.serviceType,
		});

		if (!template) throw new ThrowReturn().status(404);

		const messages = template.contents.map(content => {
			let rs = content.content;
			// Date
			const createdAt = moment(serviceFee.createdAt).format('DD/MM/YYYY');
			if (rs.includes(MessageVariable.DATE.text)) {
				rs = rs.replaceAll(MessageVariable.DATE.text, createdAt);
			}
			// Quantity
			if (rs.includes(MessageVariable.QUANTITY.text)) {
				rs = rs.replaceAll(MessageVariable.QUANTITY.text, serviceFee.quantity);
			}
			// Payment amount
			if (rs.includes(MessageVariable.FEE_AMOUNT.text)) {
				rs = rs.replaceAll(
					MessageVariable.FEE_AMOUNT.text,
					formatPrice({ price: serviceFee.amount, currency: Currency.VND })
				);
			}
			return rs;
		});
		const ottMessages = [];
		await messages.asyncForEach(async msg => {
			const { message } = await messageOTT.sendOTTMessage({
				ottName: OTTs.Zalo,
				phone,
				text: msg,
				messageId: booking.messages,
				groupId: booking.groupIds,
				blockId: booking.blockId,
			});
			const _ottMsg = {
				ottName: OTTs.Zalo,
				ottPhone: phone,
				messageId: message.messageId,
				serviceFeeId: serviceFee._id,
				bookingId: serviceFee.bookingId,
				type: [serviceFee.serviceType],
			};
			ottMessages.push(_ottMsg);
		});

		if (!_.isEmpty(images)) {
			const { message } = await messageOTT.sendOTTMessage({
				ottName: OTTs.Zalo,
				phone,
				attachments: images,
				messageId: booking.messages,
				groupId: booking.groupIds,
				blockId: booking.blockId,
			});
			ottMessages.push({
				ottName: OTTs.Zalo,
				ottPhone: phone,
				messageId: message.messageId,
				serviceFeeId: serviceFee._id,
				bookingId: serviceFee.bookingId,
				type: [serviceFee.serviceType],
			});
		}

		await models.FeeAutoMessage.insertMany(ottMessages);
	} catch (err) {
		logger.error('Auto service fee message error: ', err);
	}
}

async function getServiceFee(serviceFeeId) {
	if (!mongoose.Types.ObjectId.isValid(serviceFeeId)) {
		throw new ThrowReturn('Invalid serviceFeeId');
	}
	const serviceFee = await models.ServiceFee.findById(serviceFeeId).lean();
	if (!serviceFee) throw new ThrowReturn().status(404);
	return serviceFee;
}

async function getServiceFeesByBookingId(bookingId, includeDeleted) {
	if (!mongoose.Types.ObjectId.isValid(bookingId)) {
		throw new ThrowReturn('BookingId invalid');
	}
	const grByTypeServiceFees = await models.ServiceFee.getServiceFeesByBookingId(bookingId, includeDeleted);
	return grByTypeServiceFees;
}

async function createServiceFee(user, data) {
	const { blockId, serviceType, quantity, unitPrice, amount, note, isSendMsg = false, messages, bookingId } = data;
	const today = new Date().zeroHours();
	const bookingQuery = bookingId
		? { _id: bookingId }
		: {
				blockId,
				reservateRooms: [data.roomId],
				$and: [{ from: { $lte: today } }, { to: { $gt: today } }],
		  };
	const booking = await models.Booking.findOne(bookingQuery).populate('guestId', 'phone ottIds');
	if (!booking) throw new ThrowReturn('Booking does not exist');

	const prevData = booking.serviceType;
	const roomId = data.roomId || _.get(booking, 'reservateRooms[0]');
	const reservation = await models.Reservation.findOne({ bookingId: booking.id, roomId });

	if (!reservation) throw new ThrowReturn('Reservation does not exist');

	const { unit, serviceTypeQuery } = getUnitAndServiceTypeQuery(serviceType);

	if (!_.isEmpty(messages)) {
		const serviceFeeQuery = {
			messages: { $elemMatch: { messageId: { $in: _.map(messages, 'messageId') } } },
			deleted: false,
			bookingId: booking._id,
			blockId,
			roomId,
			serviceType: serviceTypeQuery,
		};
		const exist = await models.ServiceFee.findOne(serviceFeeQuery).lean();
		if (exist) throw new ThrowReturn('Service fee exist!');
	}

	const phone = _.get(booking, `guestId.ottIds.${OTTs.Zalo}`) || _.get(booking, `guestId.phone`);
	if (!phone && isSendMsg) {
		throw new ThrowReturn(`Guest's phone do not exist!`);
	}

	const serviceFee = await models.ServiceFee.create({
		bookingId: booking._id,
		roomId,
		blockId,
		serviceType,
		unitPrice,
		quantity,
		amount,
		isSendMsg,
		note,
		messages,
		createdBy: user._id,
		unit,
	});

	const [sfAmount, sfCRoomIdAmount] = await Promise.all([
		models.ServiceFee.amount({ bookingId: booking.id, serviceType }),
		models.ServiceFee.amount({ bookingId: booking.id, serviceType, roomId }),
	]);

	if (isSendMsg) {
		try {
			sendAutoMessages(booking, serviceFee, phone);
		} catch (err) {
			logger.error(err);
		}
	}

	if (_.includes(_.values(SERVICE_FEE_TYPES), serviceType)) {
		reservation[serviceType] = sfCRoomIdAmount;
		booking[serviceType] = sfAmount;
	}

	await reservation.save();
	await booking.save();

	models.Booking.addLog({
		bookingId: booking._id,
		userId: user._id,
		action: _.get(ACTION, serviceType),
		prevData,
		data: sfAmount,
	});
	models.ServiceFee.addLog({
		serviceFeeId: serviceFee._id,
		userId: user._id,
		action: ServiceFeeLogs.CREATE,
	});

	return { serviceFee };
}

async function updateServiceFee(user, serviceFeeId, data) {
	if (!mongoose.Types.ObjectId.isValid(serviceFeeId)) throw new ThrowReturn('Invalid serviceFeeId');

	const serviceFee = await models.ServiceFee.findById(serviceFeeId);
	if (!serviceFee) throw new ThrowReturn('Service fee does not exist');
	if (serviceFee.deleted) throw new ThrowReturn('Service fee was deleted');

	const { booking, reservation } = await getBookingAndReservation({
		bookingId: serviceFee.bookingId,
		roomId: serviceFee.roomId,
	});
	const rs = await serviceFee.updateProperties(data, user._id);
	await updateBookingPrice({ booking, reservation, serviceFee: rs, user });
	return rs;
}

async function deleteServiceFee(user, serviceFeeId) {
	if (!mongoose.Types.ObjectId.isValid(serviceFeeId)) {
		throw new ThrowReturn('Invalid serviceFeeId');
	}
	const serviceFee = await models.ServiceFee.findById(serviceFeeId);

	if (!serviceFee) throw new ThrowReturn('Service fee does not exist');
	if (serviceFee.deleted) throw new ThrowReturn('Service fee was deleted');

	serviceFee.$locals.userId = user._id;
	serviceFee.$locals.action = ServiceFeeLogs.DELETE;
	serviceFee.deleted = true;

	const { booking, reservation } = await getBookingAndReservation({
		bookingId: serviceFee.bookingId,
		roomId: serviceFee.roomId,
	});

	await serviceFee.save();
	await updateBookingPrice({ booking, reservation, serviceFee, user });

	return {
		serviceFee,
		booking,
	};
}

module.exports = {
	createServiceFee,
	updateServiceFee,
	deleteServiceFee,
	sendAutoMessages,
	getServiceFeesByBookingId,
	getServiceFee,
};

const moment = require('moment');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { Services, RuleDay } = require('@utils/const');
// const { logger } = require('@utils/logger');
const models = require('@models');
const BookingAction = require('@controllers/booking/action');

function getEdate({ serviceType, to, toHour = RuleDay.to }) {
	let time;

	if (serviceType === Services.Hour) {
		time = moment(toHour, 'HH:mm');
	} else {
		const [hour, minute] = toHour.split(':');
		time = moment(to)
			.hours(+hour)
			.minutes(+minute);
	}

	return time.add(1, 'hour').format('YYMMDDHHmm');
}

async function getCardInfo({ booking, roomId }) {
	const block = await models.Block.findById(booking.blockId);
	const hotelId = _.get(block, 'locker.hotelId', '01');
	const coid = _.get(block, 'locker.coid');
	const forceCheckin = _.get(block, 'locker.forceCheckin');

	const room = await models.Room.findById(roomId);

	const cardInfo = {
		lockno: `${hotelId}0${room.info.roomNo.replace(/\D/g, '')}`,
		edate: getEdate(booking),
		coid,
	};

	return { cardInfo, forceCheckin };
}

async function writeCardInfo({ booking, roomId, cardInfo, autoCheck }, user) {
	if (!cardInfo || !cardInfo.lockno) {
		throw new ThrowReturn('Không tìm thấy thông tin thẻ!');
	}

	const reservation = await models.Reservation.findOne({
		bookingId: booking._id,
		roomId,
	});
	if (!reservation) {
		throw new ThrowReturn('Không tìm thấy thông tin đặt phòng!');
	}

	if (autoCheck) {
		const notCheckedIn = reservation.guests.filter(g => !g.checkin);
		if (notCheckedIn.length) {
			await BookingAction.checkin({
				booking,
				guestIds: _.map(notCheckedIn, 'guestId'),
				user,
				roomId: reservation.roomId,
				cardInfo,
			});
		} else {
			throw new ThrowReturn('Tất cả khách đã check-in!');
		}
	} else {
		reservation.card.push({
			...cardInfo,
			guestIds: _.map(reservation.guests, 'guestId'),
			createdBy: user._id,
			createdAt: new Date(),
		});
		await reservation.save();
	}

	// throw new ThrowReturn('Tất cả khách đã check-in!');
}

async function deleteCardInfo({ booking, cardInfo, autoCheck }, user) {
	if (!autoCheck) return;

	if (!cardInfo || !cardInfo.lockno) {
		throw new ThrowReturn('Không tìm thấy thông tin thẻ!');
	}

	// const reservation = await models.Reservation.findOne({
	// 	bookingId: booking._id,
	// 	card: {
	// 		$elemMatch: {
	// 			lockno: cardInfo.lockno,
	// 			cardno: cardInfo.cardno,
	// 		},
	// 	},
	// });
	// if (!reservation) {
	// 	throw new ThrowReturn('Không tìm thấy thông tin thẻ trong đặt phòng!');
	// }

	await BookingAction.checkout({ booking, user, cardInfo });

	// const notCheckedIn = reservation.guests.filter(g => !g.checkout);
	// if (notCheckedIn.length) {
	// 	await notCheckedIn.asyncForEach(g => BookingAction.checkout({ booking, guestId: g.guestId, user, cardInfo }));
	// }
}

module.exports = {
	getCardInfo,
	writeCardInfo,
	deleteCardInfo,
};

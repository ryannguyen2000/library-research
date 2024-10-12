const schedule = require('node-schedule');
const moment = require('moment');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { RuleDay, BookingCheckinType, DOOR_LOCK_TYPE } = require('@utils/const');
// const { eventEmitter, EVENTS } = require('@utils/events');

const models = require('@models');
const { activeCodeBookings } = require('@controllers/lock');
const { fetchAccessLogs } = require('@controllers/lock/webpass');
const BookingAction = require('@controllers/booking/action');

async function getDoorLockLogs() {
	const bulks = [];
	const autos = [];

	const locks = await models.BlockLock.find({
		lockType: DOOR_LOCK_TYPE.WEBPASS,
		active: true,
	});

	await locks.asyncMap(async lock => {
		const logs = await fetchAccessLogs(lock)
			.then(a => {
				if (lock.error) {
					lock.error = false;
					lock.save();
				}
				return a;
			})
			.catch(() => {
				if (!lock.error) {
					lock.error = true;
					lock.save();
				}
				return [];
			});

		if (!logs.length) return;

		return logs.asyncMap(async log => {
			const hasExist = await models.DoorAccessLog.findOne({ blockId: lock.blockId, ...log }).select('_id');
			if (hasExist) return;

			const room = await models.Room.findOne({
				blockId: lock.blockId,
				lock: {
					$elemMatch: {
						lockId: lock._id,
						userID: log.userId,
					},
				},
			}).select('_id lock');

			log.blockId = lock.blockId;
			log.roomId = room && room._id;

			if (log.roomId) {
				const booking = await findBookingIdByLog(
					log,
					room.lock.find(l => l.userID === log.userId && lock._id.equals(l.lockId))
				);
				if (booking) {
					log.bookingId = booking.bookingId;
					log.checkin = booking.checkin;

					if (booking.autoCheckin && !lock.ignoreCheckin) {
						autos.push(log);
					}
				}
			}

			log.lockType = DOOR_LOCK_TYPE.WEBPASS;
			bulks.push(log);
		});
	});

	if (bulks.length) {
		await models.DoorAccessLog.insertMany(bulks);
	}

	if (autos.length) {
		await autos.asyncForEach(log => autoCheckIn(log));
	}
}

async function autoCheckIn({ bookingId, roomId, type }) {
	const booking = await models.Booking.findById(bookingId);

	if (!booking || (booking.disabledAutoCheckin && type === 'P')) return;

	await [booking.guestId, ...booking.guestIds].asyncForEach(guestId =>
		BookingAction.checkin({ booking, guestId, checkinType: BookingCheckinType.P, roomId }).catch(e => {
			logger.error(e);
		})
	);
}

async function findBookingIdByLog(log, lock) {
	const accessDate = new Date(log.time).zeroHours();
	const prevDate = moment(accessDate).add(-1, 'day').toDate();

	const reservations = await models.Reservation.find({
		blockId: log.blockId,
		roomId: log.roomId,
		'dates.date': { $in: [prevDate, accessDate] },
	})
		.sort({ 'dates.date': -1 })
		.select('guests bookingId')
		.populate('bookingId', 'doorCode');

	if (reservations.length === 0) return;

	let reservation = reservations.find(r => r.bookingId.doorCode === lock.code);
	if (!reservation) {
		const accessTime = moment(log.time).format('HH:mm');
		if (
			_.last(reservations).getCheck('out') ||
			_.first(reservations).getCheck('in') ||
			(accessTime > RuleDay.to && log.type === 'P') ||
			(accessTime > RuleDay.from && log.type === 'C')
		) {
			reservation = _.first(reservations);
		} else {
			reservation = _.last(reservations);
		}
	}

	const rs = {
		bookingId: reservation.bookingId._id,
		checkin: !!reservation.getCheck('in'),
	};

	if (!rs.checkin) {
		if (log.type === 'P' || reservations.length === 1) {
			rs.autoCheckin = true;
		} else if (log.type === 'C' && _.last(reservations).getCheck('out')) {
			rs.autoCheckin = true;
		}
	}

	return rs;
}

schedule.scheduleJob('*/4 * * * *', () => {
	getDoorLockLogs().catch(e => {
		logger.error('getDoorLockLogs', e);
	});
});

schedule.scheduleJob('*/5 * * * *', () => {
	activeCodeBookings().catch(e => {
		logger.error('activeCodeBookings', e);
	});
});

const moment = require('moment');
const mongoose = require('mongoose');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const {
	ONE_DAY,
	ONE_MINUTE,
	BookingStatus,
	DOOR_LOCK_CODE_TYPE,
	DOOR_LOCK_TYPE,
	DOOR_LOCK_POS_TYPE,
} = require('@utils/const');
const { Settings } = require('@utils/setting');
const { logger } = require('@utils/logger');
const { getTimeInOut } = require('@utils/date');
const models = require('@models');
const { generateCode, activeCodeBookings } = require('@controllers/lock');
const { doIf } = require('@utils/func');

async function getTuyaCode({ blockLock, lock, bookingCode, booking }) {
	return lock.code;
	// const resetCodeDisable = blockLock.error || !(await blockLock.checkBeAbleToResetCode(lock.passId, booking.from));
	// if (resetCodeDisable && lock.code) return lock.code;
	// if (blockLock.isCodeValid(bookingCode)) return bookingCode;
	// return generateCode(blockLock);
}

function getWebpassCode({ blockLock, lock, bookingCode }) {
	if (blockLock.error && lock.code) return lock.code;
	if (blockLock.isCodeValid(bookingCode)) return bookingCode;
	return generateCode(blockLock);
}

function isTuyaLock({ blockLock }) {
	const rs = _.get(blockLock, 'lockType') === DOOR_LOCK_TYPE.TUYA;
	return rs;
}

async function getLockCodes({ blockLocksGrBy, locks, booking, room, bookingCodes }) {
	const getCode = doIf(isTuyaLock, getTuyaCode, getWebpassCode);

	const codes = await locks.asyncMap((lock, index) => {
		const blockLock = blockLocksGrBy[lock.lockId];
		const bookingCode = bookingCodes[index];
		return getCode({ blockLock, lock, bookingCode, booking, room });
	});

	return codes;
}

async function getDoorCode(isExistTuyaGateLock, booking, room) {
	if (!isExistTuyaGateLock) return booking.doorCode;
	const reservation =
		(await models.Reservation.findOne({ bookingId: booking._id, roomId: room._id }).select('doorCode').lean()) ||
		{};
	return reservation.doorCode;
}

async function setBookingDoorCode(booking, room) {
	const locks = _.compact(room.lock);
	if (!locks.length) return;

	const configDocs = await models.BlockLock.find({ _id: { $in: _.map(locks, 'lockId') }, active: true });
	const configs = _.keyBy(configDocs, '_id');

	const filteredLocks = locks.filter(l => configs[l.lockId]);
	if (!filteredLocks.length) return;

	const isExistTuyaGateLock = !!filteredLocks.find(l => {
		const { posType, lockType } = configs[l.lockId];
		const isGateLock = posType === DOOR_LOCK_POS_TYPE.GATE;
		const isTuya = lockType === DOOR_LOCK_TYPE.TUYA;
		return isGateLock && isTuya;
	});

	const doorCode = await getDoorCode(isExistTuyaGateLock, booking, room);
	const bookingCodes = doorCode ? _.split(doorCode, '_') : [];
	const codes = await getLockCodes({ blockLocksGrBy: configs, locks: filteredLocks, booking, bookingCodes });
	const newCode = codes.join('_');

	if (doorCode !== newCode) {
		await Promise.all([
			models.Booking.updateOne({ _id: booking._id }, { doorCode: newCode }),
			models.Reservation.updateOne({ bookingId: booking._id, roomId: room._id }, { doorCode: newCode }),
		]);
	} else if (!isExistTuyaGateLock) {
		await models.Reservation.updateOne({ bookingId: booking._id, roomId: room._id }, { doorCode: newCode });
	}

	activeCodeBookings({ _id: booking._id }).catch(e => {
		logger.error(e);
	});

	// is OTP
	if (
		filteredLocks.some(l => l.type === DOOR_LOCK_CODE_TYPE.OTP) &&
		booking.checkin &&
		booking.checkin < Date.now() - Settings.TimeoutForResetPasscode.value * ONE_MINUTE
	) {
		return {
			code: filteredLocks[0].type === DOOR_LOCK_CODE_TYPE.OTP ? 'CODE_EXPIRED' : codes[0],
			codes: codes.map((c, i) =>
				filteredLocks[i].type === DOOR_LOCK_CODE_TYPE.OTP
					? `<span style="color: red;">CODE_EXPIRED</span>`
					: `<b>${c}</b>`
			),
		};
	}

	return {
		code: codes[0],
		codes: codes.map(code => `<b>${code}</b>`),
	};
}

async function getBookingGuide(booking, roomId) {
	const data = { guide: [], newGuide: [], room: {} };
	const rooms = await models.Reservation.getReservateRooms(booking.blockId, booking._id);

	let _id = roomId;
	if (roomId) {
		if (!rooms.some(r => r.toString() === roomId.toString())) {
			[_id] = rooms;
		}
	} else {
		_id = { $in: rooms };
	}

	const room = await models.Room.findOne({ _id, 'newGuide.0': { $exists: true } });
	if (!room) return data;

	data.room = room.info;
	data.room._id = room._id;
	const rsCode = await setBookingDoorCode(booking, room);
	data.code = _.get(rsCode, 'code');

	if (room.newGuide && room.newGuide.length) {
		data.payment = await models.Booking.getPayment(booking);
		data.otaBookingId = booking.otaBookingId;
		data.otaName = booking.otaName;
		delete data.payment.bookings;

		room.newGuide.forEach(guide => {
			if (!data.payment.amount && guide.name === 'payment') return;

			guide = guide.toJSON();

			if (rsCode && rsCode.codes) {
				_.forEach(rsCode.codes, (code, i) => {
					guide.vi = _.map(
						guide.vi,
						t => typeof t === 'string' && t.replaceAll(`{{lock_code_${i + 1}}}`, code)
					);
					guide.en = _.map(
						guide.en,
						t => typeof t === 'string' && t.replaceAll(`{{lock_code_${i + 1}}}`, code)
					);
				});
			}

			data.newGuide.push(guide);
		});
	}

	return data;
}

async function getPublicGuide(bookingId, roomId) {
	if (!mongoose.Types.ObjectId.isValid(bookingId)) {
		throw new ThrowReturn('Link not exist!');
	}

	const booking = await models.Booking.findOne({ _id: bookingId, status: BookingStatus.CONFIRMED })
		.select('-histories')
		.populate('listingId', 'name')
		.populate('blockId', 'info isSelfCheckin manageFee.hasVAT')
		.populate('guestId', '_id fullName name displayName passport phone');

	const now = new Date();

	if (!booking || booking.checkout || now.getTime() - booking.to.getTime() > ONE_DAY) {
		throw new ThrowReturn('Link not exist!');
	}

	const time = moment(now).format('HH:mm');
	const isInTime = time >= Settings.DayStartTime.value && time <= Settings.DayEndTime.value;
	const isSelfCheckin = !!_.get(booking.blockId, 'isSelfCheckin');
	const checkPassport = isSelfCheckin
		? isInTime && !booking.ignorePassport && !booking.guestId.passport.length
		: false;
	const guide = await getBookingGuide(booking, roomId);

	const accommodates = await models.Listing.getAccommodation(guide.room._id);
	const diffDays = (now.getTime() - new Date(booking.from).minTimes()) / ONE_DAY;

	const contact = await models.Ott.getGuideContact(booking.blockId._id);

	if (diffDays < Settings.MinDayShowGuide.value) {
		delete guide.newGuide;
		delete guide.code;
	}

	return {
		...guide,
		...accommodates,
		checkPassport,
		bookingId,
		otaBookingId: booking.otaBookingId,
		guest: booking.guestId,
		blockInfo: booking.blockId.info,
		blockId: booking.blockId._id,
		checkin: getTimeInOut(booking.from),
		checkinStr: moment(booking.from).format('DD/MM/YYYY'),
		checkout: getTimeInOut(booking.to, 'out'),
		checkoutStr: moment(booking.to).format('DD/MM/YYYY'),
		listing: booking.listingId,
		hasVAT: _.get(booking.blockId, 'manageFee.hasVAT'),
		isSelfCheckin,
		contact,
	};
}

module.exports = {
	getBookingGuide,
	getPublicGuide,
};

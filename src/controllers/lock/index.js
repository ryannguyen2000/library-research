const { customAlphabet } = require('nanoid');
const moment = require('moment');
const _ = require('lodash');

const { Settings } = require('@utils/setting');
const { eventEmitter, EVENTS } = require('@utils/events');
const ThrowReturn = require('@core/throwreturn');
const {
	BookingStatus,
	RuleDay,
	DOOR_LOCK_TYPE,
	DOOR_LOCK_CODE_TYPE,
	ONE_MINUTE,
	DOOR_LOCK_PASSWORD_LENGTH,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const TuyaLock = require('./tuya');
const WebpassLock = require('./webpass');

const generator = customAlphabet('0123456789', 6);

const generateCode = lockConfig => {
	return generator(_.get(lockConfig, 'temporaryPasswordLengthRequirement', DOOR_LOCK_PASSWORD_LENGTH.WEBPASS));
};

async function updateCode(roomId, index, newCode, newData) {
	const room = await models.Room.findById(roomId).select('lock blockId info');
	if (!room) return;

	const rs = { success: false, blockId: room.blockId, roomId };

	index = index || 0;
	const { no, userID, cardNo, lockId, expireTime } = newData || {};

	if (!_.isUndefined(no)) _.set(room, ['lock', index, 'no'], no);
	if (!_.isUndefined(userID)) _.set(room, ['lock', index, 'userID'], _.trim(userID));
	if (!_.isUndefined(cardNo)) _.set(room, ['lock', index, 'cardNo'], _.trim(cardNo));
	if (!_.isUndefined(lockId)) _.set(room, ['lock', index, 'lockId'], lockId);

	const currentLock = _.get(room.lock, index);
	if (_.isEmpty(currentLock)) {
		rs.message = `Chưa cấu hình khoá cho phòng ${room.info.roomNo}!`;
		rs.config = false;
		return rs;
	}

	const lock = await models.BlockLock.findOne({ _id: currentLock.lockId, active: true });
	if (!lock) {
		rs.message = 'Chưa cấu hình khoá cho nhà này!';
		return rs;
	}

	const isTuya = lock.lockType === DOOR_LOCK_TYPE.TUYA;
	const isGenerateNewCode = !newCode;
	newCode = _.toString(newCode || generateCode(lock)).trim();

	try {
		const res = isTuya
			? await TuyaLock.updateCode({
					config: lock,
					data: currentLock,
					newCode,
					room,
					index,
					expireTime,
					isReset: isGenerateNewCode,
			  })
			: await WebpassLock.updateCode({ config: lock, data: currentLock, newCode, room, index });

		const _newCode = isTuya ? res.code : newCode;
		const _prevCode = isTuya ? _.get(res, 'prevCode', room.lock[index].prevCode) : room.lock[index].code;

		room.lock[index].prevCode = _prevCode;
		room.lock[index].code = _newCode;

		if (res) _.assign(room.lock[index], res);
		await room.save();

		rs.success = true;
		rs.code = _newCode;
		rs.passId = _.get(res, 'passId', '');
	} catch (e) {
		logger.error(e);
		rs.message = 'Có lỗi xảy ra vui lòng thử lại sau!';
	}

	return rs;
}

async function activeCodeBookings(filters = {}) {
	const from = new Date().zeroHours();
	const now = moment().format('HH:mm');

	if (now >= RuleDay.to && now < RuleDay.from) return;

	const blockQuery = {
		active: true,
		isProperty: true,
	};
	if (now < RuleDay.to) {
		from.setDate(from.getDate() - 1);
		blockQuery.$or = [
			{
				activeCodeTime: { $gte: RuleDay.from },
			},
			{
				activeCodeTime: { $lte: now },
			},
		];
	} else {
		blockQuery.activeCodeTime = { $lte: now };
	}

	const blocks = await models.Block.find(blockQuery).select('_id');

	const allBookings = await models.Booking.aggregate()
		.match({
			from,
			status: BookingStatus.CONFIRMED,
			error: 0,
			blockId: { $in: blocks.map(b => b._id) },
			doorCode: { $ne: null },
			doorCodeDisabled: { $ne: true },
			'reservateRooms.0': { $exists: true },
			checkout: null,
			...filters,
		})
		.project({
			blockId: 1,
			doorCode: 1,
			reservateRooms: 1,
			to: 1,
		})
		.group({
			_id: '$blockId',
			bookings: { $push: '$$ROOT' },
		});

	if (!allBookings.length) return;

	await allBookings.asyncMap(async ({ _id, bookings }) => {
		const rule = await models.Block.getRules(_id);

		const [hour, min] = _.get(rule, 'day.checkouts', '').split(':');
		const outHour = Number(hour) || 12;
		const outMin = Number(min) || 0;

		return bookings.asyncForEach(async b => {
			const queue = [];

			const reservations = await models.Reservation.find({
				bookingId: b._id,
				doorCode: { $ne: null },
				doorCodeDisabled: { $ne: true },
			})
				.select('roomId doorCode')
				.lean();

			reservations.forEach(res => {
				if (!res.doorCode) return;
				res.doorCode.split('_').forEach((code, index) => queue.push({ roomId: res.roomId, code, index }));
			});

			const rs = await queue.asyncMap(r =>
				updateCode(r.roomId, r.index, r.code, {
					expireTime: moment(b.to).hour(outHour).minute(outMin).toDate(),
				})
			);

			const rsGrByRoomId = _.groupBy(rs, _rs => _rs.roomId.toString());

			await reservations.asyncForEach(res => {
				const newCode = _.get(rsGrByRoomId, res.roomId.toString(), [])
					.map(_rs => _rs.code)
					.join('_');
				if (res.doorCode === newCode) return;
				return models.Reservation.updateOne({ _id: res._id }, { doorCode: newCode });
			});

			if (rs.every(r => r.success || r.config === false)) {
				return Promise.all([
					models.Reservation.updateMany(
						{ bookingId: b._id, doorCode: { $ne: null } },
						{ doorCodeGenerated: true }
					),
					models.Booking.updateOne({ _id: b._id }, { doorCodeGenerated: true }),
				]);
			}

			logger.error('job set door code error bookingId blockId', b._id, b.blockId, b.doorCode);
		});
	});
}

async function getLocks(query) {
	delete query.start;
	delete query.limit;
	const locks = await models.BlockLock.find(query).lean();

	return {
		locks,
	};
}

async function createLock(data, user) {
	const { deviceId } = data;
	const isBlockLockExist = deviceId ? await models.BlockLock.findOne({ deviceId }).lean() : false;

	if (isBlockLockExist) throw new ThrowReturn('Khóa đã được tạo');

	const lock = await models.BlockLock.create({ ...data, createdBy: user._id });
	if (lock.lockType === DOOR_LOCK_TYPE.TUYA) {
		lock.temporaryPasswords = await TuyaLock.syncTempPasswords(lock._id);
	}

	return { lock };
}

async function updateLock(id, data) {
	const lock = await models.BlockLock.findById(id);
	if (!lock) throw new ThrowReturn('Lock not found!');

	const lockInUse = await models.Room.findOne({ 'lock.lockId': id }).lean();
	const isSensitiveDataChanged = ['deviceId', 'tuyaHomeId'].some(key => lock[key] !== _.get(data, key));
	if (lockInUse && isSensitiveDataChanged) throw new ThrowReturn('Khóa đang được sử dụng');

	if (isSensitiveDataChanged) {
		const lockWasCreated = await models.BlockLock.findOne({ id: { $ne: id }, deviceId: data.deviceId });
		if (lockWasCreated) throw new ThrowReturn('Khóa đã được tạo');
	}

	const isSyncPwds = ['deviceId', 'temporaryPasswordCreationLimit'].some(key => lock[key] !== _.get(data, key));

	const prevTemporaryPasswordsKeyBy = _.keyBy(lock.temporaryPasswords, l => l.passwordId);

	_.assign(lock, data);
	await lock.save();

	const codeConflicts = lock.temporaryPasswords.filter(pwd => {
		const prevTempPassword = _.get(prevTemporaryPasswordsKeyBy, [pwd.passwordId, 'code']);
		const isCodeChanged = pwd.code !== prevTempPassword;
		const isInUse = _.get(pwd, 'roomIds.length', 0);
		pwd.prevCode = prevTempPassword.code;

		return isCodeChanged && isInUse;
	});

	await codeConflicts.asyncMap(({ passwordId, roomIds, prevCode, code }) =>
		lock.syncCode({ passwordId, roomIds }, { passwordId, code, prevCode })
	);

	if (isSyncPwds && lock.lockType === DOOR_LOCK_TYPE.TUYA) {
		await TuyaLock.syncTempPasswords(lock._id);
	}

	return { lock: _.pick(lock, _.keys(data)) };
}

async function deleteLock(id) {
	const lock = await models.BlockLock.findById(id).select('deviceId lockType temporaryPasswords').lean();
	if (!lock) throw new ThrowReturn('Lock not found!');
	const inUse = await models.Room.findOne({ 'lock.lockId': id }).lean();
	if (inUse) throw new ThrowReturn('Lock that is in use');

	// if (lock.lockType === DOOR_LOCK_TYPE.TUYA) {
	// 	await lock.temporaryPasswords.asyncMap(tempPwd => TuyaLock.deletePassword(lock.deviceId, tempPwd.passwordId));
	// }

	return models.BlockLock.findByIdAndDelete(id);
}

async function changeLockCode(roomId, body) {
	const { code, bookingId, reset, index, ...data } = body;

	if (bookingId) {
		const booking = await models.Booking.findById(bookingId);
		if (!booking) throw new ThrowReturn('Not found booking!');
		if (!booking.doorCode) throw new ThrowReturn('Not found code for this booking!');

		const resFilter = { bookingId };
		if (roomId) resFilter.roomId = roomId;
		const reservations = await models.Reservation.find(resFilter).select('roomId doorCode').lean();
		let error = false;
		let result;

		await reservations.asyncForEach(async res => {
			const rs = await _.split(res.doorCode, '_').asyncMap((c, i) => updateCode(res.roomId, i, reset ? null : c));
			error = error || rs.find(r => !r.success);
			const newCode = rs.map(_rs => _rs.code).join('_');
			result = rs;
			if (res.doorCode < newCode && !reset) {
				return models.Reservation.updateOne({ _id: res._id }, { doorCode: newCode });
			}
		});

		if (!reset && !error) {
			await Promise.all([
				models.Booking.updateOne({ _id: bookingId }, { doorCodeGenerated: true }),
				models.Reservation.updateMany({ ...resFilter, doorCode: { $ne: null } }, { doorCodeGenerated: true }),
			]);
		}

		return error || _.get(result, 0);
	}

	const rs = await updateCode(roomId, index, code, data);

	return _.merge(rs, { bookingId });
}

async function getLockLogs({ start, limit, from, to, checkin, deviceId, type, lockType, ...query }, user) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;

	const { blockIds, filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: query.blockId,
		excludeBlockId: query.excludeBlockId,
		roomKey: 'roomId',
	});

	const filter = { ...filters };
	if (lockType) filter.lockType = lockType;

	if (type) filter.type = type;
	if (deviceId) filter.deviceId = deviceId;
	if (checkin) filter.checkin = checkin;
	if (from) _.set(filter, 'time.$gte', new Date(from));
	if (to) _.set(filter, 'time.$lte', new Date(to));

	const [logs, total] = await Promise.all([
		models.DoorAccessLog.find(filter)
			.sort({ time: -1 })
			.skip(start)
			.limit(limit)
			.populate('roomId', 'info.roomNo info.name')
			.populate('blockId', 'info.name info.shortName')
			.populate({
				path: 'bookingId',
				select: 'otaBookingId from to price currency guestId checkin checkout',
				populate: {
					path: 'guestId',
					select: 'name fullName ota avatar',
				},
			})
			.lean(),
		models.DoorAccessLog.countDocuments(filter),
	]);

	if (lockType === DOOR_LOCK_TYPE.TUYA || !lockType) {
		const locks = await models.BlockLock.find({ deviceId: logs.map(log => log.deviceId), blockId: blockIds })
			.select('name deviceId')
			.lean();
		const locksKeyBy = _.keyBy(locks, lock => lock.deviceId);

		logs.forEach(log => {
			log.device = locksKeyBy[log.deviceId] || {};
		});
	}

	return { logs, total };
}

async function getAccessLogHistory(query, user) {
	const data = await WebpassLock.getAccessLogHistory(query, user);
	return data;
}

async function getDeviceLocks(query) {
	const rs = await TuyaLock.getDevices(query);

	return {
		devices: rs,
	};
}

async function getHomes() {
	const rs = await TuyaLock.getHomes();

	return rs;
}

async function resetDoorCode(bookingId, roomIds, prevCode) {
	try {
		await Promise.all([
			models.Booking.updateOne({ _id: bookingId }, { doorCodeDisabled: true }),
			models.Reservation.updateMany({ bookingId, roomId: roomIds }, { doorCodeDisabled: true }),
		]);
		if (!roomIds || !roomIds.length || !prevCode) return;

		const codes = _.split(prevCode, '_');

		const rooms = await models.Room.find({
			_id: { $in: roomIds },
			lock: {
				$elemMatch: {
					code: { $in: codes },
					type: DOOR_LOCK_CODE_TYPE.OTP, // otp
				},
			},
		}).select('lock');

		if (!rooms.length) return;

		await rooms.asyncForEach(room => {
			return codes.asyncForEach(code => {
				const index = _.findIndex(room.lock, l => l.code === code && l.type === DOOR_LOCK_CODE_TYPE.OTP);
				if (index !== -1) {
					return updateCode(room._id, index);
				}
			});
		});
	} catch (e) {
		logger.error(e);
	}
}

function clearBookingCode(booking, reservation) {
	setTimeout(async () => {
		try {
			const newestBooking = await models.Booking.findOne({
				_id: booking._id,
				doorCodeGenerated: true,
				checkedIn: true,
				reservateRooms: reservation.roomId,
			}).select('reservateRooms doorCode doorCodeDisabled');
			if (newestBooking) {
				resetDoorCode(newestBooking._id, [reservation.roomId], reservation.doorCode);
			}
		} catch (e) {
			logger.error(e);
		}
	}, Settings.TimeoutForResetPasscode.value * ONE_MINUTE);
}

async function updateCheckinLock(booking, reservation) {
	try {
		if (!reservation || !reservation.roomId) return;

		await models.DoorAccessLog.updateMany(
			{
				bookingId: booking._id,
				roomId: reservation.roomId,
			},
			{ checkin: true }
		);
	} catch (e) {
		logger.error(e);
	}
}

function onCheckin(booking, guest, user, reservation) {
	clearBookingCode(booking, reservation);
	updateCheckinLock(booking, reservation);
}

async function onUndoCheckin(booking) {
	try {
		const today = new Date().zeroHours();
		if (booking.from <= today && booking.to >= today) {
			await Promise.all([
				models.Booking.updateOne({ _id: booking._id }, { doorCodeDisabled: false }),
				models.Reservation.updateMany(
					{ bookingId: booking._id, doorCodeDisabled: true },
					{ doorCodeDisabled: false }
				),
			]);
			await activeCodeBookings({ _id: booking._id, from: { $lte: today } });
		}
	} catch (e) {
		logger.error(e);
	}
}

function onCheckout(booking, guests, isCheckoutAll) {
	if (isCheckoutAll) {
		resetDoorCode(booking._id, booking.reservateRooms, booking.doorCode);
	}
}

if (!global.isDev) {
	(async function () {
		try {
			const now = new Date();
			const prev = new Date(now - Settings.TimeoutForResetPasscode.value * ONE_MINUTE);

			const bookings = await models.Booking.find({
				to: { $gte: new Date().zeroHours() },
				status: BookingStatus.CONFIRMED,
				doorCodeGenerated: true,
				doorCodeDisabled: { $ne: true },
				checkin: { $gte: prev },
				'reservateRooms.0': { $exists: true },
			})
				.select('reservateRooms doorCode')
				.lean();

			await bookings.asyncMap(booking => resetDoorCode(booking._id, booking.reservateRooms, booking.doorCode));
		} catch (e) {
			logger.error(e);
		}
	})();
}

async function deleteTempPassword(lockId, passId, roomId) {
	const blockLock = (await models.BlockLock.findById(lockId)) || {};

	if (blockLock.lockType === DOOR_LOCK_TYPE.TUYA) {
		return blockLock.pullRoomIdOnPassword(passId, roomId);
	}

	// if (lockType === DOOR_LOCK_TYPE.WEBPASS) {
	// }
}

async function syncTempPasswords(blockLockId) {
	return TuyaLock.syncTempPasswords(blockLockId);
}

eventEmitter.on(EVENTS.RESERVATION_CHECKIN, onCheckin);
eventEmitter.on(EVENTS.RESERVATION_CHECKIN_UNDO, onUndoCheckin);
eventEmitter.on(EVENTS.RESERVATION_CHECKOUT, onCheckout);

module.exports = {
	updateCode,
	generateCode,
	activeCodeBookings,
	getLocks,
	createLock,
	updateLock,
	deleteLock,
	changeLockCode,
	getLockLogs,
	getDeviceLocks,
	getHomes,
	getAccessLogHistory,
	deleteTempPassword,
	syncTempPasswords,
};

const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const {
	BookingStatus,
	ONE_DAY,
	Services,
	RuleDay,
	PRESENT_COMPARE_WITH_CHECKIN_RESULT,
	DOOR_LOCK_TYPE,
	ROOM_GROUP_TYPES,
	// DOOR_LOCK_PASSWORD_LENGTH,
	DEFAULT_TEMPORARY_PASSWORD_CREATION_LIMIT,
} = require('@utils/const');
const { updateDoc } = require('@utils/schema');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const Lock = require('@controllers/lock');
const { setDelayTime } = require('@utils/date');

const ROOM_STATUS = {
	ROOM_NOT_CHECK_IN: 'roomNotCheckin',
	ROOM_AVAILABLE_AFTER_CHECKOUT: 'roomAvailableAfterCheckout',
	ROOM_INVOICES: 'roomInvoices',
};

async function getBlocks(user, { start, limit }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;

	const filter = { active: true };

	const { blockIds, filters } = await models.Host.getBlocksOfUser({ user, roomKey: '_id' });
	filter._id = { $in: blockIds };

	let [blocks, total] = await Promise.all([
		models.Block.find(filter)
			.skip(start)
			.limit(limit)
			.select('-OTAProperties -listingIds -manageFee -layout')
			.populate('virtualRoomId', 'info.images')
			.lean(),
		models.Block.countDocuments(filter),
	]);

	const roomFilter = {
		...filters,
		virtual: false,
	};

	const rooms = await models.Room.find(roomFilter)
		.select('info.name info.nameLT info.roomNo info.layoutBg info.layoutBgLT blockId isSelling roomIds')
		.lean();
	const roomGroup = _.groupBy(rooms, 'blockId');

	blocks = blocks.map(block => {
		const roomTypes = _.groupBy(roomGroup[block._id], 'info.name');
		const roomTypesLT = _.groupBy(
			_.filter(roomGroup[block._id], r => r.info.nameLT),
			'info.nameLT'
		);
		const totalRooms = _.filter(roomGroup[block._id], r => r.isSelling && (!r.roomIds || !r.roomIds.length)).length;

		return {
			...block,
			roomTypes,
			roomTypesLT,
			totalRooms,
		};
	});

	return { blocks, total };
}

async function getBlock({ block, accessRoomIds }) {
	const match = {};
	if (accessRoomIds) {
		match._id = { $in: accessRoomIds };
	}

	await models.Block.populate(block, [
		{
			path: 'ottId',
		},
		{
			path: 'listingIds',
			match: accessRoomIds && { roomIds: { $in: accessRoomIds } },
			populate: {
				path: 'roomTypeId',
				select: 'name',
			},
		},
		{
			path: 'locks',
		},
		{
			path: 'virtualRoomId',
			populate: {
				path: 'roomIds',
				match,
				populate: {
					path: 'roomIds',
					match,
					populate: {
						path: 'roomIds',
						match,
						populate: {
							path: 'roomIds',
							match,
							populate: {
								path: 'roomIds',
								match,
							},
						},
					},
				},
			},
		},
	]);

	return { block };
}

async function createBlock(user, body) {
	const block = await models.Block.create({ ...body, groupIds: user.groupIds });
	// create virtual room
	const room = await models.Room.create({
		blockId: block._id,
		virtual: true,
		'info.name': block.info.name,
	});

	// add virtual room to block
	block.virtualRoomId = room._id;
	await block.save();

	// add block to host
	const roles = await models.RoleGroup.find({ public: { $ne: true } }).select('role');
	const users = await models.User.find({
		role: { $in: _.map(roles, 'role') },
		groupIds: { $in: block.groupIds },
	}).select('_id');

	await models.HostBlock.addBlocksToUsers([block._id], _.map(users, '_id'), user);

	return { block };
}

async function updateBlock(block, data) {
	const update = _.omit(data, ['listingIds', 'virtualRoomId']);

	await updateDoc(block, update);

	return { block: _.pick(block, _.keys(update)) };
}

async function getRooms({ block, accessRoomIds }, { treeView, isSelling, roomTypeGroupId }) {
	const filter = {};
	if (accessRoomIds) {
		filter._id = { $in: accessRoomIds };
	}
	if (isSelling) {
		filter.isSelling = isSelling === 'true' ? { $ne: false } : false;
	}

	if (treeView !== 'true') {
		const rtFilter = {
			blockId: block._id,
			deleted: false,
		};
		if (roomTypeGroupId) {
			rtFilter.roomTypeGroupId = roomTypeGroupId;
		} else {
			rtFilter.type = ROOM_GROUP_TYPES.DEFAULT;
		}

		const roomTypes = await models.RoomType.find(rtFilter)
			.select('roomPoint name roomIds layoutBg type')
			.sort({ roomPoint: -1, createdAt: -1 })
			.populate({ path: 'roomIds', select: 'info.name info.roomNo', match: filter })
			.lean();

		return {
			roomTypes: roomTypes.map(({ roomIds, ...r }) => ({
				...r,
				roomType: r.name,
				rooms: roomIds,
			})),
		};

		// const roomTypes = await block.getRoomTypes(filter, longterm === 'true');
		// return {
		// 	roomTypes: _.entries(roomTypes).map(([roomType, rooms]) => ({
		// 		roomType,
		// 		rooms,
		// 	})),
		// };
	}

	const select = '-relationRoomIds';
	const rooms = await models.Room.find({
		...filter,
		parentRoomId: block.virtualRoomId,
	})
		.select(select)
		.populate({
			path: 'roomIds',
			match: filter,
			select,
			populate: {
				path: 'roomIds',
				match: filter,
				select,
				populate: {
					path: 'roomIds',
					match: filter,
					select,
					populate: {
						path: 'roomIds',
						match: filter,
						select,
						populate: {
							path: 'roomIds',
							match: filter,
						},
					},
				},
			},
		});

	return {
		rooms,
	};
}

async function createRooms(parentRoomId, body) {
	const parent = await models.Room.findById(parentRoomId);
	if (!parent) {
		throw new ThrowReturn('Parent room not found');
	}

	const { roomNos, roomInfo } = body;
	roomInfo.parentRoomId = parent._id;

	// create list rooms tasks
	const roomIds = await roomNos.asyncMap(async roomNo => {
		const room = new models.Room(roomInfo);
		room.info.roomNo = roomNo;
		room.blockId = parent.blockId;
		await room.save();
		return room._id;
	});

	// save to parent room
	parent.roomIds = parent.roomIds || [];
	parent.roomIds.push(...roomIds);
	await parent.save();

	return { rooms: roomIds };
}

async function updateRoom(roomId, body) {
	const room = await models.Room.findById(roomId);
	if (!room) throw new ThrowReturn('Room not found', roomId);

	const { info, lock: locks, roomPoint, roomLock, ...other } = body;

	_.unset(info, 'name');

	room.info = _.assign(room.info, info);
	room.roomLock = _.assign(room.roomLock, roomLock);
	_.unset(other, 'parentRoomId');
	_.unset(other, 'roomIds');
	_.assign(room, other);

	if (!_.isUndefined(roomPoint) && roomPoint !== room.roomPoint) {
		await models.Room.updateMany(
			{ 'info.name': room.info.name, blockId: room.blockId, 'info.price': room.info.price },
			{ roomPoint }
		);
	}

	const lockUpdate = [];

	if (_.isArray(locks)) {
		const prevLocks = room.lock || [];

		// Get delete list;
		const passIds = _.compact(locks).map(lock => lock.passId);
		const lockDelete = prevLocks.filter(preLock => !passIds.includes(preLock.passId));

		if (lockDelete.length) {
			await lockDelete.asyncForEach(l => Lock.deleteTempPassword(l.lockId, l.passId, roomId));
		}

		room.lock = _.compact(locks);
		const lockIds = room.lock.map(l => l.lockId);

		// only get Tuya Block Lock
		let blockLocks = await models.BlockLock.find({ _id: { $in: lockIds } });
		const emptyTempPasswordList = blockLocks.filter(blockLock => {
			const temporaryPasswordCreationLimit = _.get(
				blockLock,
				'temporaryPasswordCreationLimit',
				DEFAULT_TEMPORARY_PASSWORD_CREATION_LIMIT
			);
			const passwordPoolFull =
				_.get(blockLock, 'temporaryPasswords.length', 0) === temporaryPasswordCreationLimit;
			const isTuyaLock = blockLock.lockType === DOOR_LOCK_TYPE.TUYA;

			return !passwordPoolFull && isTuyaLock;
		});

		if (emptyTempPasswordList.length) {
			await emptyTempPasswordList.asyncMap(({ _id }) => Lock.syncTempPasswords(_id));
			blockLocks = await models.BlockLock.find({ _id: { $in: lockIds } });
		}

		const blockLocksKeyById = _.keyBy(blockLocks, blockLock => blockLock._id.toString());

		room.lock.forEach((lock, index) => {
			const isPasswordExist = !!lock.passId;
			const blockLock = blockLocksKeyById[lock.lockId.toString()];
			const isTuyaLock = blockLock.lockType === DOOR_LOCK_TYPE.TUYA;

			const keys = ['no', 'userID', 'cardNo', 'code', 'lockId'];
			const prevData = isTuyaLock
				? _.find(prevLocks, preLock => preLock.passId === lock.passId)
				: prevLocks[index];
			const isDataChanged = !_.isEqual(_.pick(prevData, keys), _.pick(lock, keys));

			if (!isPasswordExist && isTuyaLock) {
				const tempPassword = blockLock.getPasswordInPool();
				if (!tempPassword) throw new ThrowReturn('Password pool error');
				lock.passId = tempPassword.passwordId;
			}

			if (isDataChanged || !isPasswordExist) {
				const isCodeValid = blockLock.isCodeValid(lock.code);
				if (!isCodeValid && lock.code) {
					throw new ThrowReturn(`Code length invalid`);
				}
				lockUpdate.push({ code: lock.code, index });
				lock.code = _.get(prevData, 'code');
			}
		});
	}

	await room.save();

	if (lockUpdate.length) {
		await lockUpdate.asyncForEach(l => Lock.updateCode(room._id, l.index, l.code));
	}

	return { room: _.pick(room, _.keys(body)) };
}

async function getStats(user, query) {
	let { from, to, listingId, otaName } = query;

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: query.blockIds,
		roomKey: 'reservateRooms',
	});

	const occupancyRate = {};

	if (listingId) {
		const q = { _id: listingId };

		const listing = await models.Listing.findOne(q);
		if (listing) {
			const fromDate = new Date();
			fromDate.setDate(1);
			fromDate.setHours(0, 0, 0, 0);
			fromDate.setMonth(fromDate.getMonth() - 4);
			for (let i = 0; i < 6; i++) {
				const toDate = new Date(fromDate);
				toDate.setMonth(toDate.getMonth() + 1);
				const { rate } = await models.Booking.occupancyRate(
					null,
					listingId,
					otaName,
					listing.roomIds.length,
					fromDate,
					toDate
				);
				occupancyRate[fromDate.toISOString()] = rate;
				fromDate.setMonth(fromDate.getMonth() + 1);
			}
		}
	}

	const $match = {
		status: BookingStatus.CONFIRMED,
		ignoreFinance: false,
		...filters,
	};
	if (otaName) $match.otaName = otaName;
	if (listingId) $match.listingId = _.isArray(listingId) ? { $in: listingId } : mongoose.Types.ObjectId(listingId);
	else {
		from = from || moment().startOf('month').toDate().zeroHours();
		to = to || moment().endOf('month').toDate().zeroHours();
		$match.from = { $gte: new Date(from), $lte: new Date(to) };
	}

	const data = await models.Booking.aggregate([
		{
			$match,
		},
		{
			$group: {
				_id: '$currency',
				bookings: { $sum: 1 },
				checkin: {
					$sum: {
						$cond: {
							if: { $gte: ['$checkin', 0] },
							then: 1,
							else: 0,
						},
					},
				},
				price: { $sum: '$price' },
				nights: {
					$sum: {
						$divide: [{ $subtract: ['$to', '$from'] }, ONE_DAY],
					},
				},
				guests: { $avg: '$numberAdults' },
				ahead: {
					$sum: {
						$divide: [{ $subtract: ['$from', '$createdAt'] }, ONE_DAY],
					},
				},
			},
		},
		{
			$group: {
				_id: null,
				bookings: { $sum: '$bookings' },
				checkin: { $sum: '$checkin' },
				nights: { $sum: '$nights' },
				guests: { $avg: '$guests' },
				prices: { $push: { currency: '$_id', quantity: '$price' } },
				ahead: { $sum: '$ahead' },
			},
		},
		{
			$project: {
				bookings: 1,
				checkin: 1,
				guests: 1,
				prices: 1,
				nights: 1,
				avgNights: { $divide: ['$nights', '$bookings'] },
				ahead: { $divide: ['$ahead', '$bookings'] },
			},
		},
	]);

	return { stats: data && data[0], occupancy: occupancyRate };
}

async function changeRoomParent(roomId, body) {
	const { parentId } = body;

	const room = await models.Room.findById(roomId).populate('blockId', 'virtualRoomId');
	if (!room) {
		throw new ThrowReturn(`Room not found`);
	}

	if (room.parentRoomId.equals(parentId)) {
		return _.pick(room, _.keys(body));
	}

	if (parentId) {
		const parent = await models.Room.findById(parentId);
		if (!parent) {
			throw new ThrowReturn(`Parent not found`);
		}
		if (parent.parentRoomId.equals(room._id)) {
			throw new ThrowReturn('Parent room ID invalid!');
		}
	}

	const newParentId = parentId || room.blockId.virtualRoomId;
	room.parentRoomId = newParentId;
	await room.save();

	// remove from old parent room and add room to new parent room
	await models.Room.updateMany({ roomIds: room._id }, { $pull: { roomIds: room._id } });
	await models.Room.updateOne({ _id: newParentId }, { $addToSet: { roomIds: room._id } });

	return _.pick(room, ['parentRoomId']);
}

async function filterRoomsLayout(req, query) {
	const { date, key } = query;
	let roomIds = [];
	const { blockId } = req.params;
	const from = moment(date).subtract(1).toDate().zeroHours();
	const to = new Date(date).zeroHours();
	const matchPipeline = {
		$match: {
			blockId: mongoose.Types.ObjectId(blockId),
			'dates.date': {
				$in: [from, to],
			},
		},
	};

	if (ROOM_STATUS.ROOM_NOT_CHECK_IN === key) {
		roomIds = await models.Reservation.aggregate([
			matchPipeline,
			{
				$project: {
					roomId: 1,
					bookingId: 1,
					guests: 1,
					from: { $arrayElemAt: ['$dates', 0] },
					to: { $arrayElemAt: ['$dates', -1] },
				},
			},
			{
				$match: {
					$or: [
						{
							'from.date': to,
							'guests.checkin': null,
						},
						{
							'to.date': from,
							'guests.checkout': { $ne: null },
						},
					],
				},
			},
			{
				$group: {
					_id: '$roomId',
					count: { $sum: 1 },
				},
			},
			{
				$match: { count: { $gt: 1 } },
			},
		]);
	}

	if (ROOM_STATUS.ROOM_AVAILABLE_AFTER_CHECKOUT === key) {
		roomIds = await models.Reservation.aggregate([
			matchPipeline,
			{
				$project: {
					roomId: 1,
					bookingId: 1,
					guests: 1,
					to: { $arrayElemAt: ['$dates', -1] },
				},
			},
			{
				$group: {
					_id: '$roomId',
					count: { $sum: 1 },
					res: { $push: '$$ROOT' },
				},
			},
			{
				$match: {
					count: 1,
					'res.to.date': from,
					'res.guests.checkout': { $ne: null },
				},
			},
		]);
	}
	if (ROOM_STATUS.ROOM_INVOICES === key) {
		const reservationBookings = await models.Reservation.find(matchPipeline.$match, {
			bookingId: 1,
			roomId: 1,
		});
		const feeAutoMessageBookings = await models.FeeAutoMessage.aggregate([
			{
				$match: {
					bookingId: {
						$in: _.map(reservationBookings, item => item.bookingId),
					},
				},
			},
			{ $group: { _id: '$bookingId' } },
		]);
		const bookingIds = feeAutoMessageBookings.map(feeMessage => feeMessage._id);
		roomIds = reservationBookings
			.filter(item => {
				return bookingIds.includesObjectId(item.bookingId);
			})
			.map(item => {
				return { _id: item.roomId };
			});
	}
	return { roomIds: _.map(roomIds, item => item._id) };
}

async function getAvailableRooms(blockId, query) {
	let { from, to, fromHour, toHour, serviceType } = query;

	from = new Date(from).zeroHours();
	to = new Date(to).zeroHours();
	serviceType = _.toInteger(serviceType) || Services.Day;

	const rules = await models.Block.getRules(blockId);
	const isHourService = serviceType === Services.Hour;
	const options = { rules, serviceType };
	const ruleDayTo = _.get(rules, 'day.to', RuleDay.to);
	const defaultCheckin = serviceType === Services.Night ? rules.night.checkin : rules.day.checkin;

	if (isHourService) {
		options.fromHour = fromHour;
		options.toHour = toHour;
		to = moment(from).add(1, 'day').toDate();
	}

	const [roomsData, blockSchedules] = await Promise.all([
		models.Room.find({ blockId, virtual: false, isSelling: [true, null] })
			.select('_id info.roomNo info.name relationRoomIds')
			.lean(),
		models.BlockScheduler.find({
			blockId,
			date: {
				$gte: from,
				$lt: to,
			},
		}).sort({ date: 1 }),
	]);

	const preSchedule = await models.BlockScheduler.findOne({
		blockId,
		date: moment(from).subtract(1, 'd').toDate(),
	}).lean();

	const nextSchedule = await models.BlockScheduler.findOne({
		blockId,
		date: to,
	}).lean();

	const rooms = roomsData.map(room => {
		const relationRooms = _.mapKeys(room.relationRoomIds);

		const unAvailable = blockSchedules.length
			? blockSchedules.some(
					(schedule, index) =>
						!schedule.isAvailable(relationRooms, { ...options, isCheckinDate: index === 0 })
			  )
			: false;

		let available = !unAvailable;

		if (available) {
			const preReservations = _.get(preSchedule, 'reservations', []);
			if (isHourService) {
				const isPreUnavailable = preReservations.some(res => {
					if (!relationRooms[res.roomId]) return false;
					if (res.fromHour || res.toHour) return false;

					return res.checkout
						? setDelayTime(res.checkout, rules.delay, 'ADD') > fromHour
						: ruleDayTo > fromHour;
				});

				available = !isPreUnavailable;
			} else {
				const diffDay = Math.floor(moment().diff(from, 'day', true));
				const isInCheckoutRange = preReservations.some(res => {
					if (!relationRooms[res.roomId]) return false;
					if (res.checkout) {
						const checkout = setDelayTime(res.checkout, rules.delay, 'ADD');

						if (diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.SAME) {
							const currentTime = moment().format('HH:mm');
							return checkout > defaultCheckin && checkout > currentTime;
						}
						if (diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.NEXT_DATE_OF_CHECKIN) return false;
						return checkout > defaultCheckin;
					}
					return false;
				});

				available = !isInCheckoutRange;

				if (!isInCheckoutRange) {
					const nextResAndLocks = [
						..._.get(nextSchedule, 'reservations', []),
						..._.get(nextSchedule, 'lockedHours', []),
					];

					const isNextUnavailable = nextResAndLocks.some(res => {
						if (!relationRooms[res.roomId]) return false;
						if (res.fromHour) {
							return res.fromHour < ruleDayTo;
						}
						return res.checkin ? res.checkin < ruleDayTo : false;
					});
					available = !isNextUnavailable;
				}
			}
		}

		return {
			_id: room._id,
			info: room.info,
			relationRoomIds: room.relationRoomIds,
			available,
		};
	});

	return { rooms };
}

module.exports = {
	getBlocks,
	getBlock,
	createBlock,
	updateBlock,
	getRooms,
	createRooms,
	updateRoom,
	getStats,
	changeRoomParent,
	filterRoomsLayout,
	getAvailableRooms,
};

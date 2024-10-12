const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const {
	BookingStatus,
	ONE_DAY,
	Services,
	EXTRA_FEE,
	RuleDay,
	LOCK_TYPE,
	WATER_FEE_CALC_TYPE,
	WORK_NOTE_TYPES,
} = require('@utils/const');
const models = require('@models');
const { roundTime } = require('@utils/date');

const MAX_RANGE_SCHEDULE = 60;

async function getReservateRooms({ bookings, roomId, isShowFee, schedules = [], isHourService = false }) {
	const match = {
		'dates.0': { $exists: true },
		bookingId: { $in: bookings.map(b => b._id) },
	};
	if (roomId) {
		match.roomId = roomId;
	}

	let fees = {};
	if (isShowFee) {
		[
			..._.values(EXTRA_FEE),
			'currentElectricQuantity',
			'previousElectricQuantity',
			'electricPricePerKwh',
			'previousWaterQuantity',
			'currentWaterQuantity',
			'defaultWaterPrice',
			'waterPricePerM3',
			'waterFeeCalcType',
		].forEach(fee => {
			_.set(fees, fee, `$${fee}`);
		});
	}

	const reservateRooms = await models.Reservation.aggregate([
		{ $match: match },
		{
			$group: {
				_id: '$bookingId',
				rooms: {
					$push: {
						id: '$roomId',
						from: { $min: '$dates.date' },
						to: { $max: '$dates.date' },
						guests: '$guests',
						price: '$price',
						roomPrice: '$price',
						currency: '$currency',
						...fees,
					},
				},
			},
		},
	]);

	const bookingsObj = _.keyBy(bookings, '_id');
	let schedulesObj = {};
	if (isHourService) {
		schedules.forEach(sch => {
			sch.date = sch.date.toDateMysqlFormat();
			sch.reservations = _.keyBy(sch.reservations, 'bookingId');
		});
		schedulesObj = _.keyBy(schedules, 'date');
	}

	reservateRooms.sort((a, b) => _.get(a, 'rooms[0].from') - _.get(b, 'rooms[0].from'));
	reservateRooms.forEach(res => {
		res.booking = res._id;
		res._id = undefined;
		const booking = bookingsObj[res.booking];
		const _isHourBooking = booking.serviceType === Services.Hour;
		const date = _isHourBooking
			? moment(booking.from).format('YYYY-MM-DD')
			: moment(booking.to).subtract(1, 'days').format('YYYY-MM-DD');
		const sch = isHourService ? _.get(schedulesObj, [date, 'reservations', res.booking], {}) : {};

		res.rooms = res.rooms.reduce((obj, v) => {
			obj[v.id.toString()] = v;
			const guests = v.guests || [];

			if (v.roomPrice) {
				const _from = moment(v.from);
				const _to = moment(v.to);
				v.night = _to.diff(_from, 'days') || 1;
				v.roomPricePerDay = _.round(v.roomPrice / v.night);
			}
			if (v.currentElectricQuantity) {
				v.electricQuantity = v.currentElectricQuantity - v.previousElectricQuantity;
			}
			if (v.waterFeeCalcType === WATER_FEE_CALC_TYPE.QUANTITY) {
				v.waterQuantity = v.currentWaterQuantity - v.previousWaterQuantity;
			}
			if (isHourService) {
				v.fromHour = (_isHourBooking ? sch.fromHour : sch.checkin || RuleDay.from) || booking.fromHour;
				v.toHour = (_isHourBooking ? sch.toHour : sch.checkout || RuleDay.to) || booking.toHour;
			}
			if (guests.length) {
				if (!guests.find(g => !g.checkin)) {
					v.checkin = guests[guests.length - 1].checkin;
				}
				if (!guests.find(g => !g.checkout)) {
					v.checkout = guests[guests.length - 1].checkout;
				}
			}

			v.id = undefined;
			v.guests = undefined;
			return obj;
		}, {});
	});

	return reservateRooms;
}

function minimizeSchedules(schedules) {
	const minimized = [];
	schedules.forEach(day => {
		const s = { date: day.date };
		let flag = false;
		if (day.lockedRoomIds && day.lockedRoomIds.length > 0) {
			flag = true;
			s.lockedRoomIds = day.lockedRoomIds;
		}
		if (day.lockedHours && day.lockedHours.length > 0) {
			flag = true;
			s.lockedHours = day.lockedHours;
		}
		if (day.reservations && day.reservations.length > 0) {
			flag = true;
			s.reservations = day.reservations;
		}
		if (day.unavailable && day.unavailable.length > 0) {
			flag = true;
			s.unavailable = day.unavailable;
		}
		if (flag) {
			minimized.push(s);
		}
	});
	return minimized;
}

async function findBookings({ blockId, roomId, from, to, otaName }) {
	const query = {
		error: 0,
		from: { $lte: to },
		to: { $gt: from },
		blockId,
		status: { $in: [BookingStatus.CONFIRMED, BookingStatus.NOSHOW] },
	};

	if (otaName) query.otaName = otaName;
	if (roomId) query.reservateRooms = roomId;

	const statusOrder = {
		[BookingStatus.CONFIRMED]: 1,
		[BookingStatus.NOSHOW]: 2,
	};

	const bookings = await models.Booking.find(query)
		.select(
			'guestIds guestId price totalPrice numberAdults numberChilden currency amount expectCheckIn expectCheckOut reservateRooms bookType otaName from to fromHour toHour status checkin checkout otaBookingId messages serviceType'
		)
		.populate('guestId', 'name fullName avatar')
		.lean();

	return bookings.sort((a, b) => statusOrder[b.status] - statusOrder[a.status]);
}

async function getRoomSchedule(roomId, from, to) {
	const day = moment(to).diff(from, 'day');
	if (day > MAX_RANGE_SCHEDULE) {
		throw new ThrowReturn(`Vui lòng không vượt quá ${MAX_RANGE_SCHEDULE} ngày!`);
	}

	const room = await models.Room.findById(roomId);
	if (!room) {
		throw new ThrowReturn('Room not found');
	}

	// get bookings
	let bookings = await findBookings({
		from,
		to,
		blockId: room.blockId,
		roomId: room._id,
	});

	// get schedules
	const block = await models.Block.findById(room.blockId).select('serviceTypes rules');
	const rules = block.getRules();
	to.setDate(to.getDate() + 1);
	let schedules = await models.BlockScheduler.getSchedulesByRoomIds({
		blockId: room.blockId,
		from,
		to,
		roomIds: [roomId],
		rules,
		includeHourService: _.includes(block.serviceTypes, Services.Hour),
	});

	// map bookings and rooms
	const reservateRooms = await getReservateRooms({ bookings, roomId: room._id });
	const reservateRoomsObj = _.keyBy(reservateRooms, 'booking');

	// div price by reserved rooms
	bookings = bookings.filter(b => reservateRoomsObj[b._id.toString()]);
	bookings.forEach(b => {
		const rooms = reservateRoomsObj[b._id.toString()];

		if (rooms && Object.keys(rooms.rooms) > 1) {
			b.price /= Object.keys(rooms.rooms);
		}
	});

	schedules = minimizeSchedules(schedules);

	return { bookings, reservateRooms, schedules, roomId };
}

async function getScheduleDetail(block, from, to, minimize = false) {
	if (typeof block === 'string') {
		block = await models.Block.findById(block).select('_id virtualRoomId rules serviceTypes');
	}
	const rules = block.getRules();
	const includeHourService = _.includes(block.serviceTypes, Services.Hour);
	// get schedules
	const schedules = await models.BlockScheduler.getSchedules({
		blockId: block._id,
		from,
		to,
		rules,
		includeHourService,
	});

	const roomRelations = {};
	const rooms = {};
	schedules.forEach(s => {
		s.lockedRoomIds.forEach(roomId => {
			rooms[roomId] = true;
		});
		s.reservations.forEach(r => {
			rooms[r.roomId] = true;
		});
		s.lockedHours.forEach(r => {
			rooms[r.roomId] = true;
		});
	});
	await _.keys(rooms).asyncMap(async roomId => {
		roomRelations[roomId] = await models.Room.getRelationsRooms(roomId);
	});

	// get relation state of all rooms
	schedules
		.filter(
			s => s.lockedRoomIds.length || s.reservations.length || s.lockedHours.length || s.unavailableRooms.length
		)
		.forEach(schedule => {
			const unavailable = _.mapKeys(schedule.unavailableRooms);

			const relationsRooms = [];
			_.keys(unavailable).forEach(roomId => {
				if (roomRelations[roomId]) relationsRooms.push(...roomRelations[roomId]);
			});

			const filtered = relationsRooms.map(r => r.toString()).filter(r => !unavailable[r]);

			schedule.unavailable = _.uniq(filtered);
		});

	return minimize ? minimizeSchedules(schedules) : schedules;
}

async function getBlockSchedule(query, user) {
	const { block, listing, otaName, from, to, accessRoomIds, isShowFee, roomTypeGroupId } = query;
	const day = moment(to).diff(from, 'day');

	if (day > MAX_RANGE_SCHEDULE) {
		throw new ThrowReturn(`Vui lòng không vượt quá ${MAX_RANGE_SCHEDULE} ngày!`);
	}

	if (block.activeCalendarLog) {
		const canAccess = await models.CalendarAccessLog.checkAccess(user, block._id);
		if (!canAccess) {
			return {
				requireConfirmation: true,
				requireFields: ['username'],
			};
		}
	}

	query.isShowFee = query.isShowFee === 'true';

	const isHourService = _.toInteger(query.serviceType) === Services.Hour;
	if (isHourService) query.from = moment(query.from).subtract(1, 'day').toDate();

	const bookingFilter = {
		blockId: block._id,
		from,
		to,
		otaName,
	};
	const roomFilter = {
		blockId: block._id,
		virtual: false,
		isSelling: { $ne: false },
	};
	let roomIds = accessRoomIds;

	if (listing) {
		roomIds = roomIds ? _.intersectionBy(listing.roomIds, roomIds, _.toString) : listing.roomIds;
	}

	if (isHourService) {
		if (!listing) {
			const hourListings = await models.Listing.find({
				blockId: block._id,
				OTAs: {
					$elemMatch: {
						serviceTypes: Services.Hour,
						active: true,
					},
				},
			}).select('roomIds');
			const hourListingRoomIds = _.flatMap(hourListings, 'roomIds');
			roomIds = roomIds ? _.intersectionBy(hourListingRoomIds, roomIds, _.toString) : hourListingRoomIds;
		}

		const bookings = await models.Booking.find(
			_.pickBy({
				from: { $lte: to },
				to: { $gt: from },
				blockId: block._id,
				listingId: listing && listing._id,
				status: { $in: [BookingStatus.CONFIRMED, BookingStatus.NOSHOW] },
				serviceType: Services.Hour,
				error: { $eq: 0 },
				reservateRooms: { $nin: roomIds },
			})
		).select('reservateRooms');
		const extRoomIds = _.flatMap(bookings, 'reservateRooms');

		roomIds = _.uniqBy([...roomIds, ...extRoomIds], _.toString);
	}

	if (roomIds) {
		_.set(roomFilter, '_id.$in', roomIds);
		_.set(bookingFilter, 'roomId.$in', roomIds);
	}

	let rooms = await models.Room.find(roomFilter)
		.select('info.name info.roomNo info.nameLT roomIds roomPoint')
		// .sort({ roomPoint: -1, 'info.roomNo': -1 })
		.lean();

	if (roomTypeGroupId) {
		const roomTypes = await models.RoomType.find({ blockId: block._id, roomTypeGroupId, deleted: false })
			.select('name roomPoint roomIds')
			.lean();

		const mappers = {};

		roomTypes.forEach(r => {
			r.roomIds.forEach(roomId => {
				mappers[roomId] = { roomType: r.name, roomPoint: r.roomPoint };
			});
		});

		rooms = rooms.filter(room => {
			if (mappers[room._id]) {
				_.assign(room, mappers[room._id]);
				room.info.name = room.roomType;
				return true;
			}
			return false;
		});
	} else {
		rooms.forEach(room => {
			room.roomType = room.info.name;
		});
	}

	rooms = _.orderBy(rooms, ['roomPoint', 'info.roomNo'], ['desc', 'desc']);

	// get bookings
	const bookings = await findBookings(bookingFilter);

	// get schedules
	to.setDate(to.getDate() + 1);
	const schedules = await getScheduleDetail(block, from, to, true);
	// map bookings and rooms

	const reservateRooms = await getReservateRooms({
		bookings,
		roomId: null,
		isShowFee,
		schedules,
		isHourService,
	});
	const reservateRoomsObj = _.keyBy(reservateRooms, 'booking');

	// get service fees
	const longTermBookingIds = _.map(
		bookings.filter(b => b.serviceType === Services.Month),
		'_id'
	);
	const servicesFees = isShowFee ? await getServiceFees(longTermBookingIds) : [];

	// add no show booking's rooms
	bookings.forEach(booking => {
		const bookingId = booking._id.toString();
		if (booking.status === BookingStatus.NOSHOW && booking.reservateRooms && !reservateRoomsObj[bookingId]) {
			const roomsObj = {};
			booking.reservateRooms.forEach(id => {
				roomsObj[id] = {
					from: booking.from,
					to: new Date(booking.to.getTime() - ONE_DAY),
				};
			});
			const newReservate = {
				booking: booking._id,
				rooms: roomsObj,
			};
			reservateRoomsObj[bookingId] = newReservate;
			reservateRooms.push(newReservate);
		}
		const roomCount = _.keys(_.get(reservateRoomsObj[bookingId], 'rooms')).length;
		if (roomCount > 1) {
			booking.price /= roomCount;
		}
	});

	return { layout: block.layout, rooms, bookings, reservateRooms, schedules, servicesFees };
}

async function requestAccessSchedule(user, block, body) {
	const requireFields = ['username'];

	let err = false;

	requireFields.forEach(field => {
		if (body[field] !== user[field]) {
			err = true;
		}
	});

	await models.CalendarAccessLog.create({
		userId: user._id,
		blockId: block._id,
		status: err ? 'denied' : 'accepted',
		requestData: body,
	});

	if (err) {
		throw new ThrowReturn('Yêu cầu bị từ chối! Sai thông tin');
	}
}

async function lockRoom({ roomIds, from, to, fromHour, toHour, locked, type = LOCK_TYPE.DAY, userId, note }) {
	if (locked && !note) {
		throw new ThrowReturn('Bạn chưa nhập ghi chú!');
	}

	let blockId = null;

	if (_.isArray(roomIds)) {
		const room = await models.Room.findById(roomIds[0]);
		if (room) {
			({ blockId } = room);
		}
	} else {
		const room = await models.Room.findById(roomIds);
		if (room) {
			({ blockId } = room);
			roomIds = [room._id];
		} else {
			const listing = await models.Listing.findById(roomIds);
			if (!listing) {
				throw new ThrowReturn('Room or Listing not found');
			}
			({ blockId } = listing);
			roomIds = listing.roomIds;
		}
	}

	from = new Date(from).zeroHours();
	to = new Date(to).zeroHours();
	fromHour = roundTime(fromHour);
	toHour = roundTime(toHour);

	if (fromHour > toHour) {
		const temp = fromHour;
		fromHour = toHour;
		toHour = temp;
	}

	if (from > to) {
		const temp = from;
		from = to;
		to = temp;
	}

	const { items } = await models.BlockScheduler.lockRooms({
		blockId,
		roomIds,
		from,
		to,
		fromHour,
		toHour,
		type,
		locked,
		userId,
	});

	if (note) {
		await models.WorkNote.create({
			blockId,
			roomIds,
			from,
			to,
			note,
			date: new Date(),
			createdBy: userId,
			type: [WORK_NOTE_TYPES.LOCK_ROOM],
		});

		await models.BlockNotes.addCalendarNotes({
			system: false,
			description: note,
			userId,
			items,
			blockId,
		});
	}

	return blockId;
}

async function getServiceFees(bookingIds) {
	if (!_.isEmpty(bookingIds)) {
		const rs = {};
		const serviceFees = await models.ServiceFee.find({ bookingId: bookingIds, deleted: false })
			.select('amount quantity serviceType unitPrice bookingId')
			.lean();
		const grByServiceFee = _.groupBy(serviceFees, sf => `${sf.bookingId}&${sf.serviceType}`);

		_.forIn(grByServiceFee, (value, key) => {
			const [bookingId, serviceType] = key.split('&');
			const quantity = _.sumBy(value, 'quantity');
			const unitPrice = _.sumBy(value, 'unitPrice') / value.length;
			const amount = _.sumBy(value, 'amount');
			const unit = models.ServiceFee.getUnitByServiceType(serviceType);

			_.set(rs, [bookingId, serviceType], {
				quantity,
				unitPrice,
				amount,
				unit,
			});
		});
		return rs;
	}
}

module.exports = {
	getRoomSchedule,
	getBlockSchedule,
	getScheduleDetail,
	lockRoom,
	requestAccessSchedule,
};

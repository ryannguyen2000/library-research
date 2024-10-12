const { v4: uuid } = require('uuid');
const _ = require('lodash');
// const moment = require('moment');
const mongoose = require('mongoose');

function getScheduleBookings({ blockId, roomIds, from, to }) {
	return mongoose
		.model('BlockScheduler')
		.aggregate()
		.match({ blockId, date: _.pickBy({ $gte: from, $lte: to }) })
		.unwind('$reservations')
		.match({ 'reservations.roomId': { $in: roomIds } })
		.group({
			_id: '$reservations.roomId',
			bookingIds: { $addToSet: '$reservations.bookingId' },
			dates: { $addToSet: '$date' },
		})
		.then(rooms => _.keyBy(rooms, '_id'));
}

function getScheduleLocked({ blockId, roomIds, from, to }) {
	return mongoose
		.model('BlockScheduler')
		.aggregate()
		.match({ blockId, date: _.pickBy({ $gte: from, $lte: to }) })
		.unwind('$lockedRoomIds')
		.match({ lockedRoomIds: { $in: roomIds } })
		.group({ _id: '$lockedRoomIds', dates: { $addToSet: '$date' } })
		.then(rs => _.keyBy(rs, '_id'));
}

async function getLockedRooms(blockId, roomIds, from, to) {
	const relationRooms = {};
	const relationRoomIds = [];

	await roomIds.asyncMap(async roomId => {
		const relations = await mongoose.model('Room').getRelationsRooms(roomId);
		relationRooms[roomId] = relations.filter(r => !r.equals(roomId));
		relationRoomIds.push(...relationRooms[roomId]);
	});

	const lockedRooms = await getScheduleLocked({ blockId, roomIds: [...roomIds, ...relationRoomIds], from, to });
	const relationBookingRooms = await getScheduleBookings({ blockId, roomIds: relationRoomIds, from, to });

	_.forEach(relationRooms, (relations, roomId) => {
		lockedRooms[roomId] = lockedRooms[roomId] || { _id: roomId, dates: [] };

		relations.forEach(relationRoom => {
			if (lockedRooms[relationRoom]) {
				lockedRooms[roomId].dates.push(...lockedRooms[relationRoom].dates);
			}
			// lock room if relation room have booking
			if (relationBookingRooms[relationRoom]) {
				lockedRooms[roomId].dates.push(...relationBookingRooms[relationRoom].dates);
			}
			lockedRooms[roomId].dates = _.uniq(lockedRooms[roomId].dates).sort();
		});
	});

	return lockedRooms;
}

async function getAvailableBookings(listingId, from, to) {
	const listing = await mongoose.model('Listing').findById(listingId).select('blockId roomIds');

	const roomIds = listing ? listing.roomIds : [];
	if (!roomIds.length) return null;

	const roomsHaveBooking = await getScheduleBookings({ blockId: listing.blockId, roomIds, from, to });
	const rooms = roomIds.map(rid => roomsHaveBooking[rid] || { _id: rid, bookingIds: [] });

	const bookingIds = Array.chain(...rooms.map(room => room.bookingIds));
	const bookings = await mongoose
		.model('Booking')
		.find({ _id: bookingIds })
		.select('_id from to amount')
		.sort({ to: 1 });

	const maxDate = bookings.length ? _.last(bookings).to : to;

	const lockedRooms = await getLockedRooms(listing.blockId, roomIds, from, maxDate);

	const lookupBookings = _.keyBy(bookings, '_id');
	const lookupSlots = {};

	for (let room of rooms) {
		// all locked dates of room, convert to map
		room.lockedDates = {};
		if (lockedRooms[room._id]) {
			lockedRooms[room._id].dates.forEach(date => {
				room.lockedDates[date] = 1;
			});
		}

		// convert `bookingIds` to `bookings`
		// room.bookings = room.bookingIds.map(bookingId => lookupBookings[bookingId]);
		// room.bookings.forEach(booking => booking.roomId = room._id);
		// room.bookings.sort((b1, b2) => b1.from - b2.from);
		// delete room.bookingIds;

		room.slots = room.bookingIds.map(bookingId => {
			const booking = lookupBookings[bookingId];
			const slot = {
				from: booking.from,
				to: booking.to,
				// ...booking,
				_id: uuid(), // auto generate id,
				bookingId: booking._id,
				roomId: room._id,
			};
			lookupSlots[slot._id] = slot;
			return slot;
		});
		room.slots.sort((s1, s2) => s1.from - s2.from);
		delete room.bookingIds;
		delete room.dates;
	}

	return { lookupSlots, rooms };
}

// check date is full
function isFull(room, date) {
	// prettier-ignore
	return room.lockedDates[date] > 0 
		|| _.some(room.slots, ({ from, to }) => from <= date && to > date)
}

// date range generator
function* dateRange({ from, to }) {
	for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) yield d;
}

function available(newBooking, rooms) {
	for (const date of dateRange(newBooking)) {
		if (rooms.filter(room => !isFull(room, date)).length < newBooking.amount) return false;
	}
	return true;
}

function forEachDate(range, callback) {
	for (const d of dateRange(range)) callback(d);
}

function lockRoom(room, range) {
	forEachDate(range, d => {
		room.lockedDates[d] = (room.lockedDates[d] || 0) + 1;
	});
}

function unlockRom(room, range) {
	forEachDate(range, d => {
		room.lockedDates[d] -= 1;
	});
}

// the room that `from` < now can not move
function lockedSomeBookings(rooms, now) {
	rooms.forEach(room => {
		room.slots.filter(({ from }) => from < now).forEach(slot => lockRoom(room, slot));
	});
}

// get the number of free date in [from, to)
function getFreeDates(room, range) {
	let freeDateCount = 0;
	forEachDate(range, date => {
		freeDateCount += isFull(room, date) ? 0 : 1;
	});
	return freeDateCount;
}

function reserve(slots, rooms, expired) {
	if (!slots.length) return { moves: {}, count: 0 };
	let theBest = { moves: {}, count: Number.MAX_SAFE_INTEGER };

	if (new Date() >= expired) return theBest;

	const { _id, from, to } = slots[0];

	// clone rooms for sort for each functions
	rooms = [...rooms].sort((r1, r2) => getFreeDates(r2, { from, to }) - getFreeDates(r1, { from, to }));

	for (const room of rooms) {
		// check phòng không phục vụ được thì bỏ qua
		if (
			Object.entries(room.lockedDates)
				.map(([stDate, count]) => [new Date(stDate), count])
				.some(([lockDate, count]) => count > 0 && lockDate >= from && lockDate < to)
		)
			continue;

		const roomSlots = room.slots;

		const crossSlots = roomSlots.filter(b => !(b.to <= from || to <= b.from));
		const remainSlots = [...slots.slice(1), ...crossSlots];

		if (remainSlots.length + 1 >= theBest.count) continue;
		room.slots = roomSlots.filter(b => !crossSlots.includes(b));

		// lock [from, to)
		lockRoom(room, { from, to });

		const next = reserve(remainSlots, rooms, expired);
		if (next.count < theBest.count - 1) {
			theBest = {
				moves: { ...next.moves, [_id]: room._id },
				count: next.count + 1,
			};
		}

		// recovery bookings
		room.slots = roomSlots;

		// unlock room
		unlockRom(room, { from, to });
	}
	return theBest;
}

async function findBest(listingId, newBooking, timeOut = 5) {
	const now = new Date().zeroHours();

	let expired = new Date();
	expired.setSeconds(expired.getSeconds() + timeOut);

	const { from } = newBooking;
	let { lookupSlots, rooms } = await getAvailableBookings(listingId, now);
	// console.log('slots', JSON.stringify(lookupSlots));
	// console.log('rooms', rooms.map(r => JSON.stringify(r)));

	if (from < now) return null;
	if (!available(newBooking, rooms)) return null;

	// let swaps = findRoom(newBooking, rooms);
	// if (swaps) return swaps;

	lockedSomeBookings(rooms, now);
	// console.log('allReserved', allReserved);

	const newSlots = Array.range(newBooking.amount).map(i => {
		const slot = {
			// ...newBooking,
			from: newBooking.from,
			to: newBooking.to,
			_id: uuid(), // auto generate id,
			bookingId: newBooking._id,
		};
		lookupSlots[slot._id] = slot;
		return slot;
	});

	const theBest = reserve(newSlots, rooms, expired);

	if (theBest.count === Number.MAX_SAFE_INTEGER || _.isEmpty(theBest.moves)) return null;

	const swaps = _.entries(theBest.moves).map(([sid, rid]) => ({
		_id: lookupSlots[sid].bookingId,
		oldRoomId: lookupSlots[sid].roomId,
		newRoomId: rid,
		from: lookupSlots[sid].from,
		to: lookupSlots[sid].to,
	}));

	return swaps;
}

module.exports = {
	rearrangeBooking: findBest,
};

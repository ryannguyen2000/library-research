const moment = require('moment');
const _ = require('lodash');

const models = require('@models');
const Booking = require('@controllers/booking');
const { reservateMonth } = require('@src/controllers/booking/reservate');
const { updateDoc } = require('@utils/schema');
const { ContractStatus, BookingStatus, CONTRACT_CALC_TYPE, Services, WATER_FEE_CALC_TYPE } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const { changeBooking, splitReservation } = require('@controllers/booking/reservation');

async function cancelContract(booking, body, user) {
	const { contractId, reason } = body;

	const contract = await models.BookingContract.findOne({
		_id: contractId,
		status: { $ne: ContractStatus.CANCELED },
	});
	if (!contract) throw new ThrowReturn('Contract does not exist');

	const _booking = await models.Booking.findOne({
		_id: { $in: contract.bookingIds },
		checkedIn: true,
	}).select('_id');
	if (_booking) throw new ThrowReturn('Contract with at least 1 booking checked-in');

	await Booking.cancelBookings(contract.bookingIds, {}, user._id);

	contract.$locals.userId = user._id;
	contract.$locals.reason = reason;

	Object.assign(contract, {
		status: ContractStatus.CANCELED,
		canceledAt: new Date(),
		canceledBy: user._id,
	});
	await contract.save();
}

async function updatePrice(booking, body, user) {
	const { price, from, defaultWaterPrice, waterPricePerM3, electricPricePerKwh, waterFeeCalcType } = body;

	let contract = await models.BookingContract.findOne({
		bookingIds: booking._id,
		status: ContractStatus.CONFIRMED,
	});

	if (!contract) throw new ThrowReturn('Contract does not exist');

	// Update contract
	const updatingKeys = [
		'autoExtend',
		'price',
		'originPrice',
		'deposit',
		'discount',
		'electricPricePerKwh',
		'defaultWaterPrice',
		'waterPricePerM3',
		'note',
		'cleaningPerWeek',
		'sale',
		'contractType',
		'waterFeeCalcType',
	];

	contract.$locals.userId = user._id;

	updatingKeys.forEach(key => {
		const contractValue = _.get(contract, key);
		const bodyValue = _.get(body, key);
		const isUpdated = _.toString(contractValue) !== _.toString(bodyValue);

		if (isUpdated) {
			contract.$locals[`pre${key}`] = contractValue;
		}
	});

	await updateDoc(contract, _.pick(body, updatingKeys));

	const isEndOfMonthCalcType = CONTRACT_CALC_TYPE.toEndOfMonth === contract.calcType;

	// Update bookings
	const fromQuery = isEndOfMonthCalcType
		? { $gte: from ? moment(from).startOf('month').toDate() : moment().startOf('month').toDate() }
		: { $gte: from ? new Date(from).minTimes() : new Date().minTimes() };

	const bookings = await models.Booking.find({
		_id: { $in: contract.bookingIds },
		status: BookingStatus.CONFIRMED,
		from: fromQuery,
		checkedIn: false,
	});
	await bookings.asyncMap(async _booking => {
		const update = {};

		if (_.isNumber(waterPricePerM3)) update.waterPricePerM3 = waterPricePerM3;
		if (_.isNumber(waterFeeCalcType)) update.waterFeeCalcType = waterFeeCalcType;
		if (
			_booking.waterFeeCalcType === WATER_FEE_CALC_TYPE.DEFAULT ||
			waterFeeCalcType === WATER_FEE_CALC_TYPE.DEFAULT
		) {
			if (_.isNumber(defaultWaterPrice)) update.waterFee = defaultWaterPrice;
		}
		if (_.isNumber(electricPricePerKwh)) update.electricPricePerKwh = electricPricePerKwh;
		if (_.isNumber(price) && from) {
			const cdays = moment(_booking.to).diff(_booking.from, 'days');
			const days = isEndOfMonthCalcType
				? moment(_booking.from).daysInMonth()
				: moment(_booking.from).add(1, 'month').diff(_booking.from, 'days');

			const newRoomPrice = _.round((price / days) * cdays);
			update.roomPrice = newRoomPrice;
		}

		return _booking.updateBookingProperties(update, user._id);
	});
}

async function updateRange(booking, body, user) {
	const userId = _.get(user, '_id');
	body.endDate = new Date(body.endDate).zeroHours();

	const { endDate, roomId: _roomId, contract: _contract } = body;

	const contract =
		_contract ||
		(await models.BookingContract.findOne({
			bookingIds: booking._id,
			status: ContractStatus.CONFIRMED,
		}));

	if (!contract) throw new ThrowReturn('Contract does not exist');
	if (!endDate || moment(endDate).isSameOrBefore(contract.startDate, 'date'))
		throw new ThrowReturn('EndDate invalid');

	let newBookingIds;
	const price = contract.price || 0;
	const isEndOfMonthCalcType = CONTRACT_CALC_TYPE.toEndOfMonth === contract.calcType;

	if (moment(endDate).isSameOrBefore(contract.endDate, 'date')) {
		const dateQuery = {
			from: { $lte: new Date(endDate).zeroHours() },
			to: { $gt: new Date(endDate).zeroHours() },
		};
		const _bookings = await models.Booking.find({
			_id: { $in: contract.bookingIds },
			status: BookingStatus.CONFIRMED,
			...dateQuery,
		});

		const _booking = _bookings.find(_b => moment(_b.from).isSameOrBefore(endDate, 'date'));
		if (!_booking) throw new ThrowReturn('Booking does not exist');

		if (moment(endDate).isSameOrAfter(_booking.from, 'date')) {
			const newBookingTo = moment(_booking.to).isSame(endDate, 'date')
				? endDate
				: moment(endDate).add(1, 'day').toDate();

			const days = isEndOfMonthCalcType
				? moment(_booking.from).daysInMonth()
				: moment(_booking.from).add(1, 'month').diff(_booking.from, 'days');

			const cdays = moment(newBookingTo).diff(_booking.from, 'days');

			await models.BlockScheduler.clearReservations({
				bookingId: _booking._id,
				blockId: _booking.blockId,
				rooms: _booking.reservateRooms,
				from: new Date(newBookingTo),
				to: booking.to,
				checkout: true,
			});

			const newRoomPrice = _.round((contract.price / days) * cdays);
			await _booking.updateBookingProperties({ to: new Date(newBookingTo), roomPrice: newRoomPrice }, userId);
		}

		await Booking.cancelBookings(contract.bookingIds, { from: { $gt: endDate } }, userId);
	} else if (moment(endDate).isAfter(contract.endDate, 'date')) {
		const lastBooking = await models.Booking.findOne({
			_id: { $in: contract.bookingIds },
			status: BookingStatus.CONFIRMED,
			error: 0,
		}).sort({ to: -1 });
		if (!lastBooking) throw new ThrowReturn('Contract invalid');

		const roomId = _roomId || _.get(lastBooking, 'reservateRooms[0]');

		// const _from = isEndOfMonthCalcType
		// 	? moment(lastBooking.from).add(1, 'month').set('date', 1)
		// 	: moment(lastBooking.from).add(1, 'month');

		const isAvailableRoom = await models.BlockScheduler.isRoomAvailable(
			roomId,
			booking.blockId,
			lastBooking.to, // from
			new Date(endDate) // to
		);
		if (!isAvailableRoom) throw new ThrowReturn('Room not availables');

		// if (moment(lastBooking.to).isBefore(_from, 'date')) {
		// 	const _to = moment(endDate).isBefore(_from, 'month') ? moment(endDate).add(1, 'days') : _from;
		// 	const days = isEndOfMonthCalcType
		// 		? moment(lastBooking.from).daysInMonth()
		// 		: moment(lastBooking.from).add(1, 'month').diff(lastBooking.from, 'days');

		// 	await models.BlockScheduler.reservateRooms(
		// 		lastBooking._id,
		// 		lastBooking.blockId,
		// 		lastBooking.reservateRooms,
		// 		lastBooking.from, // from
		// 		_to.toDate() // to
		// 	);

		// 	const cdays = moment(_to).diff(lastBooking.from, 'days');
		// 	const newRoomPrice = _.round((contract.price / days) * cdays);

		// 	await lastBooking.updateBookingProperties({ to: new Date(_to), roomPrice: newRoomPrice }, user);
		// }

		if (moment(endDate).isSameOrAfter(lastBooking.to, 'month')) {
			const reservate = {
				calcType: contract.calcType,
				status: BookingStatus.CONFIRMED,
				serviceType: booking.serviceType,
				guestId: booking.guestId,
				otaName: booking.otaName,
				blockId: booking.blockId,
				relativeBookingId: booking.otaBookingId,
				amount: booking.amount,
				sale: contract.sale,
				from: lastBooking.to,
				to: endDate,
				rooms: [roomId],
				price,
				defaultWaterPrice: contract.defaultWaterPrice,
				electricPricePerKwh: contract.electricPricePerKwh,
			};

			newBookingIds = await reservateMonth(reservate, user);
		}
	}

	// Update contract
	contract.$locals.userId = userId;

	['endDate'].forEach(key => {
		const contractValue = _.get(contract, key);
		const bodyValue = _.get(body, key);
		const isUpdated = _.toString(new Date(bodyValue).minTimes()) !== _.toString(new Date(contractValue).minTimes());

		if (isUpdated) {
			contract.$locals[`pre${key}`] = moment(contractValue).toISOString();
		}
	});

	if (!_.isEmpty(newBookingIds)) _.set(body, 'bookingIds', [...contract.bookingIds, ...newBookingIds]);
	await updateDoc(contract, _.pick(body, ['endDate', 'bookingIds']));
}

async function changeRoom(booking, body, user) {
	const { roomId, from } = body;
	if (!roomId) throw new ThrowReturn('roomId does not exist');

	const contract = await models.BookingContract.findOne({
		bookingIds: booking._id,
		status: ContractStatus.CONFIRMED,
	});

	if (!contract) throw new ThrowReturn('Contract does not exist');

	if (!from || !moment(new Date(from)).isBetween(contract.startDate, contract.endDate, 'date', '[]')) {
		throw new ThrowReturn('From invalid');
	}

	const isAvailableRoom = await models.BlockScheduler.isRoomAvailable(
		roomId,
		booking.blockId,
		new Date(from), // from
		new Date(contract.endDate), // to
		{
			excludeBookingIds: contract.bookingIds,
		}
	);

	if (isAvailableRoom) {
		const bookings = await models.Booking.find({
			_id: { $in: contract.bookingIds },
			status: { $ne: BookingStatus.CANCELED },
			to: { $gt: new Date(from).zeroHours() },
		});
		const preRoomId = _.get(bookings, '[0]reservateRooms[0]');
		try {
			if (!_.isEmpty(bookings)) {
				await bookings.asyncForEach(async b => {
					const isChange = !_.includes(
						_.map(b.reservateRooms, _b => _b.toString()),
						roomId
					);
					const isSplitBooking = moment(new Date(from)).isBetween(b.from, b.to, 'date', '()');
					if (isSplitBooking && isChange) {
						const newSplBId = _.last(await splitReservation(b._id, from, user._id));
						if (newSplBId) {
							const _b = await models.Booking.findById(newSplBId);
							await changeBooking({
								booking: _b,
								firstRooms: _b.reservateRooms,
								changeToRoomIds: [roomId],
								newRoomSize: null,
								newCheckIn: _b.from,
								newCheckOut: _b.to,
								userId: user._id,
							});
						}
					}
					if (!isSplitBooking && isChange) {
						await changeBooking({
							booking: b,
							firstRooms: b.reservateRooms,
							changeToRoomIds: [roomId],
							newRoomSize: null,
							newCheckIn: b.from,
							newCheckOut: b.to,
							userId: user._id,
						});
					}
				});
				// Add log
				const [preRoom, newRoom] = await Promise.all([
					models.Room.findById(preRoomId).select('info').lean(),
					models.Room.findById(roomId).select('info').lean(),
				]);
				models.BookingContract.addLog({
					userId: user._id,
					contractId: contract._id,
					prevData: preRoom.info.roomNo || '',
					data: newRoom.info.roomNo || '',
					action: 'CONTRACT_UPDATE_CHANGE_ROOM',
				});
			}
		} catch (err) {
			throw new ThrowReturn(err);
		}
	} else {
		throw new ThrowReturn('Room not available');
	}
}

async function getContracts(user, { roomId, from, to, start, limit }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;

	const filter = {};

	if (roomId) {
		const { filters } = await models.Host.getBlocksOfUser({
			user,
			roomKey: 'reservateRooms',
		});

		const bookings = await models.Booking.find({
			...filters,
			reservateRooms: roomId,
			serviceType: Services.Month,
		})
			.select('_id')
			.lean();

		const bookingIds = _.map(bookings, '_id');
		_.set(filter, 'bookingIds', { $in: bookingIds });
	}

	if (from) _.set(filter, 'startDate', { $gte: new Date(from).minTimes() });
	if (to) _.set(filter, 'endDate', { $lte: new Date(to).maxTimes() });

	const [contracts, total] = await Promise.all([
		models.BookingContract.find(filter)
			.sort({ startDate: -1 })
			.skip(start)
			.limit(limit)
			.populate('canceledBy histories.by', 'username name'),
		models.BookingContract.countDocuments(filter),
	]);

	return { contracts, total };
}

module.exports = {
	cancelContract,
	updatePrice,
	updateRange,
	changeRoom,
	getContracts,
};

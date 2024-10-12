const moment = require('moment');
const mongoose = require('mongoose');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { ReservateCalendarLock } = require('@utils/lock');
const {
	BookingStatus,
	Errors,
	LocalOTAs,
	TaskTags,
	OTAs,
	Services,
	EXTRA_FEE,
	RuleDay,
	TaskStatus,
	ContractStatus,
	BookingStatusCanceled,
} = require('@utils/const');
const { getArray } = require('@utils/query');
const mongoUtils = require('@utils/mongo');
const { roundTime } = require('@utils/date');

const ServiceFee = require('@controllers/booking/service_fee');
const Reservation = require('@controllers/booking/reservation');
const models = require('@models');

const { downloadContract } = require('./download_contract/index');

async function getParams(query, user) {
	let {
		error,
		blockId,
		roomIds,
		listingId,
		from,
		to,
		start,
		limit,
		otas,
		status,
		sort,
		desc,
		type,
		search,
		meals,
		guestOtas,
		ignorePrice,
		ignoreGuide,
		nonRefundable,
		canceledByType,
		canceledBy,
		markOnOTA,
		rateType,
		checkList,
		autoTemplate,
		autoCheckin,
		autoCheckout,
		serviceType,
		otaBookingId,
		excludeBlockId,
	} = query;

	search = _.trim(search);
	otaBookingId = _.trim(otaBookingId);
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;
	serviceType = parseInt(serviceType) || null;
	sort = sort || 'createdAt';
	desc = desc || '1';
	from = from && new Date(from).minTimes();
	to = to && new Date(to).maxTimes();

	const { filters: roleFilters, blockIds } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
		roomKey: 'reservateRooms',
	});

	const filter = {
		$and: [roleFilters],
	};
	if (otas) {
		otas = await models.BookingSource.getSourceByGroup(getArray(otas));
		filter.otaName = { $in: otas };
	}
	if (otaBookingId) {
		filter.otaBookingId = _.toUpper(otaBookingId);
	}
	if (error) {
		filter.error = error === 'true' ? Errors.RoomNotAvailable : 0;
	}
	if (checkList === 'true') {
		const sources = await models.BookingSource.find({
			group: 'OTA',
			name: { $nin: [..._.values(LocalOTAs), OTAs.Famiroom] },
		}).select('name');
		const otaList = _.map(sources, 'name');
		const otaFilters = _.get(filter.otaName, '$in');
		_.set(filter, ['otaName', '$in'], otaFilters ? _.intersection(otaList, otaFilters) : otaList);
		_.set(filter, ['serviceType', '$ne'], Services.Month);
	}
	if (search) {
		const guestIds = await models.Guest.findByKeyword(search)
			.group({
				_id: null,
				ids: { $push: '$_id' },
			})
			.then(rs => _.get(rs, [0, 'ids'], []));
		filter.$or = [
			{ guestId: { $in: guestIds } },
			{ guestIds: { $in: guestIds } },
			{ otaBookingId: new RegExp(`^${_.escapeRegExp(_.toUpper(search))}`) },
		];
	}
	if (roomIds) _.set(filter, 'reservateRooms.$in', getArray(roomIds).toMongoObjectIds());
	if (listingId) filter.listingId = mongoose.Types.ObjectId(listingId);
	if (guestOtas) filter.guestOta = { $in: getArray(guestOtas) };
	if (meals === 'breakfast') filter['rateDetail.breakfastIncluded'] = true;
	if (markOnOTA) {
		filter.markOnOTA = markOnOTA === 'true' ? { $ne: null } : null;
	}
	const andCondition = [];
	const dateQuery = [];
	const statusQuery = [];

	if (status) {
		if (status.includes(BookingStatus.REQUEST)) {
			statusQuery.push({ status: BookingStatus.REQUEST });
		}
		if (status.includes(BookingStatus.CANCELED)) {
			const filterCanceled = {
				status: BookingStatus.CANCELED,
			};
			if (canceledByType) {
				filterCanceled['canceledBy.type'] = _.isArray(canceledByType)
					? { $in: canceledByType }
					: canceledByType;
			}
			if (canceledBy) {
				filterCanceled['canceledBy.by'] = canceledBy;
			}
			statusQuery.push(filterCanceled);
		}
		if (status.includes(BookingStatus.REQUEST)) {
			statusQuery.push({ status: BookingStatus.REQUEST });
		}
		if (status.includes(BookingStatus.CHARGED)) {
			statusQuery.push({ status: BookingStatus.CHARGED });
		}
		if (status.includes(BookingStatus.CONFIRMED)) {
			statusQuery.push({
				status: BookingStatus.CONFIRMED,
				checkedIn: false,
			});
		}
		if (status.includes('checkin')) {
			statusQuery.push({
				checkedIn: true,
				checkedOut: false,
			});
		}
		if (status.includes('checkout')) {
			statusQuery.push({
				checkedOut: true,
			});
		}
		if (status.includes(BookingStatus.NOSHOW)) {
			const today = new Date().zeroHours();
			const hours = moment().format('HH:mm');
			if (hours < RuleDay.from) {
				today.setDate(today.getDate() - 1);
			}
			statusQuery.push({
				status: BookingStatus.CONFIRMED,
				checkedIn: false,
				from: { $lt: today },
			});
			statusQuery.push({ status: BookingStatus.NOSHOW });
		}
		if (status.includes('cuttrip')) {
			statusQuery.push({
				status: BookingStatus.CONFIRMED,
				manual: true,
				'relativeBookings.0': { $exists: true },
			});
		}
	}

	const timeFilter = _.pickBy({ $gte: from, $lte: to });
	if (type) {
		if (type.includes('checkin_today')) {
			filter.from = new Date().zeroHours();
			filter.status = BookingStatus.CONFIRMED;
		} else if (type.includes('checkin')) {
			filter.from = timeFilter;
		}
		if (type.includes('checkout_today')) {
			filter.to = new Date().zeroHours();
			filter.status = BookingStatus.CONFIRMED;
		} else if (type.includes('checkout')) {
			filter.to = timeFilter;
		}
		if (type.includes('staying')) {
			filter.from = new Date().zeroHours();
			filter.status = BookingStatus.CONFIRMED;
			filter.checkedIn = true;
			filter.checkedOut = false;
		}
		if (type.includes('createdAt')) {
			filter.createdAt = timeFilter;
		}
		if (type.includes('canceledAt')) {
			filter.canceledAt = timeFilter;
		}
	} else if (from || to) {
		dateQuery.push({ createdAt: timeFilter }, { from: timeFilter }, { to: timeFilter });
	}

	if (ignorePrice) {
		const today = new Date().zeroHours();
		const checkBlocks = await models.Block.getCheckPrices();
		_.set(filter, 'blockId.$in', _.intersectionBy(checkBlocks, blockIds, _.toString));
		_.assign(filter, {
			from: { $lte: today, $gte: moment(today).add(-1, 'month').toDate() },
			isPaid: false,
			status: BookingStatus.CONFIRMED,
			ignorePrice: ignorePrice === 'true',
		});
	}
	if (ignoreGuide) {
		const today = new Date().zeroHours();
		const checkBlocks = await models.Block.getCheckGuides();
		_.set(filter, 'blockId.$in', _.intersectionBy(checkBlocks, blockIds, _.toString));
		_.assign(filter, {
			from: today,
			status: BookingStatus.CONFIRMED,
			ignoreGuide: ignoreGuide === 'true',
		});
	}
	if (nonRefundable) {
		filter['rateDetail.isNonRefundable'] = nonRefundable === 'true' ? true : { $ne: true };
	}
	if (rateType) {
		filter.rateType = rateType;
	}
	if (serviceType) {
		_.set(filter, 'serviceType.$eq', serviceType);
	}
	if (autoTemplate) {
		autoTemplate = _.isArray(autoTemplate) ? autoTemplate : [autoTemplate];
		filter.doneTemplate = { $nin: autoTemplate };
	}
	if (autoCheckin) {
		filter.checkedIn = true;
		filter.checkinType = autoCheckin === 'true' ? { $ne: null } : null;
	}
	if (autoCheckout) {
		filter.checkedOut = true;
		filter.checkoutType = autoCheckout === 'true' ? { $ne: null } : null;
	}

	if (statusQuery.length) andCondition.push({ $or: statusQuery });
	if (dateQuery.length) andCondition.push({ $or: dateQuery });
	if (andCondition.length) filter.$and = [...filter.$and, ...andCondition];

	const params = {
		start,
		limit,
		filter,
	};

	if (!search && !otaBookingId) {
		const sortParams = {
			checkin: 'from',
			checkout: 'to',
		};
		params.sorter = {
			[sortParams[sort] || (filter.error ? 'updatedAt' : sort)]: desc === '1' ? -1 : 1,
		};
	}

	return params;
}

async function getBookings(query, user) {
	const { start, limit, filter, sorter } = await getParams(query, user);

	// const pineline = _.compact([
	// 	{ $match: filter },
	// 	sorter && { $sort: sorter },
	// 	{ $skip: start },
	// 	{ $limit: limit },
	// 	...mongoUtils.genSelect('-histories -upc'),
	// 	...mongoUtils.genLookupAndSelect({
	// 		name: 'reservation',
	// 		local: '_id',
	// 		foreign: 'bookingId',
	// 		as: 'roomIds',
	// 		match: {
	// 			$expr: { $eq: ['$bookingId', '$$id'] },
	// 		},
	// 		extPipeline: [
	// 			...mongoUtils.genLookupAndSelect({
	// 				name: 'room',
	// 				local: 'roomId',
	// 				foreign: '_id',
	// 				as: 'room',
	// 				unwind: true,
	// 				select: 'info.name info.roomNo',
	// 			}),
	// 		],
	// 		select: `_id:$room._id info:$room.info checkin:@@{"$min":"$guests.checkin"} checkout:@@{"$min":"$guests.checkout"}`,
	// 	}),
	// ]);

	const lir = models.Booking.find(filter);

	if (sorter) {
		lir.sort(sorter);
	}

	lir.skip(start).limit(limit).select('-histories -upc');

	const [bookings, total] = await Promise.all([lir.lean(), models.Booking.countDocuments(filter)]);

	const result = {
		bookings,
		total,
	};

	if (bookings.length) {
		const bookingIds = bookings.map(b => b._id);

		const reservations = await models.Reservation.aggregate([
			{ $match: { bookingId: { $in: bookingIds } } },
			...mongoUtils.genLookupAndSelect({
				name: 'room',
				local: 'roomId',
				foreign: '_id',
				as: 'room',
				unwind: true,
				select: 'info.name info.roomNo',
			}),
			...mongoUtils.genSelect(
				`bookingId:$bookingId roomId:$roomId info:$room.info checkin:@@{"$min":"$guests.checkin"} checkout:@@{"$min":"$guests.checkout"}`
			),
		]);

		const groups = _.groupBy(reservations, 'bookingId');

		bookings.forEach(b => {
			b.roomIds = _.map(groups[b._id], res => ({
				...res,
				_id: res.roomId,
			}));
		});

		await models.Booking.populate(bookings, [
			{
				path: 'guestId guestIds',
				select: 'name fullName displayName avatar tags',
				options: { lean: true },
			},
			{
				path: 'markOnOTA.by',
				select: 'username name',
				options: { lean: true },
			},
		]);

		const bookingsNotHaveRoomIds = bookings.filter(
			booking => booking.reservateRooms.length && !booking.roomIds.length
		);
		if (bookingsNotHaveRoomIds.length) {
			await models.Booking.populate(bookingsNotHaveRoomIds, {
				path: 'reservateRooms',
				select: 'info.name info.roomNo',
				options: { lean: true },
			});
			bookingsNotHaveRoomIds.forEach(booking => {
				booking.roomIds = booking.reservateRooms;
				booking.reservateRooms = _.map(booking.reservateRooms, '_id');
			});
		}

		[result.payments, result.tasks] = await Promise.all([findPayments(bookingIds), findVATTasks(bookingIds)]);
	}

	return result;
}

async function findVATTasks(bookingIds) {
	const rs = {};

	const taskVAT = await models.TaskCategory.findOne({ tag: TaskTags.VAT });

	if (taskVAT) {
		const tasks = await models.Task.find({
			category: taskVAT._id,
			bookingId: { $in: bookingIds },
			status: { $ne: TaskStatus.Deleted },
		}).select('bookingId');

		tasks.forEach(task => {
			_.forEach(task.bookingId, bid => {
				rs[bid] = task._id;
			});
		});
	}

	return rs;
}

async function findPayments(bookingIds) {
	const payouts = await models.Payout.getBookingPayouts(bookingIds, false, true);
	return _.groupBy(payouts, 'bookingId');
}

async function getBooking(booking) {
	await models.Booking.populate(booking, [
		{
			path: 'guestId guestIds',
			select: '-histories',
		},
		{
			path: 'listingId',
			select: 'name OTAs.otaName OTAs.otaListingId roomIds',
		},
		{
			path: 'histories.by histories.removedBy histories.updatedBy hosting markOnOTA.by',
			select: 'username name role',
		},
		{
			path: 'histories.workNote',
			populate: {
				path: 'createdBy log.user',
				select: 'name username',
			},
		},
		{
			path: 'histories.requestId',
			select: 'reasonId reasonOther',
			populate: {
				path: 'reasonId',
				select: 'label',
			},
		},
	]);

	booking = booking.toJSON();

	let serviceFees;
	if (booking.serviceType === Services.Month) {
		serviceFees = await ServiceFee.getServiceFeesByBookingId(booking._id);
	}

	booking.guestId.blacklist = await models.GuestBlacklist.getBlacklist(booking.guestId);
	booking.guestIds = await booking.guestIds.asyncMap(async g => {
		g.blacklist = await models.GuestBlacklist.getBlacklist(g);
		return g;
	});

	if (booking.listingId) {
		booking.listingId.OTAs = booking.listingId.OTAs.filter(o => o.otaName === booking.otaName);
	}

	const [reservateRooms, block, payment] = await Promise.all([
		models.Reservation.getReservatedRoomsDetails(booking._id),
		models.Block.findById(booking.blockId).select('info.name info.address OTAProperties'),
		models.Payout.getBookingPayouts([booking._id, ...booking.relativeBookings]),
	]);

	if (booking.status === BookingStatus.REQUEST) {
		const message = await models.Messages.findById(booking.messages).select('inquiry');
		if (message) booking.inquiry = message.inquiry;

		const roomIds = booking.listingId && booking.listingId.roomIds;
		if (roomIds && roomIds.length) {
			await updateBookingErrorAndAvailableRooms(booking, roomIds, booking.blockId);
		}
	}
	if (!reservateRooms.length && booking.reservateRooms.length) {
		const rooms = await models.Room.find({ _id: booking.reservateRooms }).select('info blockId').lean();
		const totalRoom = rooms.length;
		const prices = {
			price: booking.price / totalRoom,
			roomPrice: booking.roomPrice / totalRoom,
			..._.values(EXTRA_FEE).reduce((o, c) => ({ ...o, [c]: booking[c] / totalRoom }), {}),
		};

		reservateRooms.push(
			...rooms.map(r => ({
				...r,
				bookingId: booking.id,
				...prices,
			}))
		);
	}

	return { booking, reservateRooms, block, payment, serviceFees };
}

async function getNotifications(user) {
	// const today = new Date().zeroHours();

	// const checkPrices = await models.Block.getCheckPrices();
	// const checkGuides = await models.Block.getCheckGuides();

	const { filters } = await models.Host.getBlocksOfUser({ user, roomKey: 'reservateRooms' });

	// const [errors, prices, guides] = await Promise.all([
	// 	models.Booking.countDocuments({
	// 		...filters,
	// 		error: Errors.RoomNotAvailable,
	// 		ignoreError: false,
	// 	}),
	// 	models.Booking.countDocuments({
	// 		...filters,
	// 		error: 0,
	// 		status: BookingStatus.CONFIRMED,
	// 		from: { $lte: today, $gte: moment(today).add(-1, 'month').toDate() },
	// 		ignorePrice: false,
	// 		isPaid: false,
	// 		blockId: _.intersectionBy(checkPrices, blockIds, _.toString),
	// 	}),
	// 	models.Booking.countDocuments({
	// 		...filters,
	// 		error: 0,
	// 		status: BookingStatus.CONFIRMED,
	// 		from: today,
	// 		ignoreGuide: false,
	// 		blockId: _.intersectionBy(checkGuides, blockIds, _.toString),
	// 	}),
	// ]);

	const errors = await models.Booking.countDocuments({
		...filters,
		error: Errors.RoomNotAvailable,
		ignoreError: false,
	});

	return { errors };
}

async function updateBookingCommission({ user, booking, otaFee }) {
	await booking.updateBookingProperties({ otaFee }, user._id);

	return { booking: _.pick(booking, ['otaFee']) };
}

async function getPreviousQuantity(booking, type) {
	if (!['water', 'electricity'].includes(type)) throw new ThrowReturn('Type invalid');

	const key = type === 'water' ? 'currentWaterQuantity' : 'currentElectricQuantity';
	const rsKey = type === 'water' ? 'previousWaterQuantity' : 'previousElectricQuantity';

	const contract = await models.BookingContract.findOne({
		bookingIds: booking._id,
		status: { $ne: ContractStatus.CANCELED },
	})
		.select('bookingIds')
		.lean();
	if (!contract) return { [rsKey]: 0 };

	const previousBookings = await models.Booking.find({
		_id: contract.bookingIds,
		status: { $nin: BookingStatusCanceled },
		to: { $lte: booking.from },
	})
		.sort({ from: -1 })
		.select(key)
		.lean();
	const previousBooking = previousBookings[0] || {};
	return { [rsKey]: previousBooking[key] || 0 };
}

async function changeBookingDatePriceData(data) {
	let { bookingId, from, to, fromHour, toHour, changeToRoomIds } = data;

	const fromDate = new Date(from);
	const toDate = new Date(to);
	let booking = null;

	if (bookingId) {
		booking = await models.Booking.findById(bookingId);
	}

	if (!booking || booking.status === BookingStatus.CANCELED || booking.status === BookingStatus.DECLINED) {
		throw new ThrowReturn('Booking not found or already cancelled');
	}

	return await Reservation.reCalcBookingPrice({
		booking,
		roomIds: changeToRoomIds,
		fromDate,
		toDate,
		fromHour,
		toHour,
	});
}

async function checkBookingError(blockId, roomIds, from, to, amount = 1) {
	const rooms = roomIds || [];

	const availableRooms = await models.BlockScheduler.findAvailableRooms(rooms, blockId, from, to);

	if (availableRooms.length < amount) {
		return Errors.RoomNotAvailable;
	}

	return 0;
}

async function updateBookingError(booking) {
	if (booking && booking.error === 0 && booking.status === BookingStatus.REQUEST && booking.from && booking.blockId) {
		const listing = await booking.listingModel();
		const rooms = listing.roomIds || [];

		booking.error = await checkBookingError(booking.blockId, rooms, booking.from, booking.to, booking.amount);
	}
}

async function updateBookingErrorAndAvailableRooms(booking, listingRoomIds, blockId) {
	if (booking && booking.status !== BookingStatus.REQUEST) {
		return booking;
	}

	const from = new Date(booking.from);
	const to = new Date(booking.to);

	booking.error = await checkBookingError(blockId, listingRoomIds, from, to);

	if (!_.values(LocalOTAs).includes(booking.otaName)) {
		return booking;
	}

	if (booking.error) {
		const rooms = await models.Room.find({ blockId, virtual: false, isSelling: true }).select(
			'info.name info.roomNo'
		);
		const allRoomIds = rooms.map(r => r._id.toString());
		const availableRoomIds = await models.BlockScheduler.findAvailableRooms(allRoomIds, blockId, from, to);

		booking.availableRooms = rooms.filter(room => availableRoomIds.includes(room._id.toString()));
	}

	return booking;
}

async function cancelBookings(bookingIds, query, userId) {
	const bookings = await models.Booking.find({
		_id: { $in: bookingIds },
		status: { $ne: BookingStatus.CANCELED },
		...query,
	}).select('_id');

	await bookings.asyncForEach(item =>
		Reservation.cancelReservation({
			reservation: { bookingId: item._id },
			fullCancelled: false,
			userId,
		})
	);
}

async function downloadBookingContract(req, res) {
	await downloadContract({ booking: req.data.booking, ...req.params, ...req.query }, res);
}

async function updateCheckinAndOut({ booking, fromHour, toHour, userId }) {
	if (booking.serviceType === Services.Hour) throw new ThrowReturn('Service type invalid');
	const isUpdateFromHour = fromHour && roundTime(fromHour) !== booking.fromHour;
	const isUpdateToHour = toHour && roundTime(toHour) !== booking.toHour;
	if (!isUpdateFromHour && !isUpdateToHour) return;
	const isOneDay = moment(booking.to).diff(booking.from, 'days') === 1;

	const { _id, blockId, from, to } = booking;
	const checkin = fromHour ? roundTime(fromHour) : booking.fromHour;
	const checkout = toHour ? roundTime(toHour) : booking.toHour;

	await ReservateCalendarLock.acquire(booking.blockId.toString(), async () => {
		// Check room available
		const reservateRooms = await models.Reservation.getReservateRooms(blockId, _id);
		for (const r of reservateRooms) {
			const available = await models.BlockScheduler.isRoomAvailable(r, blockId, from, to, {
				checkin,
				checkout,
				excludeBookingIds: [booking._id],
			});
			if (!available) throw new ThrowReturn('Room is not avaiable.');
		}

		// Booking log
		booking.$locals.updatedBy = userId;
		_.set(booking, '$locals.oldData.fromHour', booking.fromHour);
		_.set(booking, '$locals.oldData.toHour', booking.toHour);

		// Reservate new room
		booking.fromHour = checkin;
		booking.toHour = checkout;
		const query = {
			blockId,
			reservations: {
				$elemMatch: {
					// roomId: { $in: reservateRooms },
					bookingId: _id,
				},
			},
		};
		const arrFilter = {
			multi: true,
			arrayFilters: [{ 'elem.bookingId': _id }],
		};
		if (isOneDay) {
			await models.BlockScheduler.updateOne(
				{ ...query, date: from },
				{
					$set: {
						'reservations.$[elem].checkin': checkin,
						'reservations.$[elem].checkout': checkout,
					},
				},
				arrFilter
			);
			models.JobCalendar.createByRooms({
				roomIds: booking.reservateRooms,
				from: moment(booking.from).subtract(1, 'day').toDate(),
				to: booking.to,
				description: 'Update checkin and out',
			});
		} else {
			if (isUpdateFromHour) {
				await models.BlockScheduler.updateOne(
					{ ...query, date: booking.from },
					{ $set: { 'reservations.$[elem].checkin': checkin } },
					arrFilter
				);
				models.JobCalendar.createByRooms({
					roomIds: booking.reservateRooms,
					from: moment(booking.from).subtract(1, 'day').toDate(),
					to: booking.from,
					description: 'Update checkin',
				});
			}
			if (isUpdateToHour) {
				await models.BlockScheduler.updateOne(
					{ ...query, date: moment(booking.to).subtract(1, 'day').toDate() },
					{ $set: { 'reservations.$[elem].checkout': checkout } },
					arrFilter
				);
				models.JobCalendar.createByRooms({
					roomIds: booking.reservateRooms,
					from: booking.to,
					to: booking.to,
					description: 'Update checkout',
				});
			}
		}
		await booking.save();
	});
}

async function updateBookingOTAName({ booking, user, otaName }) {
	if (booking.listingId) {
		throw new ThrowReturn('Không thể cập nhật cho các đặt phòng tự động!');
	}

	const ota = await models.BookingSource.findOne({ name: otaName });

	if (!ota) {
		throw new ThrowReturn('Kênh đặt phòng không hợp lệ!');
	}

	const filter = { otaName: booking.otaName, otaBookingId: booking.otaBookingId };

	const update = { otaName };

	const bookings = await models.Booking.find(filter);

	await bookings.asyncMap(b => {
		return b.updateBookingProperties(update, _.get(user, '_id'));
	});

	const bookingIds = _.map(bookings, '_id');

	await Promise.all([
		// models.Booking.updateMany(filter, update),
		models.BookingContract.updateMany(filter, update),
		models.CashFlow.updateMany({ bookingId: { $in: bookingIds } }, update),
		models.Messages.updateMany(filter, update),
		models.BlockInbox.updateMany(filter, update),
		models.OTTMessage.updateMany(filter, update),
		models.PaymentRef.updateMany(filter, update),
		models.Stringee.updateMany(filter, update),
	]);

	return {
		otaName,
		otaBookingId: booking.otaBookingId,
	};
}

module.exports = {
	updateBookingError,
	checkBookingError,
	changeBookingDatePriceData,
	updateBookingErrorAndAvailableRooms,
	updateBookingCommission,
	getBookings,
	getBooking,
	getNotifications,
	cancelBookings,
	downloadBookingContract,
	updateCheckinAndOut,
	getPreviousQuantity,
	updateBookingOTAName,
};

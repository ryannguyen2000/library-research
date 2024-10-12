/* eslint-disable no-shadow */
const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { rangeDate } = require('@utils/date');
const { getIdsByQuery } = require('@utils/mongo');
const { Services, BookingStatus, EXTRA_FEE, ONE_DAY, ONE_HOUR, RuleDay } = require('@utils/const');
const models = require('@models');
const { getBookingRevenues } = require('./utils');

const { ObjectId } = mongoose.Types;

async function getStatsPerformance(query, user) {
	query.from = new Date(query.from).zeroHours();
	query.to = new Date(query.to).maxTimes();

	const MAX_MONTH = 12;
	if (moment(query.to).diff(query.from, 'month') > MAX_MONTH) {
		throw new ThrowReturn(`Thời gian vui lòng không vượt quá ${MAX_MONTH} tháng!`);
	}

	switch (query.type) {
		case 'ALOS': {
			return getALOS(query, user);
		}
		case 'BookingWindow': {
			return getBookingWindows(query, user);
		}
		case 'RevPar':
		case 'occupancy': {
			return getRevPar(query, user);
		}
		case 'occupancyRate': {
			return getOccupancyRate(query, user);
		}
		case 'ADR': {
			return getADR(query, user);
		}
		case 'OtaOverview': {
			return otaStats(query, user);
		}
		default: {
			return getADR(query, user, false);
		}
	}
}

async function getBookingQuery({
	user,
	blockId,
	ota,
	roomType,
	rooms,
	checkin,
	dateShow,
	isOperating,
	excludeBlockId,
	includeAll = true,
	serviceType,
}) {
	const query = {
		status: { $in: [BookingStatus.CONFIRMED, BookingStatus.NOSHOW] },
		error: 0,
	};
	let blockIds;
	let roomIds;
	let blocks;

	if (!includeAll) {
		query.ignoreFinance = false;
	}
	if (user) {
		const hostBlock = await models.Host.getBlocksOfUser({
			user,
			filterBlockIds: blockId,
			excludeBlockId,
			roomKey: 'reservateRooms',
		});
		blockIds = hostBlock.blockIds;

		const f = await models.Block.getRunningFilters(blockIds);
		_.assign(query, f.filter);
		blocks = f.blocks;
	}
	if (blockId) {
		_.set(query, 'blockId.$eq', ObjectId(blockId));
	}
	if (ota) {
		ota = await models.BookingSource.getSourceByGroup(ota.split(','));
		query.otaName = { $in: ota };
	}

	const roomFilters = {};
	if (isOperating !== undefined) {
		roomFilters.isOperating = isOperating === 'true' ? { $ne: false } : false;
	}
	if (roomType) {
		roomFilters['info.name'] = roomType;
	}
	if (!_.isEmpty(roomFilters)) {
		roomFilters.isSelling = { $ne: false };
		if (blockIds) {
			roomFilters.blockId = { $in: blockIds };
		}
		const rIds = await getIdsByQuery(models.Room, roomFilters);

		_.set(query, ['reservateRooms', '$in'], rIds);
		if (rooms) roomIds = rIds;
	}
	if (checkin) {
		query.checkedIn = true;
		query.serviceType = { $in: [Services.Day, Services.Month, Services.Night] };
	}
	if (dateShow) {
		query.createdAt = { $lte: new Date(dateShow) };
	}

	serviceType = parseInt(serviceType);

	if (serviceType) {
		_.set(query, ['serviceType', '$eq'], serviceType);
	}

	return { query, blockIds, roomIds, blocks };
}

function getPriceSelector() {
	return {
		currency: 1,
		currencyExchange: 1,
		price: 1,
		roomPrice: 1,
		..._.values(EXTRA_FEE).reduce((acc, cur) => ({ ...acc, [cur]: 1 }), {}),
	};
}

async function getRevPar(query, user) {
	const { from, to, isOperating } = query;
	const blockRooms = {};
	const dates = {};

	let {
		roomIds,
		blockIds,
		query: bookingQuery,
	} = await getBookingQuery({
		...query,
		user,
		rooms: true,
		filterByRunningTime: false,
	});

	bookingQuery.from = { $lte: to };
	bookingQuery.to = { $gt: from };

	if (roomIds) {
		roomIds = roomIds.reduce((ac, cur) => Object.assign(ac, { [cur]: true }), {});
	}

	const blockFilter = { active: true };
	if (blockIds) blockFilter._id = blockIds;

	const bls = await models.Block.find(blockFilter).select('_id reportConfig manageFee startRunning endRunning');
	const blocks = _.keyBy(bls, '_id');
	const newBlockIds = _.map(bls, '_id');

	const schedules = await models.BlockScheduler.find({
		date: { $gte: from, $lte: to },
		$or: [
			{
				blockId: { $in: bls.filter(b => !b.startRunning && !b.endRunning).map(b => b._id) },
			},
			...bls
				.filter(b => b.startRunning || b.endRunning)
				.map(b => ({
					blockId: b._id,
					date: _.pickBy({
						$lte: b.endRunning && new Date(b.endRunning).zeroHours(),
						$gte: b.startRunning && new Date(b.startRunning).zeroHours(),
					}),
				})),
		],
	}).lean();

	const roomMatch = {
		active: true,
		virtual: false,
		isSelling: { $ne: false },
		blockId: { $in: newBlockIds },
	};
	if (isOperating) {
		roomMatch.isOperating = isOperating === 'true' ? { $ne: false } : false;
	}
	const blockRoomsData = await models.Room.aggregate([
		{ $match: roomMatch },
		{ $project: { roomIds: 1, parentRoomId: 1, blockId: 1 } },
		{ $group: { _id: '$blockId', rooms: { $push: '$$ROOT' } } },
	]);

	blockRoomsData.forEach(b => {
		blockRooms[b._id] = {
			rooms: _.keyBy(b.rooms, '_id'),
			totalRoom: b.rooms.filter(r => !r.roomIds.length && (!roomIds || roomIds[r._id])).length,
		};
	});

	rangeDate(from, to)
		.toArray()
		.forEach(date => {
			const fmd = date.toDateMysqlFormat();

			const activeBlocks = bls.filter(
				b => (!b.startRunning || b.startRunning <= fmd) && (!b.endRunning || b.endRunning >= fmd)
			);
			const totalRooms = _.sum(activeBlocks.map(b => _.get(blockRooms[b._id], 'totalRoom', 0))) || 0;

			dates[date.toDateMysqlFormat()] = {
				revenue: {},
				booked: {},
				totalRooms,
				totalRoomsLocked: 0,
				rooms: totalRooms,
			};
		});

	const bookingParentRooms = {};
	schedules.forEach(({ date, reservations, blockId, lockedRoomIds }) => {
		date = date.toDateMysqlFormat();

		const dataDate = dates[date];
		if (!dataDate) return;

		const rooms = _.get(blockRooms[blockId], 'rooms');
		if (!rooms) return;

		let minus = 0;
		_.forEach(lockedRoomIds, roomId => {
			if (roomIds && !roomIds[roomId]) return;

			const room = rooms[roomId];
			if (!room) return;

			minus += room.roomIds.length || 1;
		});
		_.forEach(reservations, reservation => {
			if (roomIds && !roomIds[reservation.roomId]) return;

			const room = rooms[reservation.roomId];
			if (!room) return;

			if (room.roomIds.length) {
				_.set(bookingParentRooms, [date, reservation.bookingId], room.roomIds.length);
			}
		});

		dataDate.totalRoomsLocked += minus;
		dataDate.rooms -= minus;

		if (dataDate.rooms < 0) dataDate.rooms = 0;
	});

	const bookings = await models.Booking.find(bookingQuery)
		.select({
			otaName: 1,
			from: 1,
			to: 1,
			amount: 1,
			blockId: 1,
			...getPriceSelector(),
		})
		.lean();

	const reservations = await models.Reservation.find({ bookingId: { $in: bookings.map(b => b._id) } })
		.select({
			roomId: 1,
			bookingId: 1,
			dates: 1,
			...getPriceSelector(),
		})
		.lean()
		.then(res => _.groupBy(res, 'bookingId'));

	const configCache = {};
	const getConfig = (block, date) => {
		const fromCache = _.get(configCache, [block._id, date]);
		if (fromCache) return fromCache;

		const feeConfig = models.Block.getFeeConfig(block.manageFee, date);
		_.set(configCache, [block._id, date], feeConfig);
		return feeConfig;
	};

	bookings.forEach(booking => {
		const { otaName, currency, from, to, _id, currencyExchange } = booking;

		const block = blocks[booking.blockId];
		if (!block) {
			return;
		}
		const reservation = reservations[_id];

		const feeConfig = getConfig(block, from.toDateMysqlFormat());
		const revenueKeys = models.Block.getRevenueKeys(feeConfig);
		const exchangePrice = models.Booking.getBookingRevenue(booking, revenueKeys);
		const pricePerNight = exchangePrice / to.diffDays(from) / _.get(reservation, 'length', booking.amount);

		if (!reservation) {
			rangeDate(from, to, false)
				.toArray()
				.forEach(date => {
					const formatDate = date.toDateMysqlFormat();
					const dTemp = dates[formatDate];
					if (
						!dTemp ||
						(block.startRunning && block.startRunning > formatDate)
						// (block.endRunning && block.endRunning < formatDate)
					)
						return;

					dTemp.revenue[otaName] = (dTemp.revenue[otaName] || 0) + pricePerNight;
				});
		} else {
			reservation.forEach(res => {
				res.currencyExchange = currencyExchange;
				res.currency = currency;

				const roomPricePerNight = res.roomPrice
					? models.Booking.getBookingRevenue(res, revenueKeys) / (res.dates.length || 1)
					: pricePerNight;

				if (res.dates.length) {
					res.dates.forEach(dateData => {
						const formatDate = dateData.date.toDateMysqlFormat();
						const dTemp = dates[formatDate];
						if (!dTemp) return;

						const camount = _.get(bookingParentRooms, [formatDate, _id]) || 1;
						dTemp.booked[otaName] = (dTemp.booked[otaName] || 0) + camount;

						if (
							!block.startRunning ||
							block.startRunning <= formatDate
							// (!block.endRunning || block.endRunning >= formatDate)
						) {
							dTemp.revenue[otaName] = (dTemp.revenue[otaName] || 0) + roomPricePerNight;
						}
					});
				} else {
					const formatDate = from.toDateMysqlFormat();
					const dTemp = dates[formatDate];
					if (
						!dTemp ||
						(block.startRunning && block.startRunning > formatDate)
						// (block.endRunning && block.endRunning < formatDate)
					)
						return;

					dTemp.revenue[otaName] = (dTemp.revenue[otaName] || 0) + roomPricePerNight;
				}
			});
		}
	});

	_.forEach(dates, values => {
		values.sold = _.sum(_.values(values.booked));
		values.occupancy = values.rooms ? _.round((values.sold / values.rooms) * 100, 1) : 0;
	});
	const maxOccupancyDays = bls.length === 1 && _.get(bls[0].reportConfig, 'maxOccupancyDays');

	const occupancy = {};

	const arrayData = maxOccupancyDays
		? _.take(_.orderBy(_.values(dates), ['occupancy'], ['desc']), maxOccupancyDays)
		: _.values(dates);

	occupancy.totalRooms = _.sumBy(arrayData, 'totalRooms');
	occupancy.totalRoomsLocked = _.sumBy(arrayData, 'totalRoomsLocked');
	occupancy.available = _.sumBy(arrayData, 'rooms');
	occupancy.sold = _.sumBy(arrayData, 'sold');
	occupancy.avgOccupancy = occupancy.available && _.round((occupancy.sold / occupancy.available) * 100, 1);

	return { dates, occupancy };
}

async function getALOS(query, user) {
	const { from, to, dateType = 'from' } = query;

	const { query: bookingQuery } = await getBookingQuery({
		...query,
		user,
		filterByRunningTime: false,
	});
	bookingQuery[dateType] = { $gte: from, $lte: to };

	const dates = {};
	rangeDate(from, to)
		.toArray()
		.forEach(date => {
			dates[date.toDateMysqlFormat()] = {};
		});

	const bookings = await models.Booking.aggregate([
		{
			$match: bookingQuery,
		},
		{
			$project: {
				otaName: 1,
				amount: 1,
				date: {
					$dateToString: { format: '%Y-%m-%d', date: `$${dateType}`, timezone: '+07:00' },
				},
				nights: {
					$divide: [{ $subtract: ['$to', '$from'] }, ONE_DAY],
				},
			},
		},
		{
			$group: {
				_id: {
					otaName: '$otaName',
					date: '$date',
				},
				reservations: { $sum: '$amount' },
				nights: { $sum: { $sum: ['$nights', '$amount'] } },
			},
		},
	]);

	_.forEach(bookings, b => {
		const { date, otaName } = b._id;

		_.set(dates, [date, otaName], { reservations: b.reservations, nights: b.nights });
	});

	return { dates };
}

async function getBookingWindows(query, user) {
	const { from, to, dateType = 'from', windowType } = query;

	const { query: bquery } = await getBookingQuery({
		...query,
		user,
		filterByRunningTime: false,
	});
	bquery[dateType] = { $gte: from, $lte: to };

	let bookings = [];
	let groups = [];

	if (windowType === 'byHour') {
		const timezone = '+07:00';

		bookings = await models.Booking.aggregate([
			{
				$match: bquery,
			},
			{
				$project: {
					createdAt: 1,
					otaBookingId: 1,
					checkinTime: {
						$cond: [
							{ $gt: ['$checkin', 0] },
							'$checkin',
							{
								$dateFromString: {
									dateString: {
										$concat: [
											{
												$dateToString: {
													date: '$from',
													format: '%Y-%m-%d',
													timezone,
												},
											},
											'T',
											{ $ifNull: ['$fromHour', RuleDay.from] },
											':00.000',
										],
									},
									timezone,
								},
							},
						],
					},
				},
			},
			{
				$group: {
					_id: {
						$ceil: {
							$divide: [{ $max: [{ $subtract: ['$checkinTime', '$createdAt'] }, 0] }, ONE_HOUR],
						},
					},
					total: { $sum: 1 },
					checkinTime: { $push: '$checkinTime' },
					otaBookingId: { $push: '$otaBookingId' },
				},
			},
		]);

		groups = [
			..._.range(24).map(r => ({
				min: r,
				max: r + 1,
				label: `${r} Hour${r > 1 ? 's' : ''}`,
			})),
			{
				min: 24,
				max: 48,
				label: '24-48 Hours',
			},
			{
				min: 48,
				max: 72,
				label: '48-72 Hours',
			},
			{
				min: 72,
				label: '> 72 Hours',
			},
		];
	} else {
		bookings = await models.Booking.aggregate([
			{
				$match: bquery,
			},
			{
				$project: {
					diffDay: {
						$ceil: { $divide: [{ $max: [{ $subtract: ['$from', '$createdAt'] }, 0] }, ONE_DAY] },
					},
				},
			},
			{
				$group: {
					_id: '$diffDay',
					total: { $sum: 1 },
				},
			},
		]);

		groups = [
			..._.range(7).map(r => ({
				min: r,
				max: r + 1,
				label: `${r} Day${r > 1 ? 's' : ''}`,
			})),
			{
				min: 7,
				max: 15,
				label: '7-15 Days',
			},
			{
				min: 15,
				max: 30,
				label: '15-30 Days',
			},
			{
				min: 30,
				max: 60,
				label: '30-60 Days',
			},
			{
				min: 60,
				max: 90,
				label: '60-90 Days',
			},
			{
				min: 90,
				label: '> 90 Days',
			},
		];
	}

	const data = groups
		.map(group => {
			const groupBookings = bookings.filter(
				b => (group.max ? b._id < group.max : true) && (group.min ? b._id >= group.min : true)
			);

			return {
				...group,
				total: _.sumBy(groupBookings, 'total') || 0,
			};
		})
		.filter(i => i.total);

	return {
		data,
		total: _.sumBy(bookings, 'total'),
	};
}

async function getADR(query, user, includeAll) {
	const { from, to, dateType = 'from' } = query;

	const { query: bookingQuery, blocks } = await getBookingQuery({
		...query,
		user,
		includeAll,
	});

	const { bookings, dates } = await getBookingRevenues({
		filter: bookingQuery,
		from,
		to,
		blocks,
		dateType,
	});

	bookings.forEach(b => {
		b.results.forEach(rs => {
			if (!_.has(dates, [rs.date, 'booked', b._id.otaName])) {
				_.set(dates, [rs.date, 'booked', b._id.otaName], 0);
			}
			dates[rs.date].booked[b._id.otaName] += rs.data.amount;

			if (!_.has(dates, [rs.date, 'revenue', b._id.otaName])) {
				_.set(dates, [rs.date, 'revenue', b._id.otaName], 0);
			}
			dates[rs.date].revenue[b._id.otaName] += rs.data.rev;
		});
	});

	return { dates };
}

async function otaStats(query, user) {
	const { from, to } = query;

	const { query: bookingQuery, blocks } = await getBookingQuery({
		...query,
		user,
		includeAll: false,
	});

	bookingQuery.from = { $lte: to };
	bookingQuery.to = { $gt: from };

	const bookings = await models.Booking.find(bookingQuery)
		.select({
			otaName: 1,
			from: 1,
			to: 1,
			amount: 1,
			createdAt: 1,
			blockId: 1,
			...getPriceSelector(),
		})
		.lean();

	const rs = {};
	let total = 0;

	bookings.forEach(booking => {
		const block = blocks[booking.blockId];
		if (!block) return;

		const feeConfig = models.Block.getFeeConfig(block.manageFee, booking.from.toDateMysqlFormat());
		const revenueKeys = models.Block.getRevenueKeys(feeConfig);
		const exchangePrice = models.Booking.getBookingRevenue(booking, revenueKeys);
		const price = exchangePrice / booking.from.diffDays(booking.to);

		const maxFrom = _.max(_.compact([from, booking.from, block.startRunning && new Date(block.startRunning)]));
		const minTo = _.min([to, booking.to]);

		const rPrice = price * _.max([maxFrom.diffDays(minTo), 0]);
		total += rPrice;

		if (rs[booking.otaName]) {
			rs[booking.otaName] += rPrice;
		} else {
			rs[booking.otaName] = rPrice;
		}
	});

	_.forIn(rs, (revenue, ota) => {
		_.set(rs, ota, { revenue: _.round(revenue), percent: _.round((revenue / total) * 100, 2) });
	});

	return { rs, total };
}

async function getOccupancyRate(query, user) {
	const { from, to } = query;
	const dates = {};
	const blocks = {};

	let {
		roomIds,
		blockIds,
		query: bookingQuery,
	} = await getBookingQuery({ ...query, user, rooms: true, filterByRunningTime: false });

	bookingQuery.from = { $lte: new Date(to).maxTimes() };
	bookingQuery.to = { $gte: new Date(from).minTimes() };

	const blockFilter = { active: true };
	if (blockIds) blockFilter._id = blockIds;

	const bls = await models.Block.find(blockFilter).select('_id startRunning endRunning');
	const newBlockIds = bls.map(b => b._id);

	const schedules = await models.BlockScheduler.aggregate().match({
		date: { $gte: from, $lte: to },
		$or: [
			{
				blockId: { $in: bls.filter(b => !b.startRunning && !b.endRunning).map(b => b._id) },
			},
			...bls
				.filter(b => b.startRunning || b.endRunning)
				.map(b => ({
					blockId: b._id,
					date: _.pickBy({
						$lte: b.endRunning && new Date(b.endRunning).zeroHours(),
						$gte: b.startRunning && new Date(b.startRunning).zeroHours(),
					}),
				})),
		],
	});

	const roomMatch = {
		active: true,
		virtual: false,
		isSelling: { $ne: false },
		blockId: { $in: newBlockIds },
	};
	const blocksData = await models.Room.aggregate()
		.match(roomMatch)
		.project({ roomIds: 1, parentRoomId: 1, blockId: 1 })
		.group({ _id: '$blockId', rooms: { $push: '$$ROOT' } });

	blocksData.forEach(b => {
		blocks[b._id] = {
			rooms: _.keyBy(b.rooms, '_id'),
			totalRoom: b.rooms.filter(r => !r.roomIds.length && (!roomIds || roomIds[r._id])).length,
		};
	});

	rangeDate(from, to)
		.toArray()
		.forEach(date => {
			const fmd = date.toDateMysqlFormat();

			const activeBlocks = bls.filter(
				b => (!b.startRunning || b.startRunning <= fmd) && (!b.endRunning || b.endRunning >= fmd)
			);

			dates[fmd] = {
				booked: 0,
				rooms: _.sum(activeBlocks.map(b => _.get(blocks[b._id], 'totalRoom', 0))) || 0,
			};
		});

	const bookingParentRooms = {};
	schedules.forEach(({ date, reservations, blockId, lockedRoomIds }) => {
		date = date.toDateMysqlFormat();

		const dataDate = dates[date];
		if (!dataDate) return;

		const block = _.get(blocks[blockId], 'rooms');
		if (!block) return;

		let minus = 0;
		_.forEach(lockedRoomIds, roomId => {
			if (roomIds && !roomIds[roomId]) return;

			const room = block[roomId];
			if (!room) return;

			minus += room.roomIds.length || 1;
		});
		_.forEach(reservations, reservation => {
			if (roomIds && !roomIds[reservation.roomId]) return;

			const room = block[reservation.roomId];
			if (!room) return;

			if (room.roomIds.length) {
				_.set(bookingParentRooms, [date, reservation.bookingId], room.roomIds.length);
			}
		});

		dataDate.rooms -= minus;
		if (dataDate.rooms < 0) dataDate.rooms = 0;
	});

	const bookings = await models.Booking.find(bookingQuery).select('_id');

	const reservations = await models.Reservation.aggregate()
		.match({ bookingId: { $in: bookings.map(booking => booking._id) } })
		.project({
			roomId: 1,
			bookingId: 1,
			dates: 1,
		})
		.then(res => _.groupBy(res, 'bookingId'));

	bookings.forEach(booking => {
		const { _id } = booking;
		const reservation = reservations[_id];
		if (!reservation) return;

		reservation.forEach(res => {
			if (res.dates.length) {
				res.dates.forEach(dateData => {
					const date = dateData.date.toDateMysqlFormat();
					const dTemp = dates[date];
					if (!dTemp) return;
					const amount = _.get(bookingParentRooms, [date, _id]) || 1;
					dTemp.booked = (dTemp.booked || 0) + amount;
				});
			}
		});
	});
	let rateAmount = 0;
	const { length } = _.keys(dates);
	const rs = {};
	_.forIn(dates, ({ booked, rooms }, date) => {
		rateAmount += booked / rooms;
		_.set(rs, date, (booked / rooms) * 100);
	});

	return _.round((rateAmount / length) * 100, 2);
}

module.exports = {
	getStatsPerformance,
};

const moment = require('moment');
const _ = require('lodash');
const mongoose = require('mongoose');

const ThrowReturn = require('@core/throwreturn');
const { BookingStatus, EXTRA_FEE } = require('@utils/const');
const { getIdsByQuery } = require('@utils/mongo');
const models = require('@models');

function getTimes(date) {
	date = moment(date).startOf('date');
	const times = [];

	while (true) {
		const time = date.format('HH:mm');
		times.push(date.toDate());

		if (time === '23:59') break;

		if (time === '23:30') {
			date.add(29, 'minute').second(59);
		} else {
			date.add(30, 'minute');
		}
	}

	return times;
}

async function getBookingQuery({ user, blockId, roomType, otaName, excludeBlockId }) {
	const { blockIds, filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
		roomKey: 'reservateRooms',
	});

	const query = {
		status: { $in: [BookingStatus.CONFIRMED, BookingStatus.NOSHOW] },
		ignoreFinance: false,
		$and: [filters],
	};

	const { filter, blocks } = await models.Block.getStartRunningFilters(blockIds);
	_.assign(query, filter);

	if (otaName) {
		otaName = await models.BookingSource.getSourceByGroup(_.isArray(otaName) ? otaName : otaName.split(','));
		query.otaName = { $in: otaName };
	}
	if (roomType) {
		if (mongoose.Types.ObjectId.isValid(roomType)) {
			const roomTypeDoc = await models.RoomType.findById(roomType).select('roomIds');
			_.set(query, 'reservateRooms.$in', _.get(roomTypeDoc, 'roomIds', []));
		} else {
			const roomIds = await getIdsByQuery(models.Room, {
				blockId: { $in: blockIds },
				'info.name': roomType,
			});
			_.set(query, 'reservateRooms.$in', roomIds);
		}
	}

	return [query, blocks];
}

// function calcBookingsRevenue(bookings, date, blockObjs) {
// 	const revenues = bookings.map(booking => {
// 		const block = blockObjs[booking.blockId];

// 		if (block.startRunning > date.toDateMysqlFormat()) return 0;

// 		const feeConfig = models.Block.getFeeConfig(block.manageFee, date);
// 		const revenueKeys = models.Block.getRevenueKeys(feeConfig);
// 		const __price = models.Booking.getBookingRevenue(booking, revenueKeys);

// 		const pricePerNight = __price / booking.to.diffDays(booking.from);
// 		return pricePerNight;
// 	});

// 	return _.sum(revenues);
// }

function calcBookingRevenue(booking, block, date) {
	if (block.startRunning > date.toDateMysqlFormat()) return 0;

	const feeConfig = models.Block.getFeeConfig(block.manageFee, date);
	const revenueKeys = models.Block.getRevenueKeys(feeConfig);
	const __price = models.Booking.getBookingRevenue(booking, revenueKeys);

	const pricePerNight = __price / booking.to.diffDays(booking.from);
	return pricePerNight;
}

async function getRevenuesByDate(query, blocks, date, createdTo, showTime) {
	const filter = {
		from: { $lte: date },
		to: { $gt: date },
		...query,
	};

	if (createdTo) {
		filter.createdAt = { $lte: createdTo };
	}

	const bookings = await models.Booking.find(filter)
		.select({
			currency: 1,
			currencyExchange: 1,
			from: 1,
			to: 1,
			createdAt: 1,
			blockId: 1,
			price: 1,
			roomPrice: 1,
			..._.values(EXTRA_FEE).reduce((acc, cur) => ({ ...acc, [cur]: 1 }), {}),
		})
		.lean();

	const rs = {
		date: date.toDateMysqlFormat(),
	};

	bookings.forEach(booking => {
		booking.revenue = calcBookingRevenue(booking, blocks[booking.blockId], date);
	});

	if (showTime) {
		rs.dataTimes = getTimes(date).map(time => {
			const bookingsByTime = bookings.filter(booking => booking.createdAt <= time);
			return {
				time: moment(time).format('HH:mm'),
				bookingsCount: bookingsByTime.length,
				revenue: _.sumBy(bookingsByTime, 'revenue') || 0,
			};
		});
	} else {
		rs.data = {
			bookingsCount: bookings.length,
			revenue: _.sumBy(bookings, 'revenue') || 0,
		};
	}

	return rs;
}

async function getRevenues({ dates, createdTo, ...query }, user) {
	if (!dates) {
		throw new ThrowReturn('dates is required!');
	}

	dates = _.map(_.isArray(dates) ? dates : dates.split(','), date => new Date(date).zeroHours());
	createdTo = _.map(_.compact(_.isArray(createdTo) ? createdTo : _.split(createdTo, ',')), date => new Date(date));

	const [defaultQuery, blocks] = await getBookingQuery({ user, ...query });

	const showTime = query.showTime === 'true';
	const data = dates.asyncMap((date, index) =>
		getRevenuesByDate(defaultQuery, blocks, date, createdTo[index], showTime)
	);

	return data;
}

module.exports = {
	getRevenues,
};

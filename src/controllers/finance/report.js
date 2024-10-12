const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { PayoutType, BookingStatus } = require('@utils/const');
const models = require('@models');
const { runWorker } = require('@workers/index');
const { FINANCE_EARNING_STATS } = require('@workers/const');

const MapDateKeys = {
	checkin: 'from',
	checkout: 'to',
	created: 'createdAt',
	distribute: 'distribute',
};

async function reportAll(user, { from, to }) {
	from = moment(from).startOf('days').toDate();
	to = moment(to).endOf('days').toDate();

	const diff = moment(to).diff(from, 'day');
	const MAX_DAY = 60;
	if (diff > MAX_DAY) {
		throw new ThrowReturn(`Thời gian vui lòng không vượt quá ${MAX_DAY} ngày!`);
	}

	// find pay type
	const pays = await models.Payout.report(PayoutType.PAY, false, from, to);
	// repaid
	const repaid = await models.Payout.repaidReport(from, to);

	// merge repaid and pays
	_.forEach(repaid, (value, blockId) => {
		if (!pays[blockId]) {
			pays[blockId] = value;
		} else {
			pays[blockId].paid += value.paid;
			for (const category in value.categories) {
				for (const id in category) {
					pays[blockId][category][id] += value[category][id];
				}
			}
		}
		pays[blockId].repaid = { ...value };
	});

	// distribute
	const distributes = await models.Payout.report(PayoutType.PAY, true, from, to);
	// revenues
	const { blockIds, filters } = await models.Host.getBlocksOfUser({ user, roomKey: 'reservateRooms' });

	const revenues = await blockIds
		.asyncMap(async blockId => {
			const results = await runWorker({
				type: FINANCE_EARNING_STATS,
				data: {
					blockId: blockId.toString(),
					filters: JSON.stringify(filters),
					from,
					to,
					dateKey: MapDateKeys.distribute,
				},
			});

			return { block: blockId, revenues: results.revenues };
		})
		.then(results =>
			results.reduce((pre, cur) => {
				pre[cur.block] = cur.revenues;
				return pre;
			}, {})
		);

	const keys = new Set([...Object.keys(pays), ...Object.keys(revenues), ...Object.keys(distributes)]);
	keys.forEach(blockId => {
		if (!pays[blockId]) {
			pays[blockId] = { paid: 0 };
		}
		if (revenues[blockId]) {
			pays[blockId].revenues = revenues[blockId].amount;
		} else {
			pays[blockId].revenues = 0;
		}

		if (distributes[blockId]) {
			pays[blockId].distributes = distributes[blockId];
		}
	});

	return { pays };
}

async function getReservationsFee({ blockId, from, to, otaName, otaBookingId, feeType = 'managementFee' }, user) {
	from = new Date(
		moment(from || new Date())
			.startOf('month')
			.format('YYYY-MM-DD')
	).zeroHours();

	to = new Date(
		moment(to || new Date())
			.endOf('month')
			.format('YYYY-MM-DD')
	).zeroHours();

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		roomKey: 'reservateRooms',
	});

	const query = _.pickBy({
		...filters,
		otaBookingId,
		status: BookingStatus.CONFIRMED,
		from: {
			$lte: to,
		},
		to: {
			$gt: from,
		},
		[feeType]: { $gt: 0 },
	});

	if (otaName) {
		query.otaName = await models.BookingSource.getSourceByGroup(otaName);
	}

	const bookings = await models.Booking.find(query)
		.select(
			`blockId guestId otaName otaBookingId from to status price roomPrice reservateRooms exchange currency ${feeType}`
		)
		.populate('blockId', 'id info.name')
		.populate('guestId', 'name fullName')
		.populate('reservateRooms', 'info.name info.roomNo')
		.lean();

	to = moment(to).add(1, 'day').toDate();

	bookings.forEach(booking => {
		// const distribute = booking.distributePrice(from, to, booking[feeType]);
		if (booking[feeType]) {
			const distributer = models.Booking.distribute(booking.from, booking.to, from, to);
			const exchanger = models.Booking.exchangeCurrency(booking.currencyExchange, booking.currency);

			booking.distribute = distributer(exchanger(booking[feeType]));
		}
	});

	const totalFee = _.sumBy(bookings, feeType);
	const totalFeeDistribute = _.sumBy(bookings, 'distribute');

	return {
		bookings,
		totalFee,
		totalFeeDistribute,
		type: feeType,
	};
}

module.exports = {
	reportAll,
	getReservationsFee,
};

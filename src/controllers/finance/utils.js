const _ = require('lodash');
const moment = require('moment');

const { PayoutStates, Currency, PayoutType, RolePermissons } = require('@utils/const');
const { rangeDate, rangeMonth } = require('@utils/date');
const models = require('@models');
const Schedule = require('@controllers/schedule');

function totalRevenues(revenues) {
	return revenues.reduce(
		(data, cur) => {
			const { fee, exchangedAmount } = cur.currencyAmount;
			const currency = Currency.VND;

			data.amounts[currency] += exchangedAmount;
			data.fee += fee || 0;

			if (!data[cur.source]) data[cur.source] = {};
			data[cur.source][currency] = (data[cur.source][currency] || 0) + exchangedAmount;

			return data;
		},
		{ amounts: { [Currency.VND]: 0, [Currency.USD]: 0 }, fee: 0 }
	);
}

async function getRevenuesByQuery({ query, showSMS, user, type }) {
	const isPay = _.includes(type, PayoutType.PAY) || _.includes(type, PayoutType.PREPAID);

	const populateFields = [
		{
			path: 'blockIds',
			select: 'info.name',
		},
		{
			path: 'assetId',
		},
		{
			path: 'confirmedBy createdBy categoryId',
			select: 'username name hasAsset',
		},
	];

	if (showSMS) {
		populateFields.push({ path: 'smsId', select: 'phone data' });
	}
	if (isPay) {
		populateFields.push(
			{
				path: 'export',
				select: 'noId name -payouts',
				match: { state: { $ne: PayoutStates.DELETED } },
			},
			{
				path: 'roomIds',
				select: 'info.name info.roomNo',
			},
			{
				path: 'task',
				select: 'createdBy createdAt',
				populate: {
					path: 'createdBy',
					select: 'username name',
				},
			},
			{
				path: 'payAccountId payDebitAccountId',
				select: 'no accountName name shortName accountNos bankId',
				populate: {
					path: 'bankId',
				},
			},
			{
				path: 'autoId',
				select: 'name imports.type',
			}
		);
	} else {
		populateFields.push({
			path: 'bookingId',
			select: '_id from to price otaName otaBookingId currency blockId fee otaFee guestId status',
			populate: [
				{
					path: 'hosting',
					select: 'username name',
				},
				{
					path: 'guestId',
					select: 'displayName fullName name',
				},
				{
					path: 'reservateRooms',
					select: 'info.name info.roomNo',
				},
			],
		});
	}

	const revenues = await models.Payout.find(query)
		.select('-logs')
		.sort({ paidAt: -1 })
		.populate(populateFields)
		.lean();

	const hasPayoutFee = {};
	const sms = [];

	if (revenues.some(r => _.get(r.autoId, 'imports.type') === 'payroll')) {
		const hasRole = await user.hasPermission(RolePermissons.VIEW_PAYROLL);

		if (!hasRole) {
			revenues.forEach(payout => {
				if (_.get(payout.autoId, 'imports.type') === 'payroll') {
					_.unset(payout, 'payAccountId');
				}
			});
		}
	}

	let hasViewPayroll;

	if (revenues.some(r => _.get(r.autoId, 'imports.type') === 'payroll')) {
		hasViewPayroll = await user.hasPermission(RolePermissons.VIEW_PAYROLL);
	}

	revenues.forEach(payout => {
		const booking = payout.bookingId;
		if (booking) {
			if (booking.hosting) {
				if (booking.hosting._id) {
					booking.hosting._id = booking.hosting._id.toString();
				}
				payout.hosting = [booking.hosting];
			}

			payout.roomIds = booking.reservateRooms;

			_.unset(booking, 'reservateRooms');
			_.unset(booking, 'hosting');

			// apply fee for first payout only
			if (booking.otaFee > 0 && payout.state !== PayoutStates.DELETED && !hasPayoutFee[booking._id]) {
				payout.currencyAmount.fee = booking.otaFee;
				payout.currencyAmount.feePercent = (booking.otaFee / booking.price) * 100;
				hasPayoutFee[booking._id] = true;
			}
		}

		if (showSMS) {
			sms.push(payout.smsId);
		}

		if (_.get(payout.autoId, 'imports.type') === 'payroll') {
			if (!hasViewPayroll) {
				_.unset(payout, 'payAccountId');
			}
		} else {
			_.unset(payout.payAccountId, 'no');
		}

		return payout;
	});

	if (showSMS) {
		await models.SMSMessage.parseMessages(sms, user);
	}

	// calculate total revenues
	const total = totalRevenues(revenues);

	return { revenues, total };
}

async function getOccupancy({ blockId, from, to }) {
	const roomLength = await models.Room.countDocuments({ blockId, virtual: false });

	const range = [];
	const fromDate = new Date(from);
	fromDate.setUTCDate(1);
	fromDate.setUTCHours(0, 0, 0, 0);

	const endDate = new Date(to);
	while (fromDate < endDate) {
		range.push(fromDate.toISOString());
		fromDate.setMonth(fromDate.getMonth() + 1);
	}

	const occupancyRate = await range.asyncMap(async key => {
		const date = new Date(key);
		const toDate = new Date(date);
		toDate.setMonth(toDate.getMonth() + 1);

		let lockDates = await models.BlockScheduler.countLockDates(blockId, date, toDate);
		const relationLocks = await Schedule.getScheduleDetail(blockId, date, toDate, true);

		lockDates += relationLocks
			.filter(v => v.date >= date && v.date <= toDate)
			.reduce((size, value) => {
				size += value.unavailable ? value.unavailable.length : 0;
				return size;
			}, 0);

		const { rate, otas, info } = await models.Booking.occupancyRate(
			blockId,
			null,
			null,
			roomLength,
			date,
			toDate,
			lockDates
		);
		return { key, rate, otas, info };
	});

	return {
		occupancyRate: _.keyBy(occupancyRate, 'key'),
	};
}

async function calcPayouts(filter) {
	const rs = await models.Payout.aggregate()
		.match({ ...filter, distribute: false })
		.group({
			_id: '$categoryId',
			categoryId: { $first: '$categoryId' },
			amount: { $sum: '$currencyAmount.exchangedAmount' },
		});

	return rs;
}

async function calcDistributedPayouts(filter, period) {
	const rs = await models.Payout.aggregate()
		.match({
			...filter,
			distribute: true,
			startPeriod: { $lte: period },
			endPeriod: { $gte: period },
			'distributes.period': period,
		})
		.unwind('$distributes')
		.match({ 'distributes.period': period })
		.group({
			_id: {
				blockIds: '$blockIds',
				categoryId: '$categoryId',
			},
			categoryId: { $first: '$categoryId' },
			amount: { $sum: '$distributes.amount' },
		});

	return rs;
}

// const randomColor = () => Math.floor(Math.random() * 16777215).toString(16);

async function calcResult(arrayStats) {
	let total = 0;
	const details = {};

	const stats = arrayStats.map(timeStats => {
		const itemDetails = {};
		let itemTotal = 0;

		timeStats.items.forEach(d => {
			itemTotal += d.amount;
			if (itemDetails[d.categoryId]) {
				itemDetails[d.categoryId] += d.amount;
			} else {
				itemDetails[d.categoryId] = d.amount;
			}

			details[d.categoryId] = details[d.categoryId] || 0;
			details[d.categoryId] += d.amount;
		});

		total += itemTotal;

		return {
			time: timeStats.time,
			total: itemTotal,
			details: itemDetails,
		};
	});

	const categories = await models.PayoutCategory.find({ _id: _.keys(details) })
		.select('name color')
		.lean();
	const ctgObjs = _.keyBy(categories, '_id');

	stats.forEach(stat => {
		stat.details = _.orderBy(
			_.entries(stat.details).map(([_id, amount]) => ({
				name: _.get(ctgObjs[_id], 'name', _id),
				color: _.get(ctgObjs[_id], 'color') || `#${_id.slice(-6)}`,
				amount,
			})),
			['amount'],
			['desc']
		);
	});

	return {
		total,
		stats,
		details: _.orderBy(
			_.entries(details).map(([_id, amount]) => ({
				name: _.get(ctgObjs[_id], 'name', _id),
				color: _.get(ctgObjs[_id], 'color') || `#${_id.slice(-6)}`,
				amount,
			})),
			['amount'],
			['desc']
		),
	};
}

async function getPayoutStats(user, { blockId, from, to, view, distribute, isInternal }) {
	const { blockIds, filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		blockKey: 'blockIds',
		roomKey: 'roomIds',
	});

	const filter = {
		...filters,
		payoutType: PayoutType.PAY,
		state: { $ne: PayoutStates.DELETED },
		ignoreReport: { $ne: true },
	};

	let hasDistributed = true;
	let hasNoDistributed = true;

	if (distribute) {
		if (distribute === true || distribute === 'true') {
			filter.distribute = true;
			hasNoDistributed = false;
		} else {
			filter.distribute = false;
			hasDistributed = false;
		}
	}
	if (isInternal) {
		if (isInternal === true || isInternal === 'true') {
			filter.isInternal = true;
		} else {
			filter.isInternal = { $ne: true };
		}
	}

	let stats;

	if (view === 'day') {
		const dates = rangeDate(from, to).toArray();

		let statsDistribute = {};
		let blocks = [];

		if (hasDistributed) {
			blocks = await models.Block.find({ _id: blockIds }).select('reportConfig startRunning');

			const periodsByBlocks = blocks.map(b => ({
				blockId: b._id,
				periods: b.getPeriods(from, to),
			}));

			const periods = _.chain(periodsByBlocks).map('periods').flatten().map('period').uniq().value().sort();

			await periods.asyncMap(async period => {
				const pStats = await calcDistributedPayouts(
					{
						...filter,
					},
					period
				);

				pStats.forEach(s => {
					const blId = s._id.blockIds[0];

					if (!_.has(statsDistribute, [blId, period])) {
						_.set(statsDistribute, [blId, period], [s]);
					} else {
						statsDistribute[blId][period].push(s);
					}
				});
			});
		}

		stats = await dates.asyncMap(async cdate => {
			const start = moment(cdate).startOf('day').toDate();
			const end = moment(cdate).endOf('day').toDate();

			const items = [];

			if (hasNoDistributed) {
				items.push(
					...(await calcPayouts({
						...filter,
						paidAt: { $gte: start, $lte: end },
					}))
				);
			}

			if (!_.isEmpty(statsDistribute)) {
				const days = moment(cdate).daysInMonth();
				blocks.forEach(block => {
					if (!statsDistribute[block._id]) return;

					const period = block.findPeriodByDate(cdate);
					if (!statsDistribute[block._id][period]) return;

					items.push(
						...statsDistribute[block._id][period].map(s => ({ ...s, amount: _.round(s.amount / days) }))
					);
				});
			}

			return {
				items,
				time: moment(cdate).format('DD/MM'),
			};
		});
	} else {
		const periods = rangeMonth(from, to, 'YYYY-MM');

		stats = await periods.asyncMap(async period => {
			const items = [];

			if (hasNoDistributed) {
				items.push(
					...(await calcPayouts({
						...filter,
						startPeriod: { $lte: period },
						endPeriod: { $gte: period },
					}))
				);
			}

			if (hasDistributed) {
				items.push(
					...(await calcDistributedPayouts(
						{
							...filter,
						},
						period
					))
				);
			}

			return {
				items,
				time: moment(period).format('MM/YYYY'),
			};
		});
	}

	return calcResult(stats);
}

module.exports = {
	getRevenuesByQuery,
	getOccupancy,
	getPayoutStats,
};

const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const { eventEmitter, EVENTS } = require('@utils/events');
const { formatPrice } = require('@utils/func');
const ThrowReturn = require('@core/throwreturn');
const {
	PayoutType,
	PayoutStates,
	BookingStatus,
	RateType,
	// Currency,
	PayoutCollectStatus,
	MessageSentType,
	OTTs,
	PayoutPayMethods,
	TransactionStatus,
	RolePermissons,
} = require('@utils/const');
const { getIdsByQuery } = require('@utils/mongo');
const { logger } = require('@utils/logger');
const { getArray } = require('@utils/query');
const models = require('@models');
const Payment = require('@controllers/ota_api/payments');
const messageOTT = require('@controllers/message/ott');
const BankServices = require('@services/bank');

const { earningStats } = require('./stats');
const { LOG_FIELDS_LABELS, LOG_VALUES_MAPPER } = require('./const');

async function validateQuery({ from, to, blockIds, otas, roomIds, hosting, ...q }, limitRange) {
	if (from) {
		from = new Date(from).minTimes();
	}
	if (to) {
		to = new Date(to).maxTimes();
	}
	if (limitRange) {
		const MAX_DAY = 90;
		if (moment(to).diff(from, 'day') > MAX_DAY) {
			throw new ThrowReturn(`Thời gian vui lòng không vượt quá ${MAX_DAY} ngày!`);
		}
	}
	if (blockIds) {
		blockIds = getArray(blockIds).toMongoObjectIds();
	}
	if (otas) {
		otas = await models.BookingSource.getSourceByGroup(getArray(otas));
	}
	if (roomIds) {
		roomIds = getArray(roomIds).toMongoObjectIds();
	}
	if (hosting) {
		hosting = getArray(hosting).toMongoObjectIds();
	}
	if (q.categoryId) {
		q.categoryId = getArray(q.categoryId).toMongoObjectIds();
	}
	if (q.createdBy) {
		q.createdBy = getArray(q.createdBy).toMongoObjectIds();
	}
	if (q.states) {
		q.states = getArray(q.states);
	}
	if (q.serviceType) {
		q.serviceType = parseInt(q.serviceType) || null;
	}
	if (q.status) {
		q.status = getArray(q.status);
	}
	if (q.payoutType) {
		q.payoutType = getArray(q.payoutType);
	}
	if (q['currencyAmount.exchangedAmount']) {
		q['currencyAmount.exchangedAmount'] =
			_.toNumber(_.trim(q['currencyAmount.exchangedAmount']).replace(/,/g, '')) || null;
	}
	if (q.priority) {
		q.priority = parseInt(q.priority);
	}
	if (q.payStatus) {
		q.payStatus = getArray(q.payStatus);
	}

	q.sms = _.trim(q.sms);
	q.description = _.trim(q.description);
	q.dateType = q.dateType || 'paidAt';

	const sortMapper = {
		checkin: 'from',
		checkout: 'to',
	};

	const sorter = {
		[sortMapper[q.sort] || q.sort || 'createdAt']: q.sortType === 'asc' ? 1 : -1,
	};

	return { ...q, sorter, from, to, blockIds, otas, roomIds, hosting };
}

async function getRevenues(dquery, user) {
	const {
		from,
		to,
		blockIds,
		otas,
		roomIds,
		hosting,
		createdBy,
		collector,
		states,
		source,
		description,
		sms,
		dateType,
		showSMS,
		serviceType,
		isAvoidTransactionFee,
		isOwnerCollect,
		isEmptyBookingId,
		isCalcDeposit,
		start,
		limit,
		otaBookingId,
		inReport,
		payoutType,
		'currencyAmount.exchangedAmount': amount,
		collectStatus,
		collectSAStatus,
		excludeBlockId,
		sorter,
	} = await validateQuery(dquery);

	const blockKey = 'blockIds';
	const roomKey = 'roomIds';

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockIds,
		excludeBlockId,
		blockKey,
		roomKey,
	});

	const types = [
		PayoutType.RESERVATION,
		PayoutType.DEPOSIT,
		PayoutType.SERVICE,
		// PayoutType.REFUND,
		PayoutType.VAT,
		PayoutType.OTHER,
	];

	const filter = {
		...filters,
		payoutType: { $in: payoutType ? _.intersection(payoutType, types) : types },
		state: states ? { $in: states } : { $ne: PayoutStates.DELETED },
	};

	if (isAvoidTransactionFee) filter.isAvoidTransactionFee = isAvoidTransactionFee === 'true' || { $ne: true };
	if (isOwnerCollect) filter.isOwnerCollect = isOwnerCollect === 'true' || { $ne: true };
	if (isEmptyBookingId) filter.bookingId = isEmptyBookingId === 'true' ? { $eq: null } : { $ne: null };
	if (isCalcDeposit) filter.isCalcDeposit = isCalcDeposit === 'true' ? { $eq: true } : { $ne: true };
	if (otas) filter.otaName = { $in: otas };
	if (source) filter.source = source;
	if (createdBy) filter.createdBy = { $in: createdBy };
	if (collector) {
		if (mongoose.Types.ObjectId.isValid(collector)) {
			filter.collector = mongoose.Types.ObjectId(collector);
		} else {
			filter.collectorCustomName = collector;
		}
	}
	if (description) filter.description = new RegExp(_.escapeRegExp(description), 'i');
	if (inReport) filter.inReport = inReport === 'true';
	if (_.isNumber(amount)) {
		filter['currencyAmount.exchangedAmount'] = amount;
	}
	if (collectStatus) filter.collectStatus = collectStatus;
	if (collectSAStatus) filter.collectSAStatus = collectSAStatus;

	if (sms) {
		const smsIds = await getIdsByQuery(models.SMSMessage, {
			hasPayout: true,
			'data.body': new RegExp(_.escapeRegExp(sms), 'i'),
		});
		filter.smsId = { $in: smsIds };
	}

	// filter for bookings
	const bookingFilter = {};
	if (hosting) bookingFilter.hosting = { $in: hosting };
	if (roomIds) _.set(bookingFilter, 'reservateRooms.$in', roomIds);
	if (serviceType) bookingFilter.serviceType = serviceType;
	if (otaBookingId) bookingFilter.otaBookingId = new RegExp(_.escapeRegExp(otaBookingId), 'i');
	if (dateType === 'checkin') bookingFilter.from = { $gte: from, $lte: to };
	else if (dateType === 'checkout') bookingFilter.to = { $gte: from, $lte: to };
	else {
		filter[dateType] = { $gte: from, $lte: to };
		if (!_.isEmpty(bookingFilter)) {
			bookingFilter.from = { $lte: moment(to).add(30, 'day').toDate() };
			bookingFilter.to = { $gt: moment(from).add(-60, 'day').toDate() };
		}
	}

	if (!_.isEmpty(bookingFilter)) {
		if (filters.$or) {
			bookingFilter.$or = filters.$or.map(f =>
				_.pickBy({
					blockId: f[blockKey],
					reservateRooms: f[roomKey],
				})
			);
		} else {
			bookingFilter.blockId = filters[blockKey];
		}

		const bookingIds = await getIdsByQuery(models.Booking, bookingFilter);
		filter.bookingId = { $in: [...bookingIds] };
	}

	const populateFields = [
		{
			path: 'blockIds',
			select: 'info.name',
		},
		{
			path: 'confirmedBy createdBy categoryId',
			select: 'username name',
		},
		{ path: 'smsId', select: 'phone data' },
		{
			path: 'bookingId',
			select: '_id from to price otaName otaBookingId currency blockId otaFee guestId status',
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
		},
		{
			path: 'export',
			select: 'noId name -payouts',
			match: { state: { $ne: PayoutStates.DELETED } },
		},
	];

	const [data, totalRevenues] = await Promise.all([
		models.Payout.find(filter)
			.select('-logs')
			.sort(sorter)
			.skip(start)
			.limit(limit)
			.populate(populateFields)
			.lean(),
		models.Payout.countDocuments(filter),
		// models.Payout.aggregate()
		// 	.match(filter)
		// 	.group({ _id: '$source', amount: { $sum: '$currencyAmount.exchangedAmount' } }),
	]);

	const hasPayoutFee = {};
	const payoutSms = [];

	const revenues = data.map(payout => {
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

		if (showSMS && payout.smsId) {
			payoutSms.push(payout.smsId);
		}

		return payout;
	});

	if (payoutSms.length) {
		await models.SMSMessage.parseMessages(payoutSms, user);
	}

	// const total = { amounts: { [Currency.VND]: _.sumBy(stats, 'amount') } };
	// _.forEach(stats, g => {
	// 	total[g._id] = g.amount;
	// });

	return {
		revenues,
		totalRevenues,
		// total,
		start,
		limit,
	};
}

async function getUnPaid(dquery, user) {
	const {
		from,
		to,
		blockIds,
		otas,
		roomIds,
		otaBookingId,
		paymentState,
		hosting,
		dateType,
		serviceType,
		status,
		start,
		limit,
		sorter,
		excludeBlockId,
		'currencyAmount.exchangedAmount': amount,
	} = await validateQuery(dquery);

	const query = {
		ignoreFinance: false,
		status: {
			$in: [BookingStatus.CONFIRMED, BookingStatus.CANCELED, BookingStatus.NOSHOW, BookingStatus.CHARGED],
		},
		isPaid: false,
	};

	if (dateType === 'checkin') {
		query.from = { $gte: from, $lte: to };
	} else if (dateType === 'checkout') {
		query.to = { $gte: from, $lte: to };
	} else if (dateType === 'createdAt') {
		query.createdAt = { $gte: from, $lte: to };
	} else {
		query.from = { $lte: to };
		query.to = { $gt: from };
	}
	if (status) {
		query.status = status;
	}
	if (paymentState && paymentState !== 'all') {
		query.rateType = paymentState === 'paid' ? RateType.PAY_NOW : RateType.PAY_AT_PROPERTY;
	}
	if (otaBookingId) query.otaBookingId = otaBookingId;
	if (otas) query.otaName = { $in: otas };
	if (hosting) query.hosting = { $in: hosting };

	const userBlock = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockIds, excludeBlockId });
	const blocks = await models.Block.find({ _id: userBlock.blockIds, ignorePrice: false }).select('_id');
	const filterdBlockIds = _.map(blocks, '_id');

	if (filterdBlockIds.length > 1) {
		const { filter } = await models.Block.getStartRunningFilters(filterdBlockIds);
		_.assign(query, filter);
	} else {
		query.blockId = { $in: filterdBlockIds };
	}

	if (roomIds) _.set(query, 'reservateRooms.$in', roomIds);
	if (userBlock.excludeRoomIds) _.set(query, 'reservateRooms.$nin', query.excludeRoomIds);
	if (serviceType) query.serviceType = serviceType;
	if (_.isNumber(amount)) {
		query.price = amount;
	}

	const [bookings, total] = await Promise.all([
		models.Booking.find(query)
			.select(
				'price otaFee currency from to otaName blockId otaBookingId guestId status error hosting reservateRooms rateType'
			)
			.skip(start)
			.limit(limit)
			.sort(sorter)
			.populate('blockId', 'info.name info.shortName')
			.populate('guestId', 'displayName name fullName avatar')
			.populate('hosting', 'username name')
			.populate('reservateRooms', 'info.name info.roomNo')
			.lean(),
		models.Booking.countDocuments(query),
	]);

	const revenues = bookings.map(booking => {
		return {
			_id: booking._id,
			hosting: booking.hosting ? [booking.hosting] : [],
			currencyAmount: {
				amount: 0,
				currency: booking.currency,
				exchangedAmount: 0,
			},
			payoutType: PayoutType.RESERVATION,
			blockIds: [booking.blockId],
			bookingId: booking,
			roomIds: booking.reservateRooms,
			otaName: booking.otaName,
		};
	});

	return { revenues, totalRevenues: total, start, limit };
}

async function getPayMethods(payouts) {
	payouts
		.filter(payout => payout.payAccountId)
		.forEach(payout => {
			if (!payout.payStatus) payout.payStatus = TransactionStatus.WAITING;

			const isSupportAuto =
				_.get(payout, 'payDebitAccountId.serviceAccountId') ||
				(_.get(payout, 'payDebitAccountId.username') &&
					_.get(BankServices, [payout.payDebitAccountId.shortName, 'makeTranserRequest']));

			payout.payMethod = {
				type: isSupportAuto ? PayoutPayMethods.AUTO_BANKING : PayoutPayMethods.VIET_QR,
				needApprove: !!isSupportAuto,
			};
		});
}

async function getPayout(id, user) {
	const payout = await models.Payout.findById(id)
		.select('-logs')
		.populate([
			{
				path: 'blockIds',
				select: 'info.name',
			},
			{
				path: 'categoryId',
				select: 'name',
			},
			{
				path: 'assetId',
			},
			{
				path: 'confirmedBy createdBy categoryId',
				select: 'username name hasAsset',
			},
			{
				path: 'export',
				select: 'payouts noId name createdBy',
				match: { state: { $ne: PayoutStates.DELETED } },
				populate: {
					path: 'createdBy',
					select: 'username name',
				},
			},
			{
				path: 'payAccountId payDebitAccountId',
				select: 'no accountName sourceType name shortName accountNos bankId serviceAccountId',
				populate: {
					path: 'bankId',
				},
			},
			{
				path: 'taskId',
				select: 'no createdBy',
				populate: {
					path: 'createdBy',
					select: 'username name',
				},
			},
		]);

	return {
		payout,
	};
}

async function getPayouts(query, user) {
	let {
		from,
		to,
		blockIds,
		roomIds,
		createdBy,
		states,
		inReport,
		categoryId,
		distribute,
		source,
		description,
		isInternal,
		dateType,
		buyType,
		sort,
		sorter,
		start,
		limit,
		hasInvoice,
		excludeBlockId,
		payStatus,
		showPayMethod,
		payAccountId,
		payDebitAccountId,
		priority,
		period,
		'currencyAmount.exchangedAmount': amount,
		streamCategoryId,
		streamProjectId,
	} = await validateQuery(query);

	const blockKey = 'blockIds';
	const roomKey = 'roomIds';
	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockIds,
		excludeBlockId,
		blockKey,
		roomKey,
	});

	const types = [PayoutType.PAY, PayoutType.REFUND];

	const filter = {
		payoutType: { $in: types },
		state: states ? { $in: states } : { $ne: PayoutStates.DELETED },
		$and: [filters],
	};
	if (from) _.set(filter, [dateType, '$gte'], from);
	if (to) _.set(filter, [dateType, '$lte'], to);
	if (roomIds) _.set(filter, 'roomIds.$in', roomIds);
	if (categoryId) filter.categoryId = { $in: categoryId };
	if (source) filter.source = source;
	if (createdBy) filter.createdBy = { $in: createdBy };
	if (inReport) filter.inReport = inReport === 'true';
	if (distribute) filter.distribute = distribute === 'true';
	if (isInternal) filter.isInternal = isInternal === 'true' || { $ne: true };
	if (hasInvoice) filter.hasInvoice = hasInvoice === 'true' || { $ne: true };
	if (buyType) filter.buyType = buyType;
	if (description) filter.description = new RegExp(_.escapeRegExp(description), 'i');
	if (_.isNumber(amount)) filter['currencyAmount.exchangedAmount'] = amount;
	if (payStatus) {
		const isWaiting = _.includes(payStatus, TransactionStatus.WAITING);
		const arrStatus = _.uniq(isWaiting ? [null, ...payStatus] : payStatus);

		filter.inReport = true;
		filter.payAccountId = { $ne: null };
		filter.$or = arrStatus.map(sst => {
			const ft = { payStatus: sst };
			if (sst === null || sst === TransactionStatus.WAITING) {
				ft.payRequestId = null;
			}
			return ft;
		});

		if (!sort) {
			sorter = { payAccountId: 1, createdAt: -1 };
		}
	}
	if (showPayMethod) {
		filter.inReport = true;
		filter.payAccountId = { $ne: null };
		if (!filter.payStatus) {
			filter.payStatus = {
				$in: [null, TransactionStatus.WAITING, TransactionStatus.WAIT_FOR_APPROVE, TransactionStatus.ERROR],
			};
		}
	}
	if (payAccountId && mongoose.Types.ObjectId.isValid(payAccountId)) {
		filter.payAccountId = mongoose.Types.ObjectId(payAccountId);
	}
	if (payDebitAccountId && mongoose.Types.ObjectId.isValid(payDebitAccountId)) {
		filter.payDebitAccountId = mongoose.Types.ObjectId(payDebitAccountId);
	}
	if (_.isNumber(priority)) {
		filter.priority = priority === 0 ? { $in: [null, 0] } : priority;
	}
	if (period) {
		filter.startPeriod = { $lte: period };
		filter.endPeriod = { $gte: period };
	}
	if (streamCategoryId) {
		filter['reportStreams.streamCategoryId'] = mongoose.Types.ObjectId(streamCategoryId);
	}
	if (streamProjectId) {
		filter['reportStreams.streamProjectId'] = mongoose.Types.ObjectId(streamProjectId);
	}

	const [revenues, totalRevenues] = await Promise.all([
		models.Payout.find(filter)
			.select('-logs')
			.sort(sorter)
			.skip(start)
			.limit(limit)
			.populate([
				{
					path: 'blockIds',
					select: 'info.name',
				},
				{
					path: 'assetId',
				},
				{
					path: 'confirmedBy createdBy categoryId payConfirmedBy',
					select: 'username name hasAsset',
				},
				{
					path: 'export',
					select: 'noId name -payouts',
					match: { state: { $ne: PayoutStates.DELETED } },
				},
				{
					path: 'payAccountId payDebitAccountId',
					select: 'no accountName sourceType name shortName accountNos bankId username serviceAccountId',
					populate: {
						path: 'bankId',
					},
				},
				{
					path: 'autoId',
					select: 'name imports.type',
				},
				{
					path: 'taskId',
					select: 'no createdBy',
					populate: {
						path: 'createdBy',
						select: 'username name',
					},
				},
			])
			.lean(),
		models.Payout.countDocuments(filter),
		// models.Payout.aggregate()
		// 	.match(filter)
		// 	.group({ _id: '$source', amount: { $sum: '$currencyAmount.exchangedAmount' } }),
	]);

	if (showPayMethod) {
		await getPayMethods(revenues);
	}

	let hasViewPayroll;

	if (revenues.some(r => _.get(r.autoId, 'imports.type') === 'payroll')) {
		hasViewPayroll = await user.hasPermission(RolePermissons.VIEW_PAYROLL);
	}

	revenues.forEach(payout => {
		if (_.get(payout.autoId, 'imports.type') === 'payroll') {
			if (!hasViewPayroll) {
				_.unset(payout, 'payAccountId');
			}
		} else {
			_.unset(payout.payAccountId, 'no');
		}
	});

	// const total = { amounts: { [Currency.VND]: _.sumBy(stats, 'amount') } };
	// _.forEach(stats, g => {
	// 	total[g._id] = g.amount;
	// });

	return {
		revenues,
		totalRevenues,
		// total,
		start,
		limit,
	};
}

async function getStats(query, user) {
	const { from, to, type, blocks } = await validateQuery(query, true);

	const { filters, blockKey, roomKey } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blocks,
		blockKey: 'blockIds',
	});

	filters.payoutType = type || PayoutType.RESERVATION;
	filters.state = { $ne: PayoutStates.DELETED };

	const bookingFilters = {
		status: { $ne: BookingStatus.CANCELED },
		to: { $gte: from, $lte: to },
		ignoreFinance: false,
	};
	if (filters.$or) {
		bookingFilters.$or = filters.$or.map(f =>
			_.pickBy({
				blockId: f[blockKey],
				reservateRooms: f[roomKey],
			})
		);
	} else {
		bookingFilters.blockId = filters[blockKey];
	}

	const bookingIds = await getIdsByQuery(models.Booking, bookingFilters);
	filters.bookingId = { $in: bookingIds };

	const payouts = await models.Payout.find(filters)
		.select('currencyAmount.exchangedAmount payoutType blockIds otaName')
		.lean();

	const stats = { blocks: {}, otas: {} };

	payouts.forEach(data => {
		const { otaName, blockIds, payoutType, currencyAmount } = data;
		const blockId = _.get(blockIds, [0, '_id']) || 'unknown';

		if (!stats.blocks[blockId]) {
			stats.blocks[blockId] = {
				revenue: 0,
			};
		}
		if (!stats.blocks[blockId][otaName]) {
			stats.blocks[blockId][otaName] = 0;
		}
		if (!stats.otas[otaName]) {
			stats.otas[otaName] = 0;
		}

		const amount =
			payoutType === PayoutType.REFUND
				? -Math.abs(currencyAmount.exchangedAmount)
				: currencyAmount.exchangedAmount;

		stats.blocks[blockId].revenue += amount;
		stats.blocks[blockId][otaName] += amount;
		stats.otas[otaName] += amount;
	});

	return stats;
}

async function getTotalPaymentsOfBookings(bookings) {
	const payments = await models.Payout.find({
		payoutType: {
			$in: [PayoutType.RESERVATION, PayoutType.SERVICE, PayoutType.REFUND, PayoutType.VAT, PayoutType.OTHER],
		},
		state: { $ne: PayoutStates.DELETED },
		bookingId: { $in: bookings.map(b => b._id) },
	})
		.select('bookingId payoutType currencyAmount.exchangedAmount')
		.lean();
	const groupPayment = _.groupBy(payments, 'bookingId');

	// map booking and payment
	const analytic = bookings.map(book => {
		const bookingPayments = groupPayment[book._id];
		const paid = models.Payout.sumCollectedPayments(bookingPayments);

		const currencyAmount = {
			price: book.price,
			priceCurrency: book.currency,
			priceExchanged: models.Booking.exchangeCurrency(book.currencyExchange, book.currency)(book.price),
			paid,
			diff: 0,
		};
		currencyAmount.diff = Math.round(currencyAmount.paid - currencyAmount.priceExchanged);
		if (Math.abs(currencyAmount.diff) <= 2) {
			currencyAmount.diff = 0;
		}
		return { book, currencyAmount };
	});

	return analytic;
}

async function analyticReservations(query, user) {
	const from = query.from ? new Date(query.from) : moment().startOf('month').toDate();
	const to = query.to ? new Date(query.to) : moment().endOf('month').toDate();
	const diff = moment(to).diff(from, 'day');
	const MAX_DAY = 60;

	if (diff > MAX_DAY) {
		throw new ThrowReturn(`Thời gian vui lòng không vượt quá ${MAX_DAY} ngày!`);
	}

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: query.blockId,
		roomKey: 'reservateRooms',
	});

	const filter = {
		error: 0,
		status: BookingStatus.CONFIRMED,
		to: { $gte: from, $lte: to },
		ignoreFinance: false,
		...filters,
	};

	const bookings = await models.Booking.find(filter)
		.select('price otaFee currency currencyExchange from to otaBookingId otaName guestId')
		.populate('guestId', 'name fullName')
		.lean();

	return getTotalPaymentsOfBookings(bookings);
}

async function confirmPaid(userId, paidId) {
	await models.Payout.confirmPayout(userId, paidId);
}

async function getReport(period, blockId, ota) {
	if (!Payment[ota] || !Payment[ota].getReport) {
		throw new ThrowReturn('Not yet support');
	}

	const reports = await Payment[ota].getReport(period, blockId);

	return reports.asyncMap(async report => {
		const allBookings = await models.Booking.find({
			otaName: report.otaName,
			otaBookingId: { $in: _.map(report.reports, 'otaBookingId') },
		})
			.select('_id otaBookingId price roomPrice otaFee paid')
			.lean();

		const bookingGroups = _.groupBy(allBookings, 'otaBookingId');

		_.forEach(report.reports, record => {
			const bookings = bookingGroups[record.otaBookingId];

			if (bookings) {
				record.bookingId = _.get(bookings, [0, '_id']);

				const confirmedBookings = bookings.filter(b => b.status !== BookingStatus.CANCELED);

				record.currentPrice = _.sumBy(confirmedBookings, 'roomPrice');
				record.currentFee = _.sumBy(confirmedBookings, 'otaFee');
				record.currentStatus = _.get(confirmedBookings, [0, 'status']) || _.get(bookings, [0, 'status']);
				record.paid =
					_.sumBy(confirmedBookings, 'paid') - (_.sumBy(confirmedBookings, 'price') - record.currentPrice);
			} else {
				record.paid = 0;
				record.currentPrice = 0;
				record.currentFee = 0;
			}

			record.diff = record.paid - record.price;
		});

		const totalKeys = ['price', 'paid', 'diff', 'fee'];

		report.total = {};
		totalKeys.forEach(k => {
			report.total[k] = _.round(_.sumBy(report.reports, k)) || 0;
		});

		return report;
	});
}

async function getReservations(user, query) {
	let { blockId, dateKey, from, to, byDays, canceled, isExportReservations, realPayout } = query;

	from = new Date(from).zeroHours();
	to = new Date(to).zeroHours();

	const MAX_MONTH = 6;
	const diffMonth = moment(to).diff(from, 'month');
	if (diffMonth > MAX_MONTH) {
		throw new ThrowReturn(`Thời gian vui lòng không vượt quá ${MAX_MONTH} tháng!`);
	}

	byDays = byDays === 'true';
	canceled = canceled === 'true';
	isExportReservations = isExportReservations === 'true';
	realPayout = realPayout = 'true';

	const rates = {};

	const { filters, blockIds } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		roomKey: 'reservateRooms',
	});

	const results = [];
	const dateMapKeys = {
		checkin: 'from',
		checkout: 'to',
		created: 'createdAt',
		distribute: 'distribute',
	};

	const calcStatsToRates = async (_from, _to) => {
		const { earning, reservations, revenues, exportReservations, charts } = await earningStats({
			blockId: blockIds,
			filters,
			from: _from,
			to: _to,
			dateKey: dateMapKeys[dateKey],
			findCanceled: canceled,
			isExportReservations,
			byDays,
			populatePayoutUser: false,
			realPayout,
		});
		results.push([_from, { earning, reservations, revenues, exportReservations, charts }]);
	};

	let concurrents = [];
	if (byDays) {
		const MaxConcurrent = 31;
		while (from <= to) {
			const promise = calcStatsToRates(new Date(from), new Date(from));
			concurrents.push(promise);

			if (concurrents.length >= MaxConcurrent) {
				await Promise.all(concurrents);
				concurrents = [];
			}

			from.setDate(from.getDate() + 1);
		}
	} else {
		while (from < to) {
			let _from = new Date(from);

			from.setMonth(from.getMonth() + 1);
			from.setDate(1);

			let _to = new Date(from);
			_to.setDate(_to.getDate() - 1);

			if (_to > to) {
				_to = to;
			}

			const promise = calcStatsToRates(_from, _to);
			concurrents.push(promise);
		}
	}

	await Promise.all(concurrents);

	results
		.sort((a, b) => a[0].getTime() - b[0].getTime())
		.forEach(([_from, data]) => {
			rates[_from.toDateMysqlFormat()] = data;
		});

	return { rates };
}

async function updatePayoutInvoices(payoutId, body) {
	const payout = await models.Payout.findById(payoutId);
	if (!payout) {
		throw new ThrowReturn('Payout not found');
	}

	const allowKeys = ['images', 'historyAttachments'];

	allowKeys.forEach(key => {
		if (body[key]) {
			payout[key] = body[key];
		}
	});

	if (body.images) {
		payout.images = body.images;
	}
	if (body.historyAttachments) {
		payout.historyAttachments = body.historyAttachments;
	}
	await payout.save();

	return _.pick(payout, allowKeys);
}

function parseVal(val, field, language) {
	if (val === undefined || val === null) return '';
	if (_.isBoolean(val)) {
		return _.get(LOG_VALUES_MAPPER, [val, language], val);
	}

	return _.get(LOG_VALUES_MAPPER, [field, val, language], val);
}

function findAndMapLabel(log, data, key, isArray) {
	if (log.oldData) {
		const oldData = data.find(u => u._id.equals(isArray ? _.head(log.oldData) : log.oldData));
		if (oldData) {
			log.oldData = typeof key === 'string' ? _.get(oldData, key) : key(oldData);
		}
	}
	if (log.newData) {
		const newData = data.find(u => u._id.equals(isArray ? _.head(log.newData) : log.newData));
		if (newData) {
			log.newData = typeof key === 'string' ? _.get(newData, key) : key(newData);
		}
	}
}

async function parseLog(log, language) {
	const userFields = ['collector', 'confirmedBy'];

	if (userFields.includes(log.field)) {
		const users = await models.User.find({
			_id: _.compact([log.oldData, log.newData]),
		})
			.select('name username')
			.lean();

		findAndMapLabel(log, users, 'name');
	}

	const bankAccountFields = ['payDebitAccountId', 'payAccountId'];
	if (bankAccountFields.includes(log.field)) {
		const accounts = await models.BankAccount.find({
			_id: _.compact([log.oldData, log.newData]),
		})
			.select('name accountNos accountName shortName')
			.lean();

		findAndMapLabel(log, accounts, account => {
			return account.accountNos[0]
				? `STK ${account.accountNos[0]} - ${account.accountName} - ${account.shortName}`
				: account.name;
		});
	}

	if (log.field === 'categoryId') {
		const ctgs = await models.PayoutCategory.find({
			_id: _.compact([log.oldData, log.newData]),
		})
			.select('name')
			.lean();

		findAndMapLabel(log, ctgs, 'name');
	}

	if (log.field === 'blockIds') {
		const blockds = await models.Block.find({
			_id: _.compact([_.head(log.oldData), _.head(log.newData)]),
		})
			.select('info.name')
			.lean();

		findAndMapLabel(log, blockds, 'info.name', true);
	}

	const txt = `${_.get(LOG_FIELDS_LABELS[log.field], language, log.field)}: ${parseVal(
		log.oldData,
		log.field,
		language
	)} -> ${parseVal(log.newData, log.field, language)}`;

	if (!log.by) {
		log.by = {
			name: 'Hệ thống',
			_id: 0,
		};
	}

	return {
		...log,
		parsed: txt,
	};
}

async function getPayoutLogs(payoutId, language) {
	const payout = await models.Payout.findById(payoutId).select('logs').populate('logs.by', 'name username').lean();
	if (!payout) {
		throw new ThrowReturn('Payout not found');
	}

	const logs = payout.logs ? await payout.logs.asyncMap(log => parseLog(log, language)) : [];

	return {
		logs: logs.reverse(),
	};
}

function sendMessage(data, retry = 0) {
	return messageOTT.sendOTTMessage(data).catch(e => {
		if (retry < 1) {
			return sendMessage(data, retry + 1);
		}
		logger.error(e);
	});
}

async function sendPaymentConfirmation(payout) {
	if (
		payout.payoutType === PayoutType.PAY ||
		payout.payoutType === PayoutType.PREPAID ||
		payout.payoutType === PayoutType.CURRENCY_EXCHANGE
	) {
		throw new ThrowReturn('Thanh toán không hợp lệ!');
	}

	const isConfirmed = payout.collectStatus === PayoutCollectStatus.Confirmed;

	const collector = await models.User.findById(payout.collector).select('otts');
	if (!collector) {
		throw new ThrowReturn('Người dùng không tồn tại trên hệ thống!');
	}

	const otts = _.filter(collector.otts, o => o.ottName === OTTs.Zalo);
	if (!otts.length) {
		throw new ThrowReturn('Người dùng chưa được cấu hình Zalo ID!');
	}

	if (isConfirmed && payout.collectSAStatus !== PayoutCollectStatus.Pending) {
		payout.collectSAStatus = PayoutCollectStatus.Pending;
		await payout.save();
	} else if (payout.collectStatus !== PayoutCollectStatus.Pending) {
		payout.collectStatus = PayoutCollectStatus.Pending;
		await payout.save();
	}

	let txtPrice = formatPrice(payout.currencyAmount.exchangedAmount);
	let txtHome;
	let txtRoom;
	let txtBookingId;
	let txtFrom;
	let txtTo;

	if (payout.bookingId) {
		const booking = await models.Booking.findById(payout.bookingId)
			.select('reservateRooms blockId otaBookingId from to')
			.populate('reservateRooms', 'info.roomNo')
			.populate('blockId', 'info.name info.shortName');

		txtRoom = _.get(booking, ['reservateRooms', 0, 'info', 'roomNo']);
		txtBookingId = _.get(booking, 'otaBookingId');
		txtHome = _.get(booking, 'blockId.info.name');

		txtFrom = moment(booking.from).format('DD/MM/YYYY');
		txtTo = moment(booking.to).format('DD/MM/YYYY');
	} else {
		const room =
			payout.roomIds &&
			payout.roomIds.length &&
			(await models.Room.findOne({ _id: payout.roomIds }).select('info.roomNo'));
		if (room) {
			txtRoom = _.get(room, ['info', 'roomNo']);
		}
		const home = await models.Block.findById(payout.blockIds).select('info.name info.shortName');
		txtHome = _.get(home, 'info.name');
	}

	let sent = false;

	const ynText = `1 (Đồng ý) \n2 (Từ chối)`;

	const text = isConfirmed
		? `${_.compact([
				'Bạn vừa thu của khách hàng',
				txtRoom && `phòng ${txtRoom}`,
				txtHome && `cơ sở ${txtHome}`,
				`số tiền ${txtPrice}`,
				txtFrom && `ngày nhận phòng ${txtFrom}`,
				txtTo && `ngày trả phòng ${txtTo}`,
				txtBookingId && `mã đặt phòng ${txtBookingId}`,
		  ]).join(' - ')}.\nBạn có muốn khấu trừ vào lương cuối tháng? \n${ynText}`
		: `${_.compact([
				`Xin mời xác nhận bạn vừa nhận số tiền ${txtPrice} tại cơ sở ${txtHome}`,
				txtRoom && `phòng ${txtRoom}`,
				txtFrom && `ngày nhận phòng ${txtFrom}`,
				txtTo && `ngày trả phòng ${txtTo}`,
				txtBookingId && `mã đặt phòng ${txtBookingId}`,
		  ]).join(' - ')}\n${ynText}`;

	await otts
		.filter(ott => ott.ottName === OTTs.Zalo)
		.asyncForEach(async ott => {
			if (sent) return;

			const msg = await sendMessage({
				ottName: ott.ottName,
				sender: ott.ottPhone,
				phone: ott.ottId,
				text,
				ottData: {
					messageType: isConfirmed
						? MessageSentType.PAYMENT_SA_CONFIRMATION
						: MessageSentType.PAYMENT_CONFIRMATION,
					payoutId: payout._id,
					toId: ott.ottId,
				},
			});

			if (msg) {
				sent = true;
			}
		});
}

async function onReceivedConfirmationPayment({ payoutId, user, userOtt, confirmed, messageType }) {
	if (
		messageType !== MessageSentType.PAYMENT_CONFIRMATION &&
		messageType !== MessageSentType.PAYMENT_SA_CONFIRMATION
	) {
		return;
	}

	try {
		const payout = await models.Payout.findById(payoutId);

		const msgData = {
			ottName: userOtt.ottName,
			sender: userOtt.ottPhone,
			phone: userOtt.ottId,
		};
		const keyType = messageType === MessageSentType.PAYMENT_CONFIRMATION ? 'collectStatus' : 'collectSAStatus';

		if (
			// payout[keyType] === PayoutCollectStatus.Confirmed ||
			payout.state === PayoutStates.DELETED
		) {
			await sendMessage({
				...msgData,
				text: 'Yêu cầu đã được xử lí hoặc quá hạn!',
			});
			return;
		}

		msgData.ottData = {
			payoutId: payout._id,
			toId: userOtt.ottId,
		};

		const dMsg = 'Bạn cần hoàn trả ngay về bộ phận kế toán/vận hành trong vòng 24 tiếng theo đúng quy định';
		const now = new Date();

		if (keyType === 'collectStatus') {
			if (confirmed) {
				payout[keyType] = PayoutCollectStatus.Confirmed;
				await payout.save();

				const currentAdv = await user.getCurrentAdvSalary(payout.paidAt);
				if (currentAdv < user.getPaymentCollectLimit(now)) {
					await sendPaymentConfirmation(payout);
					return;
				}
				msgData.text = dMsg;
			} else {
				msgData.text = 'Đã xác nhận từ chối thu tiền.';
				payout[keyType] = PayoutCollectStatus.Reject;
				await payout.save();
			}
		} else {
			if (confirmed) {
				const currentAdv = await user.getCurrentAdvSalary(payout.paidAt);
				const newAdb = currentAdv + payout.currencyAmount.exchangedAmount;

				if (newAdb < user.getPaymentCollectLimit(now)) {
					msgData.text = `Đã xác nhận cấn trừ vào lương số tiền ${formatPrice(
						payout.currencyAmount.exchangedAmount
					)}. \nTổng số tiền dư nợ cấn trừ lương của bạn là: ${formatPrice(
						newAdb
					)}, số tiền sẽ được trích vào lương của bạn vào cuối tháng ${moment(now).format('MM/Y')}.`;

					payout[keyType] = PayoutCollectStatus.Confirmed;
				} else {
					msgData.text = `Dư nợ hiện tại không đủ. ${dMsg}`;
				}
			} else {
				msgData.text = `Xác nhận không cấn trừ lương. ${dMsg}`;
				payout[keyType] = PayoutCollectStatus.Reject;
			}

			await payout.save();
		}

		await sendMessage(msgData);
	} catch (err) {
		logger.error(err);
	}
}

async function onCreatePayout(payout) {
	try {
		if (payout.collectStatus === PayoutCollectStatus.Pending) {
			await sendPaymentConfirmation(payout);
		} else if (payout.collectStatus === PayoutCollectStatus.Confirmed) {
			const user = await models.User.findById(payout.collector);
			if (user) {
				const currentAdv = await user.getCurrentAdvSalary(payout.paidAt);
				if (currentAdv < user.getPaymentCollectLimit(payout.createdAt)) {
					await sendPaymentConfirmation(payout);
				}
			}
		}
	} catch (e) {
		logger.error(e);
	}
}

async function reSendPaymentConfirmation(payoutId, user) {
	const payout = await models.Payout.findById(payoutId);
	if (!payout) {
		throw new ThrowReturn('Thanh toán không tồn tại!');
	}

	await sendPaymentConfirmation(payout, user);
}

eventEmitter.on(EVENTS.CREATE_PAYOUT, onCreatePayout);
eventEmitter.on(EVENTS.RECEIVED_PAYOUT_CONFIRMATION, onReceivedConfirmationPayment);

module.exports = {
	confirmPaid,
	getRevenues,
	getPayouts,
	getStats,
	analyticReservations,
	getUnPaid,
	getReport,
	getReservations,
	updatePayoutInvoices,
	getPayoutLogs,
	reSendPaymentConfirmation,
	getPayout,
};

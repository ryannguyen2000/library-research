const _ = require('lodash');
const moment = require('moment');
const ThrowReturn = require('@core/throwreturn');
const {
	PropertyCIType,
	PayoutStates,
	HANDOVER_STATUS,
	PayoutType,
	CASHIER_TYPE,
	RolePermissons,
} = require('@utils/const');
const { getArray } = require('@utils/query');
const { Settings } = require('@utils/setting');
const { updateDoc } = require('@utils/schema');
const models = require('@models');

async function checkForHandover(user, params) {
	const { block, cashierId } = params;

	let handover = block
		? null
		: await models.Handover.findOne(_.pickBy({ userId: user._id, status: HANDOVER_STATUS.PROCESSING, cashierId }));

	if (!handover) {
		if (!block || block.ciType !== PropertyCIType.Receptionist) return null;

		let [cashier] = await models.Cashier.findOrCreate({
			cashierId,
			blockId: block._id,
		});

		handover = await models.Handover.findOne({ blockId: block._id, cashierId: cashier._id }).sort({
			createdAt: -1,
		});
		if (!handover) {
			handover = await models.Handover.create({
				blockId: block._id,
				cashierId: cashier._id,
				startTime: new Date(),
				endTime: new Date(),
				status: HANDOVER_STATUS.CONFIRMED,
			});
		}
	}

	const canStart = handover.checkCanStart(user);
	const canEnd = handover.checkCanEnd(user);
	if (!canStart && !canEnd) return null;

	await models.Handover.populate(handover, [
		{
			path: 'userId',
			select: 'name username',
		},
		{
			path: 'blockId',
			select: 'info.name info.shortName',
		},
		{
			path: 'cashierId',
		},
		{
			path: 'payouts',
			select: '-logs',
		},
	]);

	if (canEnd) {
		await handover.syncTransactions();
	}

	return {
		data: handover,
		canStart,
		canEnd,
	};
}

async function getHandovers(user, params) {
	const {
		start,
		limit: _limit,
		blockId: _blockId,
		startTime,
		endTime,
		hasStartProplem,
		hasEndProplem,
		cashierId,
	} = params;

	const skip = parseInt(start) || 0;
	const limit = parseInt(_limit) || 20;

	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: getArray(_blockId) });

	const filter = {
		blockId: blockIds,
		userId: { $ne: null },
	};
	if (startTime) {
		_.set(filter, ['endTime', '$gte'], moment(startTime).startOf('date').toDate());
	}
	if (endTime) {
		_.set(filter, ['startTime', '$lte'], moment(endTime).endOf('date').toDate());
	}
	if (hasStartProplem) {
		filter.hasStartProplem = hasStartProplem === 'true';
	}
	if (hasEndProplem) {
		filter.hasEndProplem = hasEndProplem === 'true';
	}
	if (cashierId) {
		filter.cashierId = cashierId;
	}

	const handover = await models.Handover.find(filter)
		.sort({ createdAt: -1 })
		.skip(skip)
		.limit(limit)
		.populate('userId', 'name username')
		.populate('blockId', 'info.name info.shortName')
		.populate('cashierId');
	const total = await models.Handover.countDocuments(filter);

	return {
		data: handover,
		total,
	};
}

async function getHandover(user, id) {
	const handover = await models.Handover.findById(id)
		.populate('userId', 'name username')
		.populate('blockId', 'info.name info.shortName')
		.populate('cashierId')
		.populate('payouts', '-logs');

	handover.transactions = await handover.getTransactions();
	handover.totalCollectedAmount = handover.getTotalCollected();
	handover.totalRequiredAmount = handover.getTotalRequired();
	handover.totalAdvAmount = handover.getTotalAdv();

	await models.Handover.populate(handover, [
		{
			path: 'transactions.bookingId',
			select: 'otaName otaBookingId guestId',
			populate: {
				path: 'guestId',
				select: 'displayName fullName name',
			},
		},
		{
			path: 'transactions.payoutId',
			select: '-logs',
		},
	]);

	return {
		data: handover,
	};
}

async function acceptHandover(user, id, params) {
	const { startReason } = params;

	const handover = await models.Handover.findById(id);
	if (!handover) {
		throw new ThrowReturn().status(404);
	}

	const canStart = handover.checkCanStart(user);
	if (!canStart) {
		throw new ThrowReturn('Không thể bắt đầu ca!');
	}

	const newHandover = await models.Handover.create({
		startReason,
		userId: user._id,
		startCash: handover.endCash,
		cashierId: handover.cashierId,
		cashierType: handover.cashierType,
		blockId: handover.blockId,
	});

	handover.nextId = newHandover._id;
	await handover.save();

	return {
		data: newHandover,
	};
}

async function requestHandover(user, id, body) {
	const { endReason, endCash } = body;

	const handover = await models.Handover.findById(id);
	if (!handover) {
		throw new ThrowReturn().status(404);
	}

	const canEnd = handover.checkCanEnd(user);
	if (!canEnd) {
		throw new ThrowReturn('Không thể nhận yêu cầu!');
	}

	if (!endCash) {
		throw new ThrowReturn('Hãy nhập mệnh giá tiền!');
	}

	if (handover.payouts.some(p => p.inReport)) {
		throw new ThrowReturn('Có thanh toán đã được tạo báo cáo!');
	}

	// const isAccountant = user.role === UserRoles.ACCOUNTANT;
	const isAccountant = await user.hasPermission(RolePermissons.FINANCE_APPROVE_REPORT);

	await handover.syncTransactions();
	handover.endTime = new Date();
	handover.endCash = endCash;
	handover.status = HANDOVER_STATUS.DONE;
	handover.endReason = endReason;
	handover.hasEndProplem = !isAccountant && handover.endPrice < handover.totalRequiredAmount;

	await handover.save();

	if (handover.payouts.length) {
		const total = models.Payout.sumCollectedPayments(handover.payouts);
		const mtime = moment(handover.endTime);

		const payoutExport = await models.PayoutExport.createExport({
			payoutType: PayoutType.RESERVATION,
			name: `Bàn giao quỹ lúc ${mtime.format('HH:mm')} ngày ${mtime.format('DD/MM/Y')}`,
			payouts: _.map(handover.payouts, '_id'),
			currencyAmount: {
				VND: total,
			},
			handoverId: handover._id,
			groupIds: user.groupIds,
		});
		await payoutExport.confirm({ userId: user._id });

		await models.Handover.updateOne(
			{
				_id: handover._id,
			},
			{
				payoutExportId: payoutExport._id,
			}
		);

		// handover.payoutExportId = payoutExport._id;
	}

	// if (payoutExport) {
	// 	await payoutExport.confirm({ userId: user._id });
	// }

	if (isAccountant) {
		// const handovers = await models.Handover.find({
		// 	cashierId: handover.cashierId,
		// 	payoutExportId: { $ne: null },
		// 	status: HANDOVER_STATUS.DONE,
		// }).select('payoutExportId payouts');

		// if (handovers.length) {
		// 	const allPayouts = _.flatten(handovers.map(h => h.payouts));
		// 	const allExportIds = handovers.map(h => h.payoutExportId);

		// 	await models.Payout.confirmPayout(user._id, allPayouts);
		// 	await models.PayoutExport.updateMany(
		// 		{ _id: allExportIds },
		// 		{
		// 			confirmedBy: user._id,
		// 			confirmedDate: new Date(),
		// 		}
		// 	);
		// 	await models.Handover.updateMany({ _id: _.map(handovers, '_id') }, { status: HANDOVER_STATUS.CONFIRMED });
		// }

		await models.Handover.updateMany(
			{ cashierId: handover.cashierId, status: HANDOVER_STATUS.DONE, payoutExportId: { $ne: null } },
			{ status: HANDOVER_STATUS.CONFIRMED }
		);
	}

	return {
		data: handover,
	};
}

async function getCashiers(user, params) {
	const { block } = params;
	if (!block || block.ciType !== PropertyCIType.Receptionist)
		return {
			data: [],
		};

	const cashiers = await models.Cashier.findOrCreate({ blockId: block._id });

	return {
		data: cashiers,
	};
}

async function createCurrencyExchange(user, params) {
	const { handoverId, currencyAmount, description } = params;

	const handover = await models.Handover.findById(handoverId).populate('cashierId');

	if (!handover.checkCanEnd(user)) {
		throw new ThrowReturn().status(403);
	}
	if (!currencyAmount || handover.cashierType !== CASHIER_TYPE.CURRENCY_EXCHANGE) {
		throw new ThrowReturn('Params invalid!');
	}
	if (!handover.cashierId.currency.includes(currencyAmount.currency)) {
		throw new ThrowReturn(`Không hỗ trợ quy đổi ${currencyAmount.currency}`);
	}
	if (currencyAmount.exchange < Settings.BuyCurrencyExchange.value) {
		throw new ThrowReturn(`Tỷ lệ quy đổi phải lớn hơn hoặc bằng ${Settings.BuyCurrencyExchange.value}`);
	}

	const data = await models.Payout.create({
		payoutType: PayoutType.CURRENCY_EXCHANGE,
		currencyAmount,
		createdBy: user._id,
		handoverId: handover._id,
		description,
	});

	handover.payouts.push(data._id);
	await handover.save();

	return {
		data,
	};
}

async function updateCurrencyExchange(user, id, params) {
	const { currencyAmount, description } = params;

	const payout = await models.Payout.findOne({ _id: id, payoutType: PayoutType.CURRENCY_EXCHANGE }).populate(
		'handoverId'
	);

	if (!payout) {
		throw new ThrowReturn().status(404);
	}
	if (!payout.handoverId.checkCanEnd(user)) {
		throw new ThrowReturn().status(403);
	}

	if (
		currencyAmount &&
		currencyAmount.exchange &&
		currencyAmount.exchange !== payout.currencyAmount.exchange &&
		currencyAmount.exchange < Settings.BuyCurrencyExchange.value
	) {
		throw new ThrowReturn(`Tỷ lệ quy đổi phải lớn hơn hoặc bằng ${Settings.BuyCurrencyExchange.value}`);
	}

	await updateDoc(
		payout,
		_.pickBy({ currencyAmount, description }, v => !_.isUndefined(v))
	);

	return _.pick(payout, _.keys(params));
}

async function deleteCurrencyExchange(user, id) {
	const payout = await models.Payout.findOne({ _id: id, payoutType: PayoutType.CURRENCY_EXCHANGE }).populate(
		'handoverId'
	);

	if (!payout) {
		throw new ThrowReturn().status(404);
	}
	if (!payout.handoverId.checkCanEnd(user)) {
		throw new ThrowReturn().status(403);
	}

	payout.state = PayoutStates.DELETED;
	payout.deletedBy = user._id;
	payout.deletedAt = new Date();
	await payout.save();

	payout.handoverId.payouts = payout.handoverId.payouts.filter(p => !p.equals(payout._id));
	await payout.handoverId.save();

	return {
		state: payout.state,
	};
}

module.exports = {
	checkForHandover,
	acceptHandover,
	requestHandover,
	getHandovers,
	getHandover,
	getCashiers,
	createCurrencyExchange,
	updateCurrencyExchange,
	deleteCurrencyExchange,
};

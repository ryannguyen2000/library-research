const moment = require('moment');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const {
	UserRoles,
	OTAs,
	PayoutType,
	PayoutStates,
	TaskTags,
	TaskStatus,
	Currency,
	PayoutSources,
	TransactionStatus,
	RolePermissons,
} = require('@utils/const');
const models = require('@models');
const apis = require('@controllers/ota_api/payments');

const { getRevenuesByQuery } = require('./utils');

const CONFIRMATION_STATE = [
	{
		roles: [UserRoles.LEADER, UserRoles.MANAGER, UserRoles.ADMIN],
		state: PayoutStates.APPROVE,
	},
	{
		roles: [UserRoles.ACCOUNTANT, UserRoles.MANAGER, UserRoles.ADMIN],
		state: PayoutStates.APPROVE,
		confirm: true,
	},
	{
		roles: [UserRoles.MANAGER, UserRoles.ADMIN],
		state: PayoutStates.APPROVE,
		confirm: true,
	},
	{
		roles: [UserRoles.ACCOUNTANT, UserRoles.MANAGER, UserRoles.ADMIN],
		state: PayoutStates.PAID,
	},
];

async function getPayoutExports(
	{ start = 0, limit = 10, from, to, payoutType = PayoutType.RESERVATION, ...query },
	user
) {
	from = from && moment(from).startOf('days').toDate();
	to = to && moment(to).endOf('days').toDate();

	return models.PayoutExport.list(
		{
			...query,
			start: parseInt(start),
			limit: parseInt(limit),
			from,
			to,
			payoutType,
		},
		user
	);
}

async function validateRevenues(payoutIds) {
	payoutIds = payoutIds.toMongoObjectIds();

	const invalidDoc = await models.Payout.findOne({
		_id: { $in: payoutIds },
		state: { $in: [PayoutStates.CONFIRMED, PayoutStates.DELETED] },
	}).select('-_id');
	if (invalidDoc) {
		throw new ThrowReturn(`Have a least one payment already 'confirmed' or 'deleted'!`);
	}
}

async function createOrUpdatePayout(data) {
	const payout = await models.Payout.findOne({
		bookingId: data.bookingId,
		description: data.description,
	});
	if (payout) {
		Object.assign(payout, data);
		await payout.save();
		return payout;
	}
	return await models.Payout.create(data);
}

function parseNumber(string) {
	string = string || '';
	return Number(string.toString().replace(/\D/, ''));
}

function generatePayoutFromGo2joyDataImport(importData, userId) {
	return importData.asyncMap(async item => {
		const otaBookingId = item['Mã đặt phòng'];
		if (!otaBookingId) return;
		const booking = await models.Booking.findOne({
			otaBookingId: otaBookingId.toString(),
			otaName: OTAs.Go2joy,
		}).select('otaName blockId');
		if (!booking) return;

		const payoutData = {
			createdBy: userId,
			collector: userId,
			otaName: booking.otaName,
			state: PayoutStates.PROCESSING,
			payoutType: PayoutType.RESERVATION,
			source: PayoutSources.BANKING,
			blockIds: [booking.blockId],
		};

		const payForHotel = parseNumber(
			_.get(item, ['Go2Joy thanh toán cho khách sạn', 'result']) || item['Go2Joy thanh toán cho khách sạn']
		);
		if (payForHotel) {
			const cA = {
				amount: payForHotel,
				currency: Currency.VND,
				exchangedAmount: payForHotel,
			};
			await createOrUpdatePayout({
				...payoutData,
				currencyAmount: cA,
				bookingId: booking._id,
				blockIds: [booking.blockId],
				description: 'Auto create. `Trả trước`',
			});
		}

		const payForGo2joy = parseNumber(item['Khách sạn thanh toán cho Go2Joy']);
		if (payForGo2joy) {
			const currencyAmount = {
				amount: -payForGo2joy,
				currency: Currency.VND,
				exchangedAmount: -payForGo2joy,
			};
			await createOrUpdatePayout({
				...payoutData,
				currencyAmount,
				description: 'Auto create. `thanh toán cho Go2Joy`',
				bookingId: booking._id,
				blockIds: [booking.blockId],
			});
		}
		return booking._id;
	});
}

async function getPayoutIdsFromDataImport(importData, otaName, userId) {
	if (!_.isArray(importData)) return [];

	let query;
	if (_.get(importData, [0, 'Booking ID'])) {
		// check import from Agoda File
		query = {
			otaBookingId: { $in: importData.map(d => d['Booking ID']) },
			otaName: OTAs.Agoda,
		};
	} else if (_.get(importData, [0, 'Reference No.'])) {
		// check import from Agoda File
		query = {
			otaBookingId: { $in: importData.map(d => d['Reference No.']) },
			otaName: OTAs.Agoda,
		};
	} else if (_.get(importData, [0, 'TransID'])) {
		// check import from Momo File
		const paymentRef = await models.PaymentRef.find({
			transactionNo: { $in: importData.filter(d => d.TransID).map(d => d.TransID.toString()) },
		}).select('otaBookingId otaName');
		query = {
			otaBookingId: { $in: paymentRef.map(p => p.otaBookingId) },
		};
	} else if (_.keys(importData[0]).some(k => k.includes('Go2Joy'))) {
		// check import from Go2Joy File
		const ids = _.compact(await generatePayoutFromGo2joyDataImport(importData, userId));
		if (ids.length)
			query = {
				_id: { $in: ids },
			};
	}

	if (!query) return [];

	const bookings = await models.Booking.find(query).select('_id').lean();

	const payoutFilter = {
		state: [PayoutStates.PROCESSING, PayoutStates.TRANSFERRED],
		payoutType: PayoutType.RESERVATION,
		inReport: false,
		bookingId: { $in: bookings.map(booking => booking._id) },
	};
	if (query.otaName === OTAs.Agoda) {
		payoutFilter.fromOTA = true;
	}

	const payoutsData = await models.Payout.find(payoutFilter).select('_id').lean();

	return payoutsData.map(payout => payout._id);
}

async function createPayoutExport({ importData, otaName, ...data }, user) {
	const IdsImport = await getPayoutIdsFromDataImport(importData, otaName, user._id);

	data.payouts = [...(data.payouts || []), ...IdsImport];

	await validateRevenues(data.payouts);
	// data.currencyAmount = amounts;
	data.createdBy = user._id;
	data.groupIds = user.groupIds;

	return await models.PayoutExport.createExport(data);
}

async function updatePayoutExport(id, { importData, otaName, ...data }, user) {
	const exportData = await models.PayoutExport.findById(id);
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	await exportData.validateUpdate(user);

	const IdsImport = await getPayoutIdsFromDataImport(importData, otaName, user._id);

	if (data.payouts || IdsImport.length) {
		data.payouts = data.payouts || [...exportData.payouts];
		if (IdsImport.length) {
			data.payouts.push(...IdsImport);
		}
		await validateRevenues(data.payouts);

		// exportData.currencyAmount = amounts;
		exportData.$locals.oldPayouts = [...exportData.payouts];
		exportData.payouts = data.payouts;
	}
	if (data.name !== undefined) {
		exportData.name = data.name;
	}
	if (data.description !== undefined) {
		exportData.description = data.description;
	}
	if (data.paidInfo !== undefined) {
		exportData.paidInfo = data.paidInfo;
	}

	await exportData.save();

	return exportData;
}

async function getPayoutExportDetail(id, user, updateCurrency = true) {
	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const exportData = await models.PayoutExport.findOne({
		_id: id,
		$or: [
			{
				createdBy: user._id,
			},
			{
				groupIds: { $in: user.groupIds },
			},
			{
				blockIds: { $in: blockIds },
			},
		],
	})
		.populate('confirmedBy createdBy approved.user', 'username name')
		.lean();
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	exportData.revenues = await getRevenuesByQuery({
		query: {
			_id: { $in: exportData.payouts },
			state: { $ne: PayoutStates.DELETED },
		},
		user,
		showSMS: true,
		type: exportData.payoutType,
	});

	if (exportData.payoutType === PayoutType.RESERVATION && exportData.revenues.revenues) {
		const bookingIds = exportData.revenues.revenues.map(r => _.get(r, ['bookingId', '_id'])).filter(bid => bid);

		const vat = await models.TaskCategory.findByTag(TaskTags.VAT);
		const tasks = await models.Task.find({
			bookingId: { $in: bookingIds },
			category: vat._id,
			status: { $ne: TaskStatus.DELETED },
		}).select('bookingId');

		exportData.revenues.revenues.forEach(r => {
			const bid = _.get(r, ['bookingId', '_id']);
			if (bid) {
				r.taskVAT = tasks.some(task => task.bookingId && task.bookingId.includesObjectId(bid));
			}
		});
	}

	// check update export currency amount
	if (updateCurrency) {
		if (
			exportData.currencyAmount.VND !== exportData.revenues.total.amounts.VND ||
			exportData.currencyAmount.USD !== exportData.revenues.total.amounts.USD
		) {
			exportData.currencyAmount = exportData.revenues.total.amounts;
			await models.PayoutExport.updateOne(
				{ _id: exportData._id },
				{ $set: { currencyAmount: exportData.currencyAmount } }
			);
		}
	}

	return exportData;
}

async function confirmPayoutExport({ user, payoutId, payoutType, undo, approveIndex }) {
	const exportData = await models.PayoutExport.findOne({
		_id: payoutId,
		payoutType,
	});
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	if (payoutType === PayoutType.PAY) {
		if (!(await user.hasPermission(RolePermissons.FINANCE_APPROVE_PAYOUT))) {
			throw new ThrowReturn().status(403);
		}

		const stateConfirm = CONFIRMATION_STATE[approveIndex];

		_.range(4).forEach(i => {
			exportData.approved[i] = exportData.approved[i] || { user: null };
		});

		exportData.state = stateConfirm.state;
		exportData.approved[approveIndex] = {
			user: user._id,
			state: stateConfirm.state,
			date: new Date(),
		};

		if (stateConfirm.confirm && !exportData.confirmedDate) {
			if (!stateConfirm.roles.includes(user.role)) {
				throw new ThrowReturn().status(403);
			}
			exportData.confirmedBy = user._id;
			exportData.confirmedDate = new Date();
		}
	} else {
		if (!(await user.hasPermission(RolePermissons.FINANCE_APPROVE_REPORT))) {
			throw new ThrowReturn().status(403);
		}

		if (undo) {
			exportData.confirmedBy = null;
			exportData.confirmedDate = null;
		} else if (!exportData.confirmedDate) {
			exportData.confirmedBy = user._id;
			exportData.confirmedDate = new Date();
		}
	}

	await exportData.save();

	if (payoutType === PayoutType.PAY && exportData.state === PayoutStates.PAID) {
		const payouts = await models.Payout.find({
			_id: exportData.payouts,
			state: { $ne: PayoutStates.DELETED },
			payStatus: { $ne: TransactionStatus.SUCCESS },
		});

		await payouts.asyncForEach(payout => {
			payout.payStatus = TransactionStatus.SUCCESS;
			payout.payConfirmedBy = user._id;
			return payout.save();
		});
	}

	return exportData;
}

async function undoExport({ user, payoutId, approveIndex }) {
	if (!(await user.hasPermission(RolePermissons.FINANCE_APPROVE_PAYOUT))) {
		throw new ThrowReturn().status(403);
	}

	const exportData = await models.PayoutExport.findById(payoutId);
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	if (exportData.approved.length) {
		approveIndex = _.isNumber(approveIndex) ? approveIndex : exportData.approved.length;

		const approvedState = exportData.approved[approveIndex];
		const confirmationState = CONFIRMATION_STATE[approveIndex];

		if (!approvedState || !approvedState.user || approvedState.user.toString() !== user._id.toString()) {
			throw new ThrowReturn().status(403);
		}

		exportData.approved[approveIndex] = { user: null };
		const dataApproved = _.filter(exportData.approved, a => a && a.user);
		exportData.state = dataApproved.length > 0 ? _.last(dataApproved).state : undefined;

		if (confirmationState.confirm) {
			const payout = await models.Payout.findOne({
				_id: exportData.payouts,
				payStatus: [TransactionStatus.PROCESSING, TransactionStatus.SUCCESS],
			}).select('_id');
			if (payout) {
				throw new ThrowReturn('Có khoản chi đang xử lí hoặc đã được chi!');
			}

			exportData.confirmedBy = undefined;
			exportData.confirmedDate = undefined;
		}

		await exportData.save();

		if (confirmationState.confirm || confirmationState.state === PayoutStates.PAID) {
			await models.Payout.updateMany(
				{ _id: exportData.payouts },
				{
					payStatus: TransactionStatus.WAITING,
				}
			);
		}
	}

	return exportData;
}

async function deletePayoutExport(id, user) {
	return await models.PayoutExport.deleteExport(id, user);
}

async function printBill(id, billNo) {
	await models.PayoutExport.printBill(id, billNo);
}

async function quickCreatePayoutExport(user, { pays, createExport, exportName = '' }) {
	const payouts = await pays.asyncMap(pay => {
		pay.payoutType = PayoutType.PAY;
		pay.collector = pay.collector || user._id;
		pay.createdBy = user._id;
		return models.Payout.createPayout(pay);
	});
	const payoutIds = payouts.map(p => p._id);

	let payoutExport;

	if (createExport) {
		payoutExport = await createPayoutExport(
			{ payoutType: PayoutType.PAY, name: exportName, payouts: payoutIds },
			user
		);
	}

	return { payouts, payoutExport };
}

async function cloneExport(user, id) {
	const group = await models.PayoutExport.findOne({
		_id: id,
		payoutType: PayoutType.PAY,
	})
		.select('-_id payoutType name description paidInfo billNo groupIds')
		.populate(
			'payouts',
			'-_id payoutType distribute distributeMonths distributes distributeType currencyAmount source description categoryId images blockIds roomIds transactionFee isInternal'
		)
		.lean();

	if (!group) throw new ThrowReturn('Form not found!');

	const clonedPayouts = await group.payouts.asyncMap(payout =>
		models.Payout.create({
			...payout,
			createdBy: user._id,
		})
	);

	const clonedGroup = await models.PayoutExport.createExport({
		...group,
		createdBy: user._id,
		payouts: _.map(clonedPayouts, '_id'),
		groupIds: user.groupIds,
	});

	return clonedGroup;
}

async function getPayoutExportCard(user, reportId) {
	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const exportData = await models.PayoutExport.findOne({ _id: reportId, blockIds: { $in: blockIds } });
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	if (!exportData.cardIds || !exportData.cardIds.length) {
		const collection = await models.PaymentCollection.findOne({
			_id: exportData.collectionIds,
		});

		if (
			collection &&
			collection.collectionIds &&
			collection.collectionIds.length &&
			apis[collection.otaName] &&
			apis[collection.otaName].getCardsInfo
		) {
			const otaConfig = await models.OTAManager.findOne({
				active: true,
				name: collection.otaName,
				account: collection.account,
			});
			const cards = await apis[collection.otaName].getCardsInfo({
				otaConfig,
				propertyId: collection.propertyId,
				ApprovalIds: collection.collectionIds,
			});
			if (cards && cards.length) {
				const cardDocs = await cards.asyncMap(card => models.PaymentCard.create(card));
				exportData.cardIds = _.compact(_.map(cardDocs, '_id'));
				await exportData.save();

				return {
					cards: cardDocs,
				};
			}
		}
	}

	const cards =
		exportData.cardIds && exportData.cardIds.length
			? await models.PaymentCard.find({ _id: exportData.cardIds })
			: [];

	return { cards };
}

module.exports = {
	getPayoutExports,
	createPayoutExport,
	getPayoutExportDetail,
	confirmPayoutExport,
	undoExport,
	updatePayoutExport,
	deletePayoutExport,
	printBill,
	quickCreatePayoutExport,
	cloneExport,
	getPayoutExportCard,
};

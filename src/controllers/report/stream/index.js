const AsyncLock = require('async-lock');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { sysEventEmitter, SYS_EVENTS, eventEmitter, EVENTS } = require('@utils/events');
const { runWorker } = require('@workers/index');
const { REPORT_CALCULATOR } = require('@workers/const');
const {
	REVENUE_STREAM_TYPES,
	REVENUE_STREAM_CALC_TYPES,
	BookingStatus,
	REPORT_STREAM_TRANSACTION_TYPES,
	REPORT_STREAM_TRANSACTION_STATUS,
	REPORT_STREAM_SOURCES,
	EXTRA_FEE,
	PayoutStates,
	PayoutType,
	RateType,
	OperationReportStatus,
} = require('@utils/const');
const { rangeDate } = require('@utils/date');
const { getArray } = require('@utils/query');
const Operator = require('@utils/operator');
const models = require('@models');

const { isReduxCommission } = require('@controllers/finance/report_host/utils');
const Revenue = require('./revenue');
const Expenses = require('./expenses');
const IncomeStatement = require('./income');
const { parseQuery, parseTime } = require('./utils');

const streamLock = new AsyncLock();

async function getRevenueStream(query, user) {
	const { blockId, excludeBlockId } = parseQuery(query);

	const { blockIds } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: getArray(blockId),
		excludeBlockId,
	});

	const ranges = parseTime(query);

	const data = await Revenue.getRevenueStream({
		...query,
		ranges,
		blockIds,
	});

	return data;
}

async function getExpensesStream(query, user) {
	const { blockId, excludeBlockId } = parseQuery(query);

	const { blockIds } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: getArray(blockId),
		excludeBlockId,
	});

	const ranges = parseTime(query);

	const data = await Expenses.getExpensesStream({
		...query,
		ranges,
		blockIds,
	});

	return data;
}

async function getIncomeStatement(query, user) {
	const { blockId, excludeBlockId } = parseQuery(query);

	const { blockIds } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: getArray(blockId),
		excludeBlockId,
	});

	const ranges = parseTime(query);

	const data = await IncomeStatement.getIncomeStatements({
		...query,
		ranges,
		blockIds,
	});

	return data;
}

function isIgnoreBooking(booking) {
	return (
		booking.status === BookingStatus.CANCELED ||
		booking.status === BookingStatus.REQUEST ||
		booking.status === BookingStatus.DECLINED ||
		booking.ignoreFinance
	);
}

function includes(arr, value) {
	return !arr || !arr.length || _.includes(arr, value);
}

async function onRevenueStreamUpdated(booking) {
	try {
		await streamLock.acquire(booking._id.toString(), async () => {
			if (isIgnoreBooking(booking)) {
				return await models.ReportStreamTransaction.deleteMany({
					bookingId: booking._id,
					status: { $ne: REPORT_STREAM_TRANSACTION_STATUS.APPROVED },
				});
			}

			const dates = rangeDate(booking.from, booking.to, false).toArray();

			const blockConfig = await models.BlockConfig.findOne({ blockId: booking.blockId }).select('revenueStreams');

			const revenueStreams = _.get(blockConfig, 'revenueStreams');
			if (!revenueStreams || !revenueStreams.length) return;

			const transactonStreams = revenueStreams.filter(r => r.type === REVENUE_STREAM_TYPES.BY_TRANSACTION);
			if (!transactonStreams.length) return;

			const block = await models.Block.findById(booking.blockId).select(
				'reportConfig manageFee startRunning wardId provinceId districtId'
			);

			const fromFormat = booking.from.toDateMysqlFormat();
			const exchange = models.Booking.exchangeCurrency(booking.currencyExchange, booking.currency);
			const reportConfig = block.getManageFee(fromFormat);
			const revenueKeys = models.Block.getRevenueKeys(reportConfig);
			const price = models.Booking.getBookingRevenue(booking, revenueKeys);
			const otaFee = exchange(booking.otaFee) || 0;
			const exRoomPrice = exchange(booking.roomPrice);
			const days = booking.from.diffDays(booking.to) || 1;
			const gmv = price / days;
			const isReduxCom = isReduxCommission(booking.otaName, booking.rateType, booking.to);
			const data = [];

			let transactionFee = 0;
			let serviceTransactionFee = 0;

			if (
				transactonStreams.some(t =>
					t.transactions.some(
						transaction => transaction.calcType === REVENUE_STREAM_CALC_TYPES.TRANSACTION_FEE
					)
				)
			) {
				let refBookings = [];
				let bookingFee = booking[EXTRA_FEE.BOOKING_FEE] || 0;
				let roomPrice = booking.roomPrice + bookingFee;
				let totalRoomPrice = roomPrice;
				let totalPrice = booking.price;

				if (booking.relativeBookings && booking.relativeBookings.length) {
					refBookings = await models.Booking.find({
						_id: booking.relativeBookings,
						status: { $in: [BookingStatus.CONFIRMED, BookingStatus.NOSHOW, BookingStatus.CHARGED] },
					})
						.select(`price roomPrice ${EXTRA_FEE.BOOKING_FEE}`)
						.lean();

					totalRoomPrice += _.sumBy(refBookings, r => r.roomPrice || 0 + r[EXTRA_FEE.BOOKING_FEE] || 0) || 0;
					totalPrice += _.sumBy(refBookings, r => r.price || 0) || 0;
				}

				const totalService = totalPrice - totalRoomPrice;
				const service = booking.price - roomPrice;

				const roomRate = totalRoomPrice ? roomPrice / totalRoomPrice : 1 / (refBookings.length + 1);
				const serviceRate = totalService ? service / totalService : 0;

				if (roomRate || serviceRate) {
					let payouts = await models.Payout.find({
						bookingId: { $in: [booking._id, ...booking.relativeBookings] },
						state: { $ne: PayoutStates.DELETED },
					})
						.select('fromOTA transactionFee currencyAmount payoutType')
						.lean();

					if (booking.rateType !== RateType.PAY_NOW) {
						payouts = payouts.filter(p => !p.fromOTA || p.currencyAmount.exchangedAmount > 0);
					}

					let totalRoomPayout = 0;
					let totalServicePayout = 0;
					let totalRoomFee = 0;
					let totalServiceFee = 0;

					payouts.forEach(p => {
						p.transactionFee = p.transactionFee || 0;

						const isRoom = p.payoutType === PayoutType.RESERVATION;
						const isRefund = p.payoutType === PayoutType.REFUND;

						if ((isRoom || isRefund) && p.currencyAmount.exchangedAmount === totalService) {
							totalServicePayout += isRefund
								? -p.currencyAmount.exchangedAmount
								: p.currencyAmount.exchangedAmount;
							totalServiceFee += p.transactionFee;
						} else if (isRoom) {
							totalRoomPayout += p.currencyAmount.exchangedAmount;
							totalRoomFee += p.transactionFee;
						} else if (isRefund) {
							totalRoomPayout += -p.currencyAmount.exchangedAmount;
							totalRoomFee += p.transactionFee;
						} else {
							totalServicePayout += p.currencyAmount.exchangedAmount;
							totalServiceFee += p.transactionFee;
						}
					});

					// console.log('totalRoomFee', totalRoomFee);
					// console.log('roomRate', roomRate);
					// console.log('totalServiceFee', totalServiceFee);
					// console.log('serviceRate', serviceRate);

					if (roomRate && totalRoomFee) {
						transactionFee = roomRate * totalRoomFee;
						if (totalRoomPayout > totalRoomPrice) {
							transactionFee *= totalRoomPrice / totalRoomPayout;
						}
					}
					if (serviceRate && totalServiceFee) {
						serviceTransactionFee = serviceRate * totalServiceFee;
						if (totalServicePayout > totalService) {
							serviceTransactionFee *= totalService / totalServicePayout;
						}
					}
				}
			}

			transactonStreams.forEach(tStream => {
				const transactionConfigs = tStream.transactions.filter(
					tTran => includes(tTran.otaName, booking.otaName) && includes(tTran.status, booking.status)
				);

				transactionConfigs.forEach(transactionConfig => {
					let revenue;

					if (transactionConfig.calcType === REVENUE_STREAM_CALC_TYPES.AFTER_COMMISSION) {
						revenue = isReduxCom ? price - otaFee : price;
					} else if (transactionConfig.calcType === REVENUE_STREAM_CALC_TYPES.BEFORE_COMMISSION) {
						revenue = exRoomPrice;
					} else if (transactionConfig.calcType === REVENUE_STREAM_CALC_TYPES.COMMISSION) {
						revenue = isReduxCom ? 0 : otaFee;
					} else if (transactionConfig.calcType === REVENUE_STREAM_CALC_TYPES.TRANSACTION_FEE) {
						revenue = transactionFee + serviceTransactionFee;
					}

					if (!revenue) return;

					const amount = (revenue * (transactionConfig.ratio / 100)) / days;
					if (!amount) return;

					dates.forEach(date => {
						if (
							(!transactionConfig.startDate || transactionConfig.startDate <= fromFormat) &&
							(!transactionConfig.endDate || transactionConfig.endDate >= fromFormat)
						) {
							data.push({
								amount,
								date: date.toDateMysqlFormat(),
								categoryId: transactionConfig.streamCategoryId,
								projectId: transactionConfig.projectId || null,
								source: tStream.source,
							});
						}
					});
				});
			});

			await models.ReportStreamTransaction.deleteMany({
				bookingId: booking._id,
				status: { $ne: REPORT_STREAM_TRANSACTION_STATUS.APPROVED },
			});

			if (data.length) {
				const approvedTransactions = await models.ReportStreamTransaction.find({
					bookingId: booking._id,
					date: { $in: _.uniq(_.map(data, 'date')) },
					status: REPORT_STREAM_TRANSACTION_STATUS.APPROVED,
				})
					.select('date')
					.lean();

				const transDate = _.keyBy(approvedTransactions, 'date');
				const filteredData = data.filter(t => !transDate[t.date]);

				if (filteredData.length) {
					await models.ReportStreamTransaction.insertMany(
						filteredData.map(item => ({
							...item,
							gmv,
							provinceId: block.provinceId,
							districtId: block.districtId,
							wardId: block.wardId,
							blockId: booking.blockId,
							serviceType: booking.serviceType,
							otaName: booking.otaName,
							bookingId: booking._id,
							type: item.projectId
								? REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_TRANSACTION
								: REPORT_STREAM_TRANSACTION_TYPES.REVENUE_TRANSACTION,
							status: REPORT_STREAM_TRANSACTION_STATUS.TEMPOLARY,
						}))
					);
				}
			}
		});
	} catch (e) {
		logger.error('onRevenueStreamUpdated', booking._id, e);
	}
}

async function onUpdateBookingPayout(payout) {
	if (!payout.transactionFee) return;

	const bookings = await models.Booking.find({
		$or: [
			{
				_id: payout.bookingId,
			},
			{
				relativeBookings: payout.bookingId,
			},
		],
	});

	await bookings.asyncMap(booking => onRevenueStreamUpdated(booking));
}

async function onExpensesStreamUpdated(payout) {
	try {
		if (payout.bookingId) {
			return await onUpdateBookingPayout(payout.bookingId);
		}

		await streamLock.acquire(payout._id.toString(), async () => {
			const transactions = [];

			if (payout.state !== PayoutStates.DELETED && payout.reportStreams && payout.reportStreams.length) {
				const periods = payout.getPeriods();

				const block = await models.Block.findById(payout.blockIds).select(
					'reportConfig manageFee provinceId districtId wardId'
				);

				periods.forEach(period => {
					const totalAmount = models.Payout.getDistributedAmount(payout, period, false);
					if (!totalAmount) return;

					const [from, to] = block.findDatesOfPeriod(period);
					const dates = rangeDate(from, to).toArray();

					payout.reportStreams
						.filter(reportStream => reportStream.ratio)
						.forEach(reportStream => {
							const amount = ((reportStream.ratio / 100) * totalAmount) / dates.length || 0;

							dates.forEach(date => {
								transactions.push({
									date: date.toDateMysqlFormat(),
									source: payout.isInternal ? REPORT_STREAM_SOURCES.CZ : REPORT_STREAM_SOURCES.OWNER,
									payoutId: payout._id,
									categoryId: reportStream.streamCategoryId,
									projectId: reportStream.streamProjectId,
									amount,
									provinceId: block.provinceId,
									districtId: block.districtId,
									wardId: block.wardId,
									blockId: block._id,
									type: REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_TRANSACTION,
									status: REPORT_STREAM_TRANSACTION_STATUS.TEMPOLARY,
								});
							});
						});
				});
			}

			await models.ReportStreamTransaction.deleteMany({
				payoutId: payout._id,
				status: { $ne: REPORT_STREAM_TRANSACTION_STATUS.APPROVED },
			});

			if (transactions.length) {
				const approvedTransactions = await models.ReportStreamTransaction.find({
					payoutId: payout._id,
					date: { $in: _.uniq(_.map(transactions, 'date')) },
					status: REPORT_STREAM_TRANSACTION_STATUS.APPROVED,
				})
					.select('date')
					.lean();
				const transDate = _.keyBy(approvedTransactions, 'date');

				const filteredTrans = transactions.filter(t => !transDate[t.date]);

				if (filteredTrans.length) {
					await models.ReportStreamTransaction.insertMany(filteredTrans);
				}
			}
		});
	} catch (e) {
		logger.error('onExpensesStreamUpdated', payout._id, e);
	}
}

async function onReportApproved(operation) {
	try {
		const { from, to, blockId } = operation;

		const data = await runWorker({
			type: REPORT_CALCULATOR,
			data: {
				blockId: blockId.toString(),
				from: from.toDateMysqlFormat(),
				to: to.toDateMysqlFormat(),
				isFull: true,
			},
		});

		const reportParams = data.params;
		const dataKeys = ['hostRevenues', 'revenues', 'fees'];

		await models.OperationReport.updateOne(
			{
				_id: operation._id,
			},
			{
				status: OperationReportStatus.COMPLETED,
				params: _.omit(reportParams, dataKeys),
				data: _.pick(reportParams, dataKeys),
			}
		);

		await models.ReportStreamTransaction.updateMany(
			{
				blockId,
				date: {
					$gte: from.toDateMysqlFormat(),
					$lte: to.toDateMysqlFormat(),
				},
				status: REPORT_STREAM_TRANSACTION_STATUS.TEMPOLARY,
				type: [
					REPORT_STREAM_TRANSACTION_TYPES.REVENUE_TRANSACTION,
					REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_TRANSACTION,
				],
			},
			{
				status: REPORT_STREAM_TRANSACTION_STATUS.APPROVED,
			}
		);

		const blockConfig = await models.BlockConfig.findOne({ blockId }).select('revenueStreams');
		if (!blockConfig || !blockConfig.revenueStreams || !blockConfig.revenueStreams.length) return;

		const coopStreams = blockConfig.revenueStreams.filter(r => r.type === REVENUE_STREAM_TYPES.BY_PROFIT);
		if (!coopStreams.length) return;

		const netRev = _.get(data.overview, 'NETRevenue.total');
		if (!netRev) return;

		const block = await models.Block.findById(blockId).select(
			'reportConfig manageFee startRunning wardId provinceId districtId'
		);

		const config = block.getManageFee(from);

		const profit =
			_.find(config.profits, c => (!c.min || c.min <= netRev) && (!c.max || c.max > netRev)) ||
			_.head(config.profits);

		const VATPercent = await models.Setting.getVATPercent();
		const vatRate = 1 + VATPercent;

		const hotelCost = (data.fee.total + _.get(profit, 'min', 0)) / vatRate;
		const hotelRevenue = data.overview.revenue.total / vatRate;
		const hotelProfit = hotelRevenue - hotelCost;
		const cozrumProfit = data.overview.profit.data.cozrum.total;
		const ownerProfit = hotelProfit - cozrumProfit;

		const bulks = [];

		const filler = {
			blockId,
			date: from.toDateMysqlFormat(),
		};
		const update = {
			provinceId: block.provinceId,
			districtId: block.districtId,
			wardId: block.wardId,
			status: REPORT_STREAM_TRANSACTION_STATUS.APPROVED,
		};
		let categoryId;

		coopStreams.forEach(revenueStream => {
			const totalAmount = revenueStream.source === REPORT_STREAM_SOURCES.CZ ? cozrumProfit : ownerProfit;

			let setted = 0;

			revenueStream.transactions.forEach(transaction => {
				let amount = 0;

				if (transaction.calcType === REVENUE_STREAM_CALC_TYPES.FIXED) {
					amount = transaction.fixedRevenue;
				} else if (transaction.calcType === REVENUE_STREAM_CALC_TYPES.IN_REPORT) {
					amount = Operator.exec(transaction.operation, data.overview);
				} else {
					if (Math.abs(setted) >= Math.abs(totalAmount)) return;

					categoryId = transaction.projectId || transaction.streamCategoryId;

					const ratio = Math.min(100, _.isNumber(transaction.ratio) ? transaction.ratio : 100);
					const rate = ratio / 100;
					amount = totalAmount * rate;
					setted += amount;
				}

				if (!amount) return;

				if (amount > 0) {
					bulks.push({
						source: revenueStream.source,
						type: REPORT_STREAM_TRANSACTION_TYPES.REVENUE_CALCULATION,
						categoryId: transaction.projectId || transaction.streamCategoryId,
						amount,
					});
				} else {
					bulks.push(
						{
							source: revenueStream.source,
							type: REPORT_STREAM_TRANSACTION_TYPES.REVENUE_CALCULATION,
							categoryId: transaction.projectId || transaction.streamCategoryId,
							amount: 0,
						},
						{
							source: revenueStream.source,
							type: REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_CALCULATION,
							categoryId: transaction.streamCategoryId,
							projectId: transaction.projectId,
							amount: Math.abs(amount),
						}
					);
				}
			});
		});

		bulks.push(
			{
				categoryId,
				type: REPORT_STREAM_TRANSACTION_TYPES.REVENUE_INFO,
				amount: hotelRevenue,
			},
			{
				categoryId,
				type: REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_INFO,
				amount: hotelCost,
			},
			{
				categoryId,
				type: REPORT_STREAM_TRANSACTION_TYPES.PROFIT_INFO,
				amount: Math.max(hotelProfit, 0),
			}
		);

		await models.ReportStreamTransaction.deleteMany({
			blockId,
			date: {
				$gte: from.toDateMysqlFormat(),
				$lte: to.toDateMysqlFormat(),
			},
			type: {
				$in: [
					REPORT_STREAM_TRANSACTION_TYPES.REVENUE_CALCULATION,
					REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_CALCULATION,
					REPORT_STREAM_TRANSACTION_TYPES.REVENUE_INFO,
					REPORT_STREAM_TRANSACTION_TYPES.EXPENSES_INFO,
					REPORT_STREAM_TRANSACTION_TYPES.PROFIT_INFO,
				],
			},
		});

		if (bulks.length) {
			await models.ReportStreamTransaction.insertMany(
				bulks.map(b => ({
					...filler,
					...update,
					...b,
				}))
			);
		}
	} catch (e) {
		logger.error('onReportApproved', operation, e);

		await models.OperationReport.updateOne(
			{
				_id: operation._id,
			},
			{
				status: OperationReportStatus.ERROR,
			}
		);
	}
}

async function onReportModified({ from, to, blockId }) {
	try {
		await models.ReportStreamTransaction.updateMany(
			{
				blockId,
				date: {
					$gte: from.toDateMysqlFormat(),
					$lte: to.toDateMysqlFormat(),
				},
				status: REPORT_STREAM_TRANSACTION_STATUS.APPROVED,
			},
			{
				status: REPORT_STREAM_TRANSACTION_STATUS.TEMPOLARY,
			}
		);
	} catch (err) {
		logger.error('onModfiedReport', blockId, from, to, err);
	}
}

sysEventEmitter.on(SYS_EVENTS.HOST_REPORT_APPROVED, onReportApproved);
sysEventEmitter.on(SYS_EVENTS.HOST_REPORT_MODIFIED, onReportModified);

sysEventEmitter.on(SYS_EVENTS.REVENUE_STREAM_UPDATE, onRevenueStreamUpdated);

eventEmitter.on(EVENTS.CREATE_PAYOUT, onExpensesStreamUpdated);
eventEmitter.on(EVENTS.UPDATE_PAYOUT, onExpensesStreamUpdated);

module.exports = {
	getRevenueStream,
	getExpensesStream,
	getIncomeStatement,
	onRevenueStreamUpdated,
	onReportApproved,
	onExpensesStreamUpdated,
};

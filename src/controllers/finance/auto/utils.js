const _ = require('lodash');

const { PayoutType, PayoutStates, TransactionStatus, TaskAutoCreateTimeType } = require('@utils/const');
const { logger } = require('@utils/logger');
const BankService = require('@services/bank');
const models = require('@models');
const { Settings } = require('@utils/setting');
const { makeNewPayRequest } = require('../pay_request/banking');

function chunkAmounts(amount) {
	const payouts = [];
	const maxAmount = Settings.MaxAmountPerPayout.value;

	while (amount > 0) {
		payouts.push(Math.min(maxAmount, amount));

		amount -= maxAmount;
	}

	return payouts;
}

async function findOrCreatePayout({
	auto,
	period,
	amount,
	vat,
	blockId,
	payAccountId,
	categoryId,
	description,
	payDebitAccountId,
	payDescription,
	source,
	hasInvoice,
	images,
	otaId,
	allowNullAmount = false,
}) {
	const filterData = {
		autoId: auto._id,
		blockIds: blockId,
		payoutType: PayoutType.PAY,
		payAccountId,
	};
	if (otaId) {
		filterData.otaId = otaId;
	} else {
		filterData.startPeriod = period;
	}

	let payouts = await models.Payout.find({
		...filterData,
		state: { $ne: PayoutStates.DELETED },
	});
	payouts = payouts.sort((a, b) => b.currencyAmount.amount - a.currencyAmount.amount);

	filterData.startPeriod = period;

	const amounts = chunkAmounts(amount);

	const newPayouts = _.compact(
		await amounts.asyncMap(async (currentAmount, index) => {
			const skipAmount = !currentAmount && !allowNullAmount;

			let payout = payouts[index];
			let chunkVAT = vat ? _.round(vat * (currentAmount / amount)) : 0;

			if (!payout) {
				if (skipAmount) return;
				payout = new models.Payout({
					...filterData,
					currencyAmount: { unitPrice: currentAmount, vat: chunkVAT },
				});
			} else if (
				payout.payStatus === TransactionStatus.SUCCESS ||
				payout.payStatus === TransactionStatus.PROCESSING ||
				payout.confirmedDate
			) {
				if (images && (!payout.images || !payout.images.length)) {
					payout.images = images;
					await payout.save();
				}
				return payout;
			}

			if (source) {
				payout.source = source;
			}
			if (currentAmount) {
				payout.currencyAmount.unitPrice = currentAmount;
			}
			if (_.isNumber(vat)) {
				payout.currencyAmount.vat = chunkVAT;
			}

			payout.categoryId = categoryId;
			payout.description = description;
			payout.payDescription = payDescription;
			payout.payDebitAccountId = payDebitAccountId;
			payout.hasInvoice = hasInvoice;
			if (images) payout.images = images;
			_.assign(payout, auto.payoutConfig);

			if (skipAmount) {
				payout.state = PayoutStates.DELETED;
			}

			await payout.save();

			return payout;
		})
	);

	if (payouts.length > newPayouts.length) {
		_.slice(payouts, newPayouts.length).asyncMap(payout => {
			payout.state = PayoutStates.DELETED;
			return payout.save();
		});
	}

	return newPayouts;
}

async function findOrCreateReport({ payouts, blockId, auto, mtime }) {
	const payoutIds = _.map(payouts, '_id');

	let report = await models.PayoutExport.findOne({
		payoutType: PayoutType.PAY,
		state: { $ne: PayoutStates.DELETED },
		payouts: { $in: payoutIds },
	});

	if (!report) {
		const blocks = await models.Block.find({ _id: blockId }).select('info.shortName info.name groupIds');
		if (!blocks.length) return;

		const des = `${auto.name}${
			blocks.length <= 1 ? ` ${_.head(blocks[0].info.shortName) || blocks[0].info.name}` : ''
		} ${mtime.format('MM.YYYY')}`;

		report = await models.PayoutExport.createExport({
			payoutType: PayoutType.PAY,
			payouts: payoutIds,
			name: des,
			currencyAmount: { VND: _.sumBy(payouts, 'currencyAmount.exchangedAmount') },
			groupIds: blocks[0].groupIds,
		});
	} else if (!report.confirmedDate) {
		report.$locals.oldPayouts = [...report.payouts];
		report.payouts = payoutIds;
		report.currencyAmount.VND = _.sumBy(payouts, 'currencyAmount.exchangedAmount');
		await report.save();
	}

	return report;
}

async function findOrCreatePayRequest({ payouts, description, debitAccounts, bankAccounts, auto }) {
	const payRequests = [];

	if (!debitAccounts) {
		debitAccounts = await models.BankAccount.find({ _id: _.compact(_.map(payouts, 'payDebitAccountId')) });
	}
	if (!bankAccounts) {
		bankAccounts = await models.BankAccount.find({ _id: _.compact(_.map(payouts, 'payAccountId')) });
	}

	await _.values(_.groupBy(payouts, p => _.toString(p.payDebitAccountId)))
		.filter(grp => grp[0].payDebitAccountId)
		.asyncForEach(async paysGroupByDbAccount => {
			const { payDebitAccountId } = paysGroupByDbAccount[0];

			const debitAccount = debitAccounts.find(a => a._id.equals(payDebitAccountId));

			const payoutsGroup = _.get(BankService[debitAccount.shortName], 'requiredSameTransTypeForBulkPayments')
				? _.values(
						_.groupBy(
							paysGroupByDbAccount,
							p =>
								_.get(
									_.find(bankAccounts, bk => bk._id.equals(p.payAccountId)),
									'shortName'
								) === debitAccount.shortName
						)
				  )
				: [paysGroupByDbAccount];

			return payoutsGroup.asyncForEach(async pays => {
				const ingoresStatus = [TransactionStatus.PROCESSING, TransactionStatus.SUCCESS];

				const payIds = _.map(
					_.filter(pays, pay => !ingoresStatus.includes(pay.payStatus)),
					'_id'
				);

				// const invalidStatus = [TransactionStatus.DELETED]

				const request = await models.PayoutRequest.findOne({
					// status: { $in: _.values(TransactionStatus).filter(s => s !== TransactionStatus.DELETED) },
					status: { $in: [TransactionStatus.WAITING, TransactionStatus.WAIT_FOR_APPROVE] },
					'payouts.payoutId': { $in: payIds },
				}).select('_id');

				const body = {
					payDebitAccountId: pays[0].payDebitAccountId,
					payoutIds: payIds,
					description,
				};
				if (!request) {
					body.status = auto.isConfirmedPayRequest
						? TransactionStatus.WAIT_FOR_APPROVE
						: TransactionStatus.WAITING;
				}

				return makeNewPayRequest(body, null, _.get(request, '_id'))
					.then(prequest => {
						payRequests.push(prequest);
					})
					.catch(e => {
						logger.error('findOrCreatePayRequest', request, e);
					});
			});
		});

	return payRequests;
}

function getTimeUnit(cond) {
	if (cond.type === TaskAutoCreateTimeType.WEEKLY) return 'week';
	if (cond.type === TaskAutoCreateTimeType.DAILY) return 'day';
	return 'month';
}

module.exports = {
	getTimeUnit,
	findOrCreatePayRequest,
	findOrCreateReport,
	findOrCreatePayout,
};

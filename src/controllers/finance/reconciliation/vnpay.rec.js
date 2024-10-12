const moment = require('moment');
const _ = require('lodash');

const { PayoutType, ThirdPartyPayment, PayoutSources, PayoutStates } = require('@utils/const');
const models = require('@models');

async function createAutoReports({ date } = {}) {
	const paymentCollector = await models.PaymentCollector.findOne({ tag: ThirdPartyPayment.VNPAY });
	const regex = new RegExp(paymentCollector.bankingSearchRegex);
	date = date || moment().subtract(1, 'day').toDate();

	const [currentTransaction, startTransaction] = await models.BankTransaction.find({
		tranTime: { $lte: moment(date).endOf('day').toDate() },
		$or: [
			{
				'data.content': regex,
			},
			{
				'data.description': regex,
			},
		],
	})
		.select('tranTime meta smsId')
		.sort({ tranTime: -1 })
		.limit(2);

	const payments = await models.Payout.find({
		source: PayoutSources.THIRD_PARTY,
		collectorCustomName: ThirdPartyPayment.VNPAY,
		paidAt: {
			$lte: moment(currentTransaction.tranTime).subtract(1, 'day').endOf('day').toDate(),
			$gte: moment(startTransaction.tranTime).startOf('day').toDate(),
		},
	})
		.select('_id inReport createdAt')
		.lean();

	if (!payments.length) return;

	const payoutIds = _.map(payments, '_id');

	const exists = await models.PayoutExport.findOne({
		payouts: { $in: payoutIds },
		state: { $ne: PayoutStates.DELETED },
		createdBy: null,
	});

	if (exists) return;

	// const feePayments = await models.Payout.find({
	// 	collectorCustomName: ThirdPartyPayment.VNPAY,
	// 	paidAt: {
	// 		$lte: moment(startTransaction.tranTime).subtract(1, 'day').endOf('day').toDate(),
	// 		$gte: moment(startTransactionCalcFee.tranTime).startOf('day').toDate(),
	// 	},
	// 	createdBy: null,
	// })
	// 	.select('_id')
	// 	.lean();

	const report = await models.PayoutExport.createExport({
		payoutType: PayoutType.RESERVATION,
		name: `${_.upperFirst(ThirdPartyPayment.VNPAY)} ngày ${moment(payments[0].createdAt).format('DD/MM/YYYY')}`,
		payouts: payoutIds,
		source: ThirdPartyPayment.VNPAY,
		// payoutFees: _.map(feePayments, '_id'),
	});

	const roundedValue = paymentCollector.roundedValue || 0;

	const realAmount = report.currencyAmount.VND - report.totalTransactionFee;
	if (
		realAmount <= currentTransaction.meta.amount + roundedValue &&
		realAmount >= currentTransaction.meta.amount - roundedValue
	) {
		await report.confirm();

		if (currentTransaction.smsId) {
			await models.SMSMessage.updateOne(
				{
					_id: currentTransaction.smsId,
				},
				{ read: true }
			);
		}
	}
}

module.exports = {
	createAutoReports,
};

const moment = require('moment');
const _ = require('lodash');

const { PayoutType, PayoutStates, ThirdPartyPayment, ThirdPartyPaymentStatus } = require('@utils/const');
const { logger } = require('@utils/logger');
const { getPayouts } = require('@services/payment/kovena');

const models = require('@models');

async function createAutoReports({ date } = {}) {
	date = date || moment().add(6, 'day').toDate();

	const source = ThirdPartyPayment.KOVENA;

	const config = await models.PaymentMethod.findOne({ name: source });

	const dateFormat = moment(date).format('YYYY-MM-DD');

	const result = await getPayouts(config, {
		query: {
			date_from: dateFormat,
			date_to: dateFormat,
		},
	});

	const reports = await result.data.asyncMap(kovenaPayout => processPayout(kovenaPayout, source));

	return _.compact(reports);
}

async function processPayout(kovenaPayout, source) {
	const details = _.filter(kovenaPayout.details, d => d.type !== 'refund');
	const refundRetails = _.filter(kovenaPayout.details, d => d.type === 'refund');

	const refundRefs = refundRetails.length
		? await models.PaymentRef.find({
				refOrderId: _.map(refundRetails, 'reference'),
				status: ThirdPartyPaymentStatus.SUCCESS,
		  })
				.select('ref refOrderId')
				.lean()
		: [];

	const norPayouts = details.length
		? await models.Payout.find({
				otaId: _.map(details, 'reference'),
				collectorCustomName: source,
		  })
		: [];

	const refundPayouts = refundRefs.length
		? await models.Payout.find({
				otaId: _.map(refundRefs, 'ref'),
				collectorCustomName: source,
		  })
		: [];

	const revObjs = _.keyBy(details, 'reference');

	await norPayouts.asyncMap(payout => {
		const rec = revObjs[payout.otaId];

		if (rec && Number(rec.total_fee) !== payout.transactionFee) {
			payout.transactionFee = Number(rec.total_fee);
			return payout.save();
		}
	});

	const refReObjs = _.keyBy(refundRefs, 'ref');
	const revReObjs = _.keyBy(refundRetails, 'reference');

	await refundPayouts.asyncMap(payout => {
		const ref = _.get(refReObjs[payout.otaId], 'refOrderId');
		const rec = revReObjs[ref];

		if (rec && Number(rec.total_fee) !== payout.transactionFee) {
			payout.transactionFee = Number(rec.total_fee);
			return payout.save();
		}
	});

	const payouts = [...norPayouts, ...refundPayouts];
	let report;

	if (payouts.some(p => p.inReport)) {
		report = await models.PayoutExport.findOne({
			payoutType: PayoutType.RESERVATION,
			payouts: { $in: _.map(payouts, '_id') },
			state: { $ne: PayoutStates.DELETED },
			source,
			createdBy: null,
		});
	}

	if (!report) {
		report = await models.PayoutExport.createExport({
			payoutType: PayoutType.RESERVATION,
			name: `${_.upperFirst(source)} ngày ${moment(kovenaPayout.payout_date * 1000).format('DD/MM/YYYY')}`,
			payouts: _.map(payouts, '_id'),
			source,
		});
	}

	return report;
}

module.exports = {
	createAutoReports,
};

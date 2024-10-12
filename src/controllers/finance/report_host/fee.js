const _ = require('lodash');
const moment = require('moment');
const path = require('path');

const { PayoutType, PayoutStates, PayoutSources, OTAs, REPORT_GROUP } = require('@utils/const');
const { isExtImage } = require('@utils/file');
const models = require('@models');
const { PAY_METHOD } = require('./const');
const textContent = require('./reportHost.json');

const OTA_HAVE_VAT = [OTAs.Luxstay];

async function getFees({ blockId, roomIds, from, config, language, feeGroupReport }) {
	const period = moment(from).format('YYYY-MM');

	const filter = {
		payoutType: PayoutType.PAY,
		state: { $ne: PayoutStates.DELETED },
		blockIds: blockId,
		startPeriod: { $lte: period },
		endPeriod: { $gte: period },
	};
	if (!config.shareExpense) filter.isInternal = { $ne: true };
	if (roomIds) filter.roomIds = { $in: roomIds };

	const payments = await models.Payout.find(filter)
		.select('-blockIds -collector -createdBy -logs')
		.populate('categoryId')
		.populate('roomIds', 'info.roomNo')
		.lean();

	// payments = payments.map(p => p.toJSON());

	const fees = [];
	const others = [];

	models.Payout.calcDistributes(payments, period);

	payments.forEach(payment => {
		const category = payment.categoryId;

		if (payment.ignoreReport) {
			others.push(payment);
		} else {
			fees.push({
				_id: payment._id,
				distribute: payment.distribute,
				category,
				description:
					payment.description ||
					_.get(textContent.FEE_REPORT_GROUP_TXT[_.get(category, 'reportGroup')], language) ||
					_.get(category, 'name'),
				vnd: payment.currencyAmount.exchangedAmount,
				date: payment.paidAt,
				payType: payment.source === PayoutSources.CASH ? PAY_METHOD.TM : PAY_METHOD.NH,
				images: payment.images,
				historyAttachments: payment.historyAttachments,
				roomIds: payment.roomIds,
				isInternal: payment.isInternal,
			});
		}
	});

	if (feeGroupReport && feeGroupReport.groups) {
		const objIndex = {};
		_.forEach(feeGroupReport.groups, (item, i) => {
			_.forEach(item.categories, c => {
				objIndex[c] = i;
			});
		});
		fees.sort((a, b) => (objIndex[_.get(a.category, '_id')] > objIndex[_.get(b.category, '_id')] ? 1 : -1));
	}

	return {
		data: fees,
		total: _.sumBy(fees, 'vnd') || 0,
		others,
	};
}

function fitlerImgs(urls) {
	return _.filter(urls, url => typeof url === 'string' && isExtImage(path.extname(url).split('?')[0]));
}

async function getOTAsAndOtherFees({ overview, revenue, fee, language, config }) {
	const taxFee = revenue.totalTax;

	const feeOTAs = [];
	_.forEach(
		_.groupBy(
			revenue.revenues.data.filter(b => b.OTAFee !== 0),
			'otaName'
		),
		(items, otaName) => {
			const payouts = _.filter(fee.others, p => p.categoryId && p.categoryId.otaName === otaName);
			feeOTAs.push({
				description: `${
					OTA_HAVE_VAT.includes(otaName)
						? textContent.UTILS.commissionWithVAT[language]
						: textContent.UTILS.commissionExVAT[language]
				} - ${_.capitalize(otaName)}`,
				vnd: _.sumBy(items, 'OTAFee'),
				images: fitlerImgs(_.flatten(_.map(payouts, 'images'))),
				historyAttachments: fitlerImgs(_.flatten(_.map(payouts, 'historyAttachments'))),
				roomIds: _.uniqBy(_.flatten(_.map(payouts, 'roomIds')), r => r._id.toString()),
			});
		}
	);

	if (config && config.hasTax) {
		const payouts = _.filter(
			fee.others,
			p => p.categoryId && p.categoryId.reportGroup === REPORT_GROUP.FINANCIAL_EXPENSES
		);
		feeOTAs.push({
			description: textContent.FEE_REPORT_GROUP_TXT.financial_expenses[language],
			vnd: taxFee,
			images: fitlerImgs(_.flatten(_.map(payouts, 'images'))),
			historyAttachments: fitlerImgs(_.flatten(_.map(payouts, 'historyAttachments'))),
			roomIds: _.uniqBy(_.flatten(_.map(payouts, 'roomIds')), r => r._id.toString()),
		});
	}

	const feePayouts = _.filter(fee.others, p => p.categoryId && p.categoryId.reportGroup === REPORT_GROUP.PAYMENT_FEE);

	const totalTransactionFee = _.sumBy(_.values(revenue), r => _.get(r, 'totalTransactionFee', 0));
	const haveTransFeeRevenues = revenue.payouts.filter(p => p.transactionFee > 0);

	const reports = await models.PayoutExport.find({
		payouts: { $in: _.map(haveTransFeeRevenues, '_id') },
		'attachments.0': { $exists: true },
	}).select('noId attachments');

	const attachments = _.compact(_.flatten(_.map(reports, 'attachments')));

	const feeData = _.compact([
		...feeOTAs,
		{
			description: textContent.FEE_REPORT_GROUP_TXT.payment_fee[language],
			vnd: totalTransactionFee,
			images: fitlerImgs([...attachments, ..._.flatten(_.map(feePayouts, 'images'))]),
			historyAttachments: fitlerImgs(_.flatten(_.map(feePayouts, 'historyAttachments'))),
			roomIds: _.uniqBy(_.flatten(_.map(feePayouts, 'roomIds')), r => r._id.toString()),
		},
		_.get(overview, 'manageFee.data.shortTerm.total') && {
			description: textContent.UTILS.shortTermFee[language],
			vnd: overview.manageFee.data.shortTerm.total,
		},
		_.get(overview, 'manageFee.data.longTerm.total') && {
			description: textContent.UTILS.longTermFee[language],
			vnd: overview.manageFee.data.longTerm.total,
		},
		...fee.data,
	]);

	return {
		data: feeData,
		total: _.sumBy(feeData, 'vnd') || 0,
		others: fee.others,
	};
}

async function getOTAsAndOtherFeesV2({ overview, revenue, fee, language, config }) {
	const fees = [];

	const otaFee = _.get(
		_.find(overview, o => o.key === 'sharedCost'),
		'data[0]'
	);
	if (otaFee) {
		const payoutOTAFees = _.filter(fee.others, p => p.categoryId && p.categoryId.otaName);
		fees.push({
			description: otaFee.name,
			vnd: otaFee.total,
			images: fitlerImgs(_.flatten(_.map(payoutOTAFees, 'images'))),
			historyAttachments: fitlerImgs(_.flatten(_.map(payoutOTAFees, 'historyAttachments'))),
			roomIds: _.uniqBy(_.flatten(_.map(payoutOTAFees, 'roomIds')), r => r._id.toString()),
		});
	}

	const manageFee = _.find(overview, o => o.key === 'czIncome');
	fees.push({
		description: textContent.UTILS.manageFee[language],
		vnd: _.get(manageFee, 'total', 0),
	});

	if (config && config.hasTax) {
		const payouts = _.filter(
			fee.others,
			p => p.categoryId && p.categoryId.reportGroup === REPORT_GROUP.FINANCIAL_EXPENSES
		);
		const taxFee = _.get(
			_.find(overview, o => o.key === 'hostFee'),
			'data[0]'
		);
		fees.push({
			description: taxFee.name,
			vnd: taxFee.total,
			images: fitlerImgs(_.flatten(_.map(payouts, 'images'))),
			historyAttachments: fitlerImgs(_.flatten(_.map(payouts, 'historyAttachments'))),
			roomIds: _.uniqBy(_.flatten(_.map(payouts, 'roomIds')), r => r._id.toString()),
		});
	}

	const feePayouts = _.filter(fee.others, p => p.categoryId && p.categoryId.reportGroup === REPORT_GROUP.PAYMENT_FEE);
	const paymentFee = _.sumBy(_.values(revenue), r => _.get(r, 'totalTransactionFee', 0));

	const haveTransFeeRevenues = revenue.payouts.filter(p => p.transactionFee > 0);

	const reports = await models.PayoutExport.find({
		payouts: { $in: _.map(haveTransFeeRevenues, '_id') },
		'attachments.0': { $exists: true },
	}).select('noId attachments');

	const attachments = _.compact(_.flatten(_.map(reports, 'attachments')));

	const feeData = _.compact([
		...fees,
		{
			description: textContent.FEE_REPORT_GROUP_TXT.payment_fee[language],
			vnd: paymentFee,
			images: fitlerImgs([...attachments, ..._.flatten(_.map(feePayouts, 'images'))]),
			historyAttachments: fitlerImgs(_.flatten(_.map(feePayouts, 'historyAttachments'))),
			roomIds: _.uniqBy(_.flatten(_.map(feePayouts, 'roomIds')), r => r._id.toString()),
		},
		...fee.data,
	]);

	return {
		data: feeData,
		total: _.sumBy(feeData, 'vnd') || 0,
		others: fee.others,
	};
}

module.exports = { getOTAsAndOtherFees, getFees, getOTAsAndOtherFeesV2 };

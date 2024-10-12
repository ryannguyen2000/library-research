/* eslint-disable no-lonely-if */
const _ = require('lodash');

const { CASH_FLOW_OBJECT } = require('@utils/const');
const models = require('@models');
const { debugRevReport } = require('@controllers/finance/reportHost');
const { parseQuery, calcRevenue } = require('./utils');

async function findRevFlows({ blockIds, period }) {
	const flows = await models.CashFlow.aggregate()
		.match({
			blockId: { $in: blockIds },
			period,
			otaBookingId: { $ne: null },
		})
		.unwind({
			path: '$flows',
			preserveNullAndEmptyArrays: true,
		})
		// .match({
		// 	'flows.destination': { $in: objectKeys },
		// 	'flows.source': { $in: [...objectKeys, null] },
		// })
		.group({
			_id: {
				otaBookingId: '$otaBookingId',
				// serviceType: '$serviceType',
				destination: '$flows.destination',
				source: '$flows.source',
				// payoutSource: '$flows.payoutSource',
			},
			total: { $sum: '$flows.total' },
			remaining: { $sum: '$flows.remaining' },
		});

	const revenues = {};
	const transFees = {};

	flows.forEach(fls => {
		const revenue = calcRevenue([fls]);
		revenues[fls._id.otaBookingId] = revenues[fls._id.otaBookingId] || 0;
		revenues[fls._id.otaBookingId] += revenue.total;

		if (
			fls._id.destination === CASH_FLOW_OBJECT.TRANSACTION_FEE &&
			fls._id.source !== CASH_FLOW_OBJECT.BACKUP_CASH_FUND
		) {
			transFees[fls._id.otaBookingId] = transFees[fls._id.otaBookingId] || 0;
			transFees[fls._id.otaBookingId] += fls.total;
		}
	});

	return {
		revenues,
		transFees,
	};
}

async function findFeeFlows({ blockIds, period }) {
	const flows = await models.CashFlow.aggregate()
		.match({
			blockId: { $in: blockIds },
			period,
			otaBookingId: { $eq: null },
			payoutId: { $ne: null },
		})
		.unwind({
			path: '$flows',
			preserveNullAndEmptyArrays: true,
		})
		// .match({
		// 	'flows.destination': { $in: objectKeys },
		// 	'flows.source': { $in: [...objectKeys, null] },
		// })
		.group({
			_id: {
				payoutId: '$payoutId',
				// serviceType: '$serviceType',
				destination: '$flows.destination',
				source: '$flows.source',
				// payoutSource: '$flows.payoutSource',
			},
			total: { $sum: '$flows.total' },
			remaining: { $sum: '$flows.remaining' },
		});

	const revs = {};

	flows.forEach(fls => {
		revs[fls._id.payoutId] = revs[fls._id.payoutId] || 0;
		revs[fls._id.payoutId] += fls.total;
	});

	return revs;
}

function compareData(o1, o2) {
	const diff = {};
	const MIXs = 3;

	_.forEach(o1, (val, key) => {
		const t = o2[key] || 0;
		if (val !== t && Math.abs(val - t) > MIXs) {
			diff[key] = {
				report: val,
				flow: o2[key],
			};
		}
	});
	_.forEach(o2, (val, key) => {
		const t = o2[key] || 0;
		if (val !== t && Math.abs(val - t) > MIXs) {
			diff[key] = {
				flow: val,
				report: o1[key],
			};
		}
	});

	return diff;
}

async function debugRevCashFlows(query, user, language) {
	const { blockIds, period, blocks } = await parseQuery(query, user);

	const revs = await findRevFlows({ blockIds, period });
	const fees = await findFeeFlows({ blockIds, period });

	const blockId = blockIds[0];

	const [from, to] = blocks[blockId].findDatesOfPeriod(period);
	const report = await debugRevReport({ blockId: blockIds[0], from, to, userId: user._id, language });

	const rs = {
		revenues: compareData(report.revenues, revs.revenues),
		fees: compareData(report.fees, fees),
		transFees: compareData(report.transactionFees, revs.transFees),
	};

	return rs;
}

module.exports = {
	debugRevCashFlows,
};

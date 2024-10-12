const _ = require('lodash');
const moment = require('moment');

const { TaskAutoCreateTimeType, PayoutAutoTypes } = require('@utils/const');
// const { logger } = require('@utils/logger');
const models = require('@models');
const operationReport = require('@controllers/report/api');

const utils = require('./utils');
const payroll = require('./payroll');
const comission = require('./comission');
const comissionExpedia = require('./comissionExpedia');
const electricFee = require('./electricFee');
const waterFee = require('./waterFee');

async function getAutos(query, user) {
	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: query.blockId });

	const filter = {
		deleted: false,
		system: false,
		$or: [
			{
				groupIds: { $in: user.groupIds },
			},
			{
				blockIds: { $in: blockIds },
			},
		],
	};
	if (query.blockId) {
		filter.blockIds = { $in: blockIds };
	}
	if (query.categoryId) {
		filter['payouts.categoryId'] = query.categoryId;
	}
	if (query.keyword) {
		const searchRegex = new RegExp(_.escapeRegExp(_.trim(query.keyword)), 'i');
		filter.$or = [
			{
				name: searchRegex,
			},
			{
				description: searchRegex,
			},
		];
	}

	const data = await models.PayoutAuto.find(filter)
		.sort({ createdAt: -1 })
		.skip(query.start)
		.limit(query.limit)
		.populate('blockIds', 'info.name info.shortName')
		.populate('createdBy', 'username name')
		.populate('payouts.categoryId')
		.populate({
			path: 'payouts.payAccountId payouts.payDebitAccountId',
			select: 'no sourceType accountName name shortName accountNos bankId',
			populate: {
				path: 'bankId',
			},
		});
	const total = await models.PayoutAuto.countDocuments(filter);

	return {
		data,
		total,
	};
}

async function createAuto(body, user) {
	const auto = await models.PayoutAuto.create({
		...body,
		createdBy: user._id,
		groupIds: user.groupIds,
	});

	return auto;
}

async function updateAuto(autoId, body) {
	const auto = await models.PayoutAuto.findById(autoId);

	_.assign(auto, body);
	await auto.save();

	return auto;
}

async function deleteAuto(autoId, user) {
	const auto = await models.PayoutAuto.findById(autoId);

	auto.deletedBy = user._id;
	auto.deletedAt = new Date();
	auto.deleted = true;
	await auto.save();

	return {
		deleted: auto.deleted,
		deletedBy: auto.deletedBy,
		deletedAt: auto.deletedAt,
	};
}

async function runCustomAuto(auto, mtime, period) {
	const payoutResults = await auto.blockIds.asyncMap(async blockId => {
		const blockPayouts = auto.payouts.filter(p => !p.blockId || p.blockId.equals(blockId));

		const payouts = _.compact(
			_.flatten(
				await blockPayouts.asyncMap(payoutData => {
					return utils.findOrCreatePayout({
						...payoutData.toJSON(),
						description: `${payoutData.description || auto.name} ${mtime.format('MM.YYYY')}`,
						payDescription: `${payoutData.payDescription || auto.name} ${mtime.format('MM YYYY')}`,
						auto,
						period,
						blockId,
						allowNullAmount: true,
					});
				})
			)
		);

		return {
			blockId,
			payouts,
		};
	});

	const payouts = _.flatten(payoutResults.map(p => p.payouts));

	let reports;

	if (auto.isCreateReport && payoutResults.some(p => p.payouts.length)) {
		if (auto.isGroupReport) {
			const report = await utils.findOrCreateReport({
				payouts,
				blockId: payoutResults.map(p => p.blockId),
				auto,
				mtime,
			});
			if (report) {
				reports = [report];
			}
		} else {
			reports = await payoutResults.asyncMap(pr =>
				utils.findOrCreateReport({
					payouts: pr.payouts,
					blockId: pr.blockId,
					auto,
					mtime,
				})
			);
		}
	}

	let payRequests;

	if (reports && auto.isCreatePayRequest) {
		payRequests = await utils.findOrCreatePayRequest({
			payouts: _.flatten(payoutResults.map(p => p.payouts)),
			description: reports[0].name,
			auto,
		});
	}

	return {
		payouts,
		reports,
		payRequests,
	};
}

async function runShareRevenue(auto, mtime) {
	await auto.blockIds.asyncMap(async blockId => {
		await operationReport.exportOperationReport({
			blockId,
			period: mtime.format('MM-Y'),
		});
	});
}

async function getAccountConfigs(user, query) {
	const filter = {
		active: true,
		groupIds: { $in: user.groupIds },
	};
	if (query.accountType) {
		filter.accountType = query.accountType;
	}

	const accounts = await models.AccountConfig.find(filter).select('name accountType');

	return {
		accounts,
	};
}

async function runAutos({ time, autoId } = {}) {
	const filter = { deleted: false };
	time = time || new Date();

	if (autoId) {
		filter._id = autoId;
	} else {
		const mtime = moment(time);
		const $or = [
			{
				type: TaskAutoCreateTimeType.WEEKLY,
				timeValue: mtime.format('d-HH:mm'),
			},
			{
				type: TaskAutoCreateTimeType.MONTHLY,
				timeValue: mtime.format('D-HH:mm'),
			},
		];

		const maxDoM = 31;
		const currentDay = time.getDate();

		if (currentDay < maxDoM && currentDay === moment(time).endOf('month').date()) {
			_.range(maxDoM - currentDay).forEach(i => {
				$or.push({
					type: TaskAutoCreateTimeType.MONTHLY,
					timeValue: `${i + 1 + currentDay}-${mtime.format('HH:mm')}`,
				});
			});
		}

		filter.autos = {
			$elemMatch: {
				$or,
			},
		};
	}

	const autos = await models.PayoutAuto.find(filter);

	const bulks = await autos.asyncMap(auto => {
		const cond = auto.findCond(time) || auto.autos[0];
		const timeUnit = utils.getTimeUnit(cond.type);

		const mtime = cond.addTimeForPeriod ? moment(time).add(cond.addTimeForPeriod, timeUnit) : moment(time);
		const period = (
			_.isNumber(cond.addTimeForPeriodReport) ? moment(time).add(cond.addTimeForPeriodReport, timeUnit) : mtime
		).format('YYYY-MM');

		if (auto.type === PayoutAutoTypes.PAYROLL) {
			return payroll.runAuto(auto, mtime, period);
		}
		if (auto.type === PayoutAutoTypes.BOOKING_COMMISSION) {
			return comission.runAuto(auto, mtime, period);
		}
		if (auto.type === PayoutAutoTypes.ELECTRIC) {
			return electricFee.runAuto(auto, mtime, period);
		}
		if (auto.type === PayoutAutoTypes.WATER) {
			return waterFee.runAuto(auto, mtime, period);
		}
		if (auto.type === PayoutAutoTypes.EXPEDIA_COMMISSION) {
			return comissionExpedia.runAuto(auto, mtime, period);
		}
		if (auto.type === PayoutAutoTypes.REVENUE_SHARE) {
			return runShareRevenue(auto, mtime, period);
		}
		return runCustomAuto(auto, mtime, period);
	});

	return bulks;
}

module.exports = {
	getAutos,
	createAuto,
	updateAuto,
	deleteAuto,
	runAutos,
	getAccountConfigs,
};

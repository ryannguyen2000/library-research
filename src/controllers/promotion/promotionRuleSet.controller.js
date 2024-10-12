// const mongoose = require('mongoose');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const models = require('@models');
const algorithms = require('./algorithms');
const promotionRuleSetBlock = require('./promotionRuleSetBlock.controller');
const promotionController = require('./promotion.controller');
// const promotionBlock = require('./promotionBlock.controller');
const { genPromotionsDataFromRuleSet } = require('./promotionCalc');

async function getPromotionRuleSets(req, res) {
	const { user } = req.decoded;
	const { blockIds } = await models.Host.getBlocksOfUser({ user });

	const rulesets = await models.PromotionRuleSet.find({
		$or: [
			{
				groupIds: { $in: user.groupIds },
			},
			{
				'promotions.blockId': { $in: blockIds },
			},
		],
	}).select('-promotions');

	res.sendData(rulesets);
}

async function createPromotionRuleSet(req, res) {
	const {
		airbnb,
		activeOTAs,
		startDate,
		endDate,
		name,
		tags,
		ratio,
		dayOfWeeks,
		bookStartDate,
		bookEndDate,
		bookDayOfWeeks,
	} = req.body;

	const ruleset = await models.PromotionRuleSet.create({
		airbnb,
		activeOTAs,
		startDate,
		endDate,
		name,
		tags,
		ratio,
		dayOfWeeks,
		bookStartDate,
		bookEndDate,
		bookDayOfWeeks,
		groupIds: req.decoded.user.groupIds,
	});

	res.sendData(ruleset);
}

async function getPromotionRuleSet(req, res) {
	const ruleset = await models.PromotionRuleSet.findOne({
		_id: req.params.rulesetId,
		groupIds: { $in: req.decoded.user.groupIds },
	});
	if (ruleset) {
		ruleset.blocks = await models.PromotionRuleSetBlocks.findByRuleSetId(ruleset._id);
	}

	res.sendData(ruleset);
}

const sizeof = a => (a && a.length) || 0;

async function updatePromotions(old, promotionsData) {
	const sizeOld = sizeof(old);
	const sizeNew = sizeof(promotionsData);

	if (sizeOld > sizeNew) {
		await old
			.slice(0, sizeNew)
			.asyncForEach((id, idx) => promotionController.findAndUpdatePromotion(id, promotionsData[idx], false));

		await old.slice(sizeNew).asyncForEach(id => promotionController.updatePromotionActive(id, false));

		return old;
	}

	if (sizeOld < sizeNew) {
		await old.asyncForEach((id, idx) => promotionController.findAndUpdatePromotion(id, promotionsData[idx], false));

		const newPromos = await promotionsData.slice(sizeOld).asyncMap(data => models.Promotion.create(data));

		return old.concat(newPromos.map(p => p._id));
	}

	await old.asyncForEach(async (id, idx) => {
		const promo = await promotionController.findAndUpdatePromotion(id, promotionsData[idx], false);

		if (!promo.active) {
			await promotionController.updatePromotionActive(id, true);
		}
	});

	return old;
}

async function generateRulesetPromotions(ruleset) {
	const promotionsData = await genPromotionsDataFromRuleSet(ruleset);

	const oldPromotions = await models.Promotion.find({
		_id: { $in: _.map(ruleset.promotions, 'promotionId') },
	}).select('_id');
	const oldPromotionIds = oldPromotions.map(p => p._id.toString());

	const groupFunc = a =>
		`${a.type}|${a.smart || false}|${a.otaName}|${a.blockId}|${a.propertyId || ''}|${a.rulesetBlockId}`;

	const oldGroupPromo = _.chain(ruleset.promotions)
		.filter(p => oldPromotionIds.includes(p.promotionId.toString()))
		.uniqBy(p => _.toString(p.promotionId))
		.sortBy(['type', 'smart'])
		.groupBy(groupFunc)
		.value();
	const newGroupPromo = _.chain(promotionsData).sortBy(['type', 'smart']).groupBy(groupFunc).value();

	const keys = _.uniq([...Object.keys(oldGroupPromo), ...Object.keys(newGroupPromo)]);

	const promotions = await keys.syncMap(async key => {
		if (!newGroupPromo[key] && !oldGroupPromo[key]) {
			return [];
		}

		oldGroupPromo[key] = oldGroupPromo[key] || [];
		newGroupPromo[key] = newGroupPromo[key] || [];

		const oldPromoData = oldGroupPromo[key].sort((a, b) => b.promotionId.active - a.promotionId.active);
		const newPromoData = newGroupPromo[key].sort((a, b) => b.promotion.active - a.promotion.active);
		const oldPromoIds = oldPromoData.map(p => p.promotionId);
		const newPromos = newPromoData.map(p => p.promotion);

		const promotionIds = await updatePromotions(oldPromoIds, newPromos);

		newPromoData.forEach((promo, idx) => {
			promo.promotionId = promotionIds[idx];
			promo.active = true;
			delete promo.promotion;
		});

		return newPromoData;
	});

	return _.flatten(promotions);
}

async function updatePromotionRuleSet(req, res) {
	const { rulesetId } = req.params;
	const keys = [
		'airbnb',
		'activeOTAs',
		'startDate',
		'endDate',
		'name',
		'tags',
		'ratio',
		'dayOfWeeks',
		'bookStartDate',
		'bookEndDate',
		'bookDayOfWeeks',
	];

	let ruleset = await models.PromotionRuleSet.findOne({
		_id: rulesetId,
		groupIds: { $in: req.decoded.user.groupIds },
	}).select(keys.join(' '));

	if (!ruleset) {
		throw new ThrowReturn('Promotion not found!');
	}

	const oldData = ruleset.toJSON();
	const data = _.pick(req.body, keys);

	_.assign(ruleset, data);
	await ruleset.save();

	const rulesetBlocks = await models.PromotionRuleSetBlocks.find({ rulesetId });

	try {
		await rulesetBlocks.asyncForEach(async rulesetBlock => {
			rulesetBlock.activeRules = rulesetBlock.activeRules.filter(r =>
				ruleset.airbnb.pricing_rules.some(rule => rule.rule_type === r.ruleType)
			);
			await rulesetBlock.save();

			return promotionRuleSetBlock.syncPromotionRuleSetBlock(rulesetBlock);
		});
	} catch (error) {
		logger.error('updatePromotionRuleSet error', error);
		await models.PromotionRuleSet.findByIdAndUpdate(rulesetId, { $set: oldData });
		throw new ThrowReturn('Có lỗi xảy ra vui lòng thử lại sau!');
	}

	res.sendData(ruleset);
}

async function updatePromotionRuleSetActive(req, res) {
	const { rulesetId } = req.params;
	const { active } = req.body;

	const ruleset = await models.PromotionRuleSet.findOne({
		_id: rulesetId,
		groupIds: { $in: req.decoded.user.groupIds },
	});
	if (!ruleset) {
		throw new ThrowReturn().status(404);
	}

	if (ruleset.promotions) {
		await ruleset.promotions
			.filter(p => p.active)
			.asyncMap(p => promotionController.updatePromotionActive(p.promotionId, active));
	}

	const data = {
		active: !!active,
	};

	const promotionRuleSet = await models.PromotionRuleSet.findByIdAndUpdate(
		ruleset._id,
		{ $set: data },
		{ new: true }
	);

	if (active) {
		promotionRuleSet.promotions = await generateRulesetPromotions(promotionRuleSet);
		await promotionRuleSet.save();
	}

	res.sendData(_.pick(promotionRuleSet, _.keys(req.body)));
}

async function deletePromotionRuleSet(req, res) {
	const { rulesetId } = req.params;

	const ruleset = await models.PromotionRuleSet.findOne({
		_id: rulesetId,
		groupIds: { $in: req.decoded.user.groupIds },
	});
	if (!ruleset) {
		throw new ThrowReturn().status(404);
	}

	const rulesetBlocks = await models.PromotionRuleSetBlocks.findByRuleSetId(rulesetId);
	await rulesetBlocks.asyncMap(p => promotionRuleSetBlock._deletePromotionRuleSetBlock(p));

	if (ruleset.promotions) {
		await ruleset.promotions
			.filter(p => p.active)
			.map(p => p.promotionId)
			.asyncMap(id => promotionController._deletePromotion(id));
	}

	await models.PromotionRuleSet.deleteOne({ _id: ruleset._id });

	res.sendData();
}

async function getAlgorithms(req, res) {
	algorithms.Algorithms = algorithms.loadAlgorithms();

	const algs = Object.keys(algorithms.Algorithms).map(value => ({
		name: algorithms.Algorithms[value].name,
		value,
	}));

	res.sendData({ algorithms: algs });
}

async function getHistories(req, res) {
	let { start, limit, rulesetId } = req.query;
	let { user } = req.decoded;

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;

	const query = { type: 'PROMOTION_RULE_UPDATE' };

	const users = await models.User.find({
		groupIds: { $in: user.groupIds },
	}).select('username');
	query.username = _.map(users, 'username');

	if (rulesetId) {
		query.action = `/api/v1/promotion/ruleset/${rulesetId}`;
	}

	const [histories, total] = await Promise.all([
		models.UserLog.find(query)
			.select('-response')
			.sort({ createdAt: -1 })
			.skip(start)
			.limit(limit)
			.populate('user', 'name username')
			.lean(),
		models.UserLog.countDocuments(query),
	]);

	const data = histories.map(history => ({
		...history,
		data: JSON.parse(history.data),
	}));

	res.sendData({
		data,
		total,
	});
}

module.exports = {
	getPromotionRuleSets,
	createPromotionRuleSet,
	getPromotionRuleSet,
	updatePromotionRuleSet,
	updatePromotionRuleSetActive,
	deletePromotionRuleSet,
	getAlgorithms,
	generateRulesetPromotions,
	getHistories,
};

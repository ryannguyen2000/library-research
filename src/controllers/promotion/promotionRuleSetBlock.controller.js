// const mongoose = require('mongoose');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { SYS_EVENTS, sysEventEmitter } = require('@utils/events');
const { PromotionRuleSetBlockType } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const promotionBlock = require('./promotionBlock.controller');
// const promotionController = require('./promotion.controller');
const job = require('./promotion.job');

async function getPromotionRuleSetBlocks(req, res) {
	const { blockId } = req.query;

	const rulesets = await models.PromotionRuleSetBlocks.find({ blockId })
		.select('-promotionIds -currentRules')
		.populate('rulesetId', '-promotions ')
		.lean();

	res.sendData(rulesets);
}

async function syncPromotionRuleSetBlock(rulesetBlock) {
	const ruleset = await models.PromotionRuleSet.findById(rulesetBlock.rulesetId);
	if (!ruleset) {
		throw new ThrowReturn('Rule not exists');
	}

	if (!ruleset.active) {
		return;
	}

	ruleset.promotions = await require('./promotionRuleSet.controller').generateRulesetPromotions(ruleset);
	await ruleset.save();

	const activedPromotions = _.filter(ruleset.promotions, p => p.active && rulesetBlock._id.equals(p.rulesetBlockId));

	const blockPromotions = await activedPromotions.syncMap(pData => {
		return promotionBlock._createPromotionBlocks({
			blockId: rulesetBlock.blockId,
			promotionId: pData.promotionId,
			promotionRulesetBlockId: rulesetBlock._id,
			genius: pData.genius,
			ratePlanIds: pData.ratePlanIds,
			otaName: pData.otaName,
			manual: false,
		});
	});

	let promotionIds = _.flattenDeep(blockPromotions)
		.filter(p => p && p.promotionId)
		.map(p => p.promotionId)
		.toMongoObjectIds();

	const promotions = await models.Promotion.find({ _id: promotionIds }).select('_id activeOTAs');
	if (promotionIds.length !== promotions.length) {
		promotionIds = promotions.map(p => p._id);
	}

	await models.PromotionRuleSetBlocks.updateOne(
		{
			_id: rulesetBlock._id,
		},
		{ $set: { promotionIds } }
	);

	await models.PromotionBlocks.deleteMany({
		blockId: rulesetBlock.blockId,
		promotionRulesetBlockId: rulesetBlock._id,
		promotionId: { $nin: promotionIds },
	});

	rulesetBlock.promotionIds = promotionIds;

	return {
		promotions,
	};
}

async function updatePromotionRuleSetBlock(req, res) {
	const rulesetBlock = await models.PromotionRuleSetBlocks.findById(req.params.rulesetBlockId);

	if (!rulesetBlock) {
		throw new ThrowReturn().status(404);
	}

	const { ratePlanIds, activeRules, roomTypeIds } = req.body;

	if (ratePlanIds) {
		rulesetBlock.ratePlanIds = ratePlanIds;
	}
	if (activeRules) {
		rulesetBlock.activeRules = activeRules;
	}
	if (roomTypeIds) {
		rulesetBlock.roomTypeIds = roomTypeIds;
	}

	const isModifiedRoomTypeIds = rulesetBlock.isModified('roomTypeIds');

	await rulesetBlock.save();

	const rs = await syncPromotionRuleSetBlock(rulesetBlock);

	if (rs && isModifiedRoomTypeIds) {
		await rs.promotions.asyncMap(promotion => {
			return models.JobPromotion.updateOne(
				{
					promotionId: promotion._id,
					operrator: 'update',
				},
				{
					numRun: 0,
					otas: [
						{
							otaName: promotion.activeOTAs[0],
						},
					],
					blockId: rulesetBlock.blockId,
					done: false,
				},
				{
					upsert: true,
				}
			);
		});
	}

	res.sendData(rulesetBlock);
}

async function updatePromotionRuleSetBlockActive(req, res) {
	const rulesetBlock = await models.PromotionRuleSetBlocks.findById(req.params.rulesetBlockId);

	if (!rulesetBlock) {
		throw new ThrowReturn().status(404);
	}

	rulesetBlock.active = !!req.body.active;
	await rulesetBlock.save();

	// await rulesetBlock.promotionIds.asyncMap(pId => promotionController.updatePromotionActive(pId, active));

	await syncPromotionRuleSetBlock(rulesetBlock);

	res.sendData();
}

async function createPromotionRuleSetBlock(req, res) {
	const { body } = req;
	const { user } = req.decoded;

	const rulesetBlock = await models.PromotionRuleSetBlocks.create({ ...body, createdBy: user._id });

	if (rulesetBlock.ruleBlockType !== PromotionRuleSetBlockType.Default) {
		if (body.autos && body.autos.length) {
			await body.autos.asyncMap(auto =>
				models.PromotionAuto.create({
					...auto,
					promotionRulesetBlockId: rulesetBlock._id,
					createdBy: user._id,
				})
			);
		}
	} else {
		await syncPromotionRuleSetBlock(rulesetBlock);
	}

	res.sendData(rulesetBlock);
}

async function _deletePromotionRuleSetBlock(rulesetBlock) {
	await rulesetBlock.promotionIds.asyncMap(pId => promotionBlock._deletePromotionBlock(pId, rulesetBlock.blockId));
	await models.PromotionRuleSetBlocks.deleteOne({ _id: rulesetBlock._id });
	await models.PromotionAuto.deleteMany({ promotionRulesetBlockId: rulesetBlock._id });
}

async function deletePromotionRuleSetBlock(req, res) {
	const { rulesetBlockId } = req.params;

	const rulesetBlock = await models.PromotionRuleSetBlocks.findById(rulesetBlockId);
	if (!rulesetBlock) {
		throw new ThrowReturn().status(404);
	}

	await _deletePromotionRuleSetBlock(rulesetBlock);

	res.sendData();
}

// async function updateBlockSmartPromotions(blockId, from, to) {
// 	try {
// 		const smartRules = await models.PromotionRuleSet.find({
// 			startDate: { $lte: to },
// 			endDate: { $gte: from },
// 			'airbnb.pricing_rules.smart': true,
// 		}).select('_id');

// 		if (!smartRules.length) return;

// 		const rulesetBlocks = await models.PromotionRuleSetBlocks.find({
// 			blockId,
// 			rulesetId: { $in: _.map(smartRules, '_id') },
// 		});

// 		await rulesetBlocks.asyncForEach(info => updatePromotionRuleSetBlock(info));
// 	} catch (error) {
// 		logger.error('updateBlockSmartPromotions error', error);
// 	}
// }

// function onUpdateReservation(booking) {
// 	updateBlockSmartPromotions(booking.blockId, booking.from, booking.to);
// }

// eventEmitter.on(EVENTS.RESERVATION, onUpdateReservation);
// eventEmitter.on(EVENTS.RESERVATION_UPDATE, onUpdateReservation);
// eventEmitter.on(EVENTS.RESERVATION_CANCEL, onUpdateReservation);

async function syncPromotionBlocks(filter, page = 1) {
	const [rulesetBlock] = await models.PromotionRuleSetBlocks.find(filter)
		.skip((page - 1) * 1)
		.limit(1);

	if (!rulesetBlock) return;

	await syncPromotionRuleSetBlock(rulesetBlock);

	await syncPromotionBlocks(filter, page + 1);
}

async function onListingUpdated({ oldData, currentData, blockId }, listing) {
	try {
		const ratePlanIds = _.uniq(
			_.compact([..._.map(currentData.rates, 'ratePlanId'), ..._.map(oldData.rates, 'ratePlanId')])
		);

		if (!ratePlanIds.length) return;

		await syncPromotionBlocks({
			active: true,
			blockId,
			roomTypeIds: listing.roomTypeId,
			otas: currentData.otaName,
			ratePlanIds: { $in: ratePlanIds },
		});
	} catch (e) {
		logger.error('onListingUpdated', blockId, currentData, e);
	}
}

sysEventEmitter.on(SYS_EVENTS.LISTING_UPDATE, onListingUpdated);

module.exports = {
	getPromotionRuleSetBlocks,
	createPromotionRuleSetBlock,
	updatePromotionRuleSetBlockActive,
	// getPromotionRuleSetBlock,

	deletePromotionRuleSetBlock,

	updatePromotionRuleSetBlock,
	_deletePromotionRuleSetBlock,
	syncPromotionRuleSetBlock,
	// _updatePromotionRuleSetBlockActive,
};

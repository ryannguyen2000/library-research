const _ = require('lodash');

const models = require('@models');
const job = require('./promotion.job');

async function _createPromotionBlocks(data) {
	const { blockId, promotionId, ratePlanIds } = data;

	const old = await models.PromotionBlocks.findOne({ promotionId, blockId });

	if (old) {
		const promotion = await models.Promotion.findById(promotionId);
		const promoBlock = await models.PromotionBlocks.findByIdAndUpdate(old._id, { $set: data }, { new: true });

		if (promotion && promotion.active) {
			if (!_.isEqual(ratePlanIds.sort(), old.ratePlanIds.sort())) {
				if (ratePlanIds.length === 0) {
					await job.addTask({
						promotionId,
						operator: 'clear',
						otas: promotion.activeOTAs,
						blockId,
						ratePlanIds,
					});
				} else {
					await job.addTask({
						promotionId,
						operator: 'set',
						otas: promotion.activeOTAs,
						blockId,
						ratePlanIds,
					});
				}
			}
		}

		return promoBlock;
	}

	if (ratePlanIds.length === 0) {
		return null;
	}

	const promoBlock = await models.PromotionBlocks.create(data);
	const promotion = await models.Promotion.findById(promotionId);

	if (promotion && promotion.active) {
		await job.addTask({ promotionId, operator: 'set', otas: promotion.activeOTAs, blockId });
	}

	return promoBlock;
}

async function _deletePromotionBlock(promotionId, blockId) {
	const pb = await models.PromotionBlocks.find({ promotionId, blockId });

	await job.addTask({ promotionId, operator: 'clear', blockId, ratePlanIds: pb.ratePlanIds });
}

module.exports = {
	_createPromotionBlocks,
	_deletePromotionBlock,
};

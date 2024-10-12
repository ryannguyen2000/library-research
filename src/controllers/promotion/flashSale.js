// const mongoose = require('mongoose');
// const moment = require('moment');
const _ = require('lodash');

const { PromotionType } = require('@utils/const');
const models = require('@models');
const job = require('./promotion.job');

async function findPromotionsByBlock(blockId) {
	const promotionBlocks = await models.PromotionRuleSetBlocks.find({ blockId, active: true });
	const promotionIds = _.flatten(_.map(promotionBlocks, 'promotionIds'));

	return promotionIds;
}

async function getBlockFlashSale(req, res) {
	const promotionIds = await findPromotionsByBlock(req.params.blockId);

	const count = await models.Promotion.countDocuments({ _id: promotionIds, promoType: PromotionType.NightFlashSale });

	res.sendData({
		active: !!count,
		count,
	});
}

async function updateBlockFlashSaleActive(req, res) {
	const { blockId } = req.params;
	const { active } = req.body;

	const promotionIds = await findPromotionsByBlock(blockId);

	const promotions = await models.Promotion.find({
		_id: promotionIds,
		promoType: PromotionType.NightFlashSale,
		active: !active,
	});

	await promotions.asyncMap(async promotion => {
		promotion.active = active;
		await promotion.save();

		return job.addTask({
			promotionId: promotion._id,
			otas: promotion.activeOTAs,
			operator: active ? 'update' : 'clear',
		});
	});

	res.sendData({ modified: promotions.length });
}

module.exports = {
	getBlockFlashSale,
	updateBlockFlashSaleActive,
};

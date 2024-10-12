// const mongoose = require('mongoose');
// const moment = require('moment');
// const _ = require('lodash');
const { logger } = require('@utils/logger');
const models = require('@models');
const { syncPromotionRuleSetBlock } = require('./promotionRuleSetBlock.controller');

async function updatePromotions(blockId) {
	try {
		const rulesetBlocks = await models.PromotionRuleSetBlocks.find({
			blockId,
		});

		await rulesetBlocks.asyncForEach(info => syncPromotionRuleSetBlock(info));
	} catch (e) {
		logger.error(e);
	}
}

async function getChannels(req, res) {
	const { blockId } = req.params;

	const channels = await models.PromotionRateChannel.find({
		blockId,
	});

	res.sendData({ channels });
}

async function updateChannels(req, res) {
	const { blockId } = req.params;
	const data = req.body || [];

	const channels = await data.asyncMap(item => {
		return models.PromotionRateChannel.findOneAndUpdate({ blockId, otaName: item.otaName }, item, {
			upsert: true,
			new: true,
		});
	});

	await updatePromotions(blockId);

	res.sendData({ channels });
}

module.exports = {
	getChannels,
	updateChannels,
};

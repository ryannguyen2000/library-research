const router = require('@core/router').Router();
const PromotionRuleSet = require('@controllers/promotion/promotionRuleSet.controller');
const PromotionRuleSetBlock = require('@controllers/promotion/promotionRuleSetBlock.controller');
const RateChannel = require('@controllers/promotion/rateChannel');
// const FlashSale = require('@controllers/promotion/flashSale');
const PromotionAuto = require('@controllers/promotion/promotionAuto');

async function getPromotionAutos(req, res) {
	const data = await PromotionAuto.getAutos(req.query, req.decoded.user);
	res.sendData(data);
}

async function createPromotionAuto(req, res) {
	const data = await PromotionAuto.createAuto(req.body, req.decoded.user);
	res.sendData(data);
}

async function updatePromotionAuto(req, res) {
	const data = await PromotionAuto.updateAuto(req.params.autoId, req.body);
	res.sendData(data);
}

async function deletePromotionAuto(req, res) {
	const data = await PromotionAuto.deleteAuto(req.params.autoId);
	res.sendData(data);
}

router.getS('/ruleset', PromotionRuleSet.getPromotionRuleSets, true);
router.postS('/ruleset', PromotionRuleSet.createPromotionRuleSet, true);
router.getS('/ruleset/history', PromotionRuleSet.getHistories, true);

router.getS('/ruleset/:rulesetId', PromotionRuleSet.getPromotionRuleSet, true);
router.putS('/ruleset/:rulesetId', PromotionRuleSet.updatePromotionRuleSet, true);
router.putS('/ruleset/:rulesetId/active', PromotionRuleSet.updatePromotionRuleSetActive, true);
router.deleteS('/ruleset/:rulesetId', PromotionRuleSet.deletePromotionRuleSet, true);

router.postS('/ruleset_block', PromotionRuleSetBlock.createPromotionRuleSetBlock, true);
router.getS('/ruleset_block', PromotionRuleSetBlock.getPromotionRuleSetBlocks, true);
router.putS('/ruleset_block/:rulesetBlockId', PromotionRuleSetBlock.updatePromotionRuleSetBlock, true);
router.deleteS('/ruleset_block/:rulesetBlockId', PromotionRuleSetBlock.deletePromotionRuleSetBlock, true);
router.putS('/ruleset_block/:rulesetBlockId/active', PromotionRuleSetBlock.updatePromotionRuleSetBlockActive);
// router.getS('/ruleset_block/:planBlockId', PromotionRuleSetBlock.getPromotionRuleSetBlock, true);

router.getS('/ruleset_auto', getPromotionAutos);
router.postS('/ruleset_auto', createPromotionAuto);
router.putS('/ruleset_auto/:autoId', updatePromotionAuto);
router.deleteS('/ruleset_auto/:autoId', deletePromotionAuto);

router.getS('/rateChannel/:blockId', RateChannel.getChannels, true);
router.postS('/rateChannel/:blockId', RateChannel.updateChannels, true);

// router.getS('/flashSale/:blockId', FlashSale.getBlockFlashSale, true);
// router.putS('/flashSale/:blockId', FlashSale.updateBlockFlashSaleActive, true);

const activity = {
	PROMOTION_RULE_CREATE: {
		key: '/ruleset',
		exact: true,
	},
	PROMOTION_RULE_UPDATE: {
		key: '/ruleset/{id}',
		method: 'PUT',
		exact: true,
	},
	PROMOTION_RULE_DELETE: {
		key: '/ruleset/{id}',
		method: 'DELETE',
		exact: true,
	},
	PROMOTION_RULE_ACTIVE: {
		key: '/ruleset/{id}/active',
		method: 'PUT',
		exact: true,
	},
	PROMOTION_RULE_BLOCK_CREATE: {
		key: '/ruleset_block',
		exact: true,
	},
	PROMOTION_RULE_BLOCK_UPDATE: {
		key: '/ruleset_block/{id}',
		method: 'PUT',
		exact: true,
	},
	PROMOTION_RULE_BLOCK_DELETE: {
		key: '/ruleset_block/{id}',
		method: 'DELETE',
		exact: true,
	},
	PROMOTION_RULE_BLOCK_ACTIVE: {
		key: '/ruleset_block/{id}/active',
		method: 'PUT',
		exact: true,
	},
	PROMOTION_RATE_CHANNEL_UPDATE: {
		key: '/rateChannel/{id}',
		method: 'POST',
		exact: true,
	},
	PROMOTION_AUTO_RULE_CREATE: {
		key: '/ruleset_auto',
		method: 'POST',
		exact: true,
	},
	PROMOTION_AUTO_RULE_UPDATE: {
		key: '/ruleset_auto/{id}',
		method: 'PUT',
		exact: true,
	},
	PROMOTION_AUTO_RULE_DELETE: {
		key: '/ruleset_auto/{id}',
		method: 'DELETE',
		exact: true,
	},
};

module.exports = { router, activity };

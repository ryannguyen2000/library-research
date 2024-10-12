const { PromotionType, PromotionRuleSetType } = require('@utils/const');

const PROMOTION_NAME = {
	[PromotionType.Basic]: 'Basic Deal',
	[PromotionType.EarlyBird]: 'Early Bird',
	[PromotionType.LastMinute]: 'Last Minute',
	[PromotionType.NightFlashSale]: 'Night Flash Sale',
	[PromotionType.HourlySale]: 'Hourly Sale',
};

const PROMOTION_MAP_TYPE = {
	[PromotionType.Basic]: PromotionRuleSetType.SEASONAL_ADJUSTMENT,
	[PromotionType.EarlyBird]: PromotionRuleSetType.BOOKED_BEYOND_AT_LEAST_X_DAYS,
	[PromotionType.LastMinute]: PromotionRuleSetType.BOOKED_WITHIN_AT_MOST_X_DAYS,
	[PromotionType.NightFlashSale]: PromotionRuleSetType.NIGHT_FLASH_SALE,
	[PromotionType.HourlySale]: PromotionRuleSetType.HOURLY_SALE,
};

const PROMOTION_MAP = Object.revert(PROMOTION_MAP_TYPE);

module.exports = {
	PROMOTION_NAME,
	PROMOTION_MAP_TYPE,
	PROMOTION_MAP,
};

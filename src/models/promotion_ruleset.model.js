const mongoose = require('mongoose');
const _ = require('lodash');
const { PromotionType, PromotionRuleSetType, PromotionChangeType } = require('@utils/const');

const { Schema } = mongoose;

const PromotionRuleSetSchema = new Schema(
	{
		name: String,
		active: { type: Boolean, default: true },
		airbnb: {
			title: String,
			color: String,
			pricing_rules: [
				{
					_id: false,
					isSpec: Boolean,
					price_change: Number,
					price_change_type: { type: String, enum: Object.values(PromotionChangeType) },
					rule_type: { type: String, enum: Object.values(PromotionRuleSetType) },
					threshold_one: Number,
					threshold_two: Number,
					threshold_three: Number,
				},
			],
		},
		// config
		startDate: Date,
		endDate: Date,
		dayOfWeeks: String, // "1111111" mon, tue, weds...
		bookStartDate: Date,
		bookEndDate: Date,
		bookDayOfWeeks: String,
		activeOTAs: [String],
		ratio: [
			{
				_id: false,
				otaName: String,
				value: Number,
			},
		],
		algorithm: { type: String, default: 'algorithmA' },
		promotions: [
			{
				promotionId: { type: Schema.Types.ObjectId, ref: 'Promotion' },
				type: { type: String, enum: Object.values(PromotionType) },
				otaName: String,
				account: String,
				smart: { type: Boolean, default: false },
				genius: { type: Boolean, default: false },
				active: { type: Boolean, default: true },
				rateIds: [{ type: Schema.Types.ObjectId, ref: 'Rate' }],
				ratePlanIds: [{ type: Number, ref: 'RatePlan' }],
				blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
				rulesetBlockId: { type: Schema.Types.ObjectId, ref: 'PromotionRuleSetBlocks' },
				propertyId: String,
				genFromPromotion: { type: Schema.Types.ObjectId, ref: 'Promotion' },
			},
		],
		tags: [
			{
				_id: false,
				text: String,
				color: String,
			},
		],
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
	},
	{ timestamps: true }
);

PromotionRuleSetSchema.pre('save', function (next) {
	this.airbnb.pricing_rules = _.uniqBy(this.airbnb.pricing_rules, rule => `${rule.rule_type}|${rule.threshold_one}`);

	next();
});

PromotionRuleSetSchema.statics = {
	findRule(rules, rule) {
		const singleRules = [
			PromotionRuleSetType.SEASONAL_ADJUSTMENT,
			PromotionRuleSetType.NIGHT_FLASH_SALE,
			PromotionRuleSetType.HOURLY_SALE,
		];

		return rules.find(
			c =>
				c.rule_type === rule.rule_type &&
				(!c.threshold_one || c.threshold_one === rule.threshold_one || singleRules.includes(c.rule_type))
		);
	},
};

module.exports = mongoose.model('PromotionRuleSet', PromotionRuleSetSchema, 'promotion_ruleset');

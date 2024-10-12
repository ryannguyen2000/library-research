const mongoose = require('mongoose');
const { PromotionRuleSetType, PromotionRuleSetBlockType, PromotionExecType } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const PromotionRuleSetBlocksSchema = new Schema(
	{
		active: { type: Boolean, default: true },
		name: String,
		// info
		blockId: { type: ObjectId, ref: 'Block' },
		rulesetId: { type: ObjectId, ref: 'PromotionRuleSet' },

		rateIds: [{ type: ObjectId, ref: 'Rate' }],
		ratePlanIds: [{ type: Number, ref: 'RatePlan' }],
		roomTypeIds: [{ type: ObjectId, ref: 'RoomTypeId' }],
		otas: [String],

		ruleBlockType: {
			type: Number,
			default: PromotionRuleSetBlockType.Default,
			enum: Object.values(PromotionRuleSetBlockType),
		},

		activeRules: [
			{
				_id: false,
				ruleType: { type: String, enum: Object.values(PromotionRuleSetType) },
				otas: [String],
			},
		],
		currentRules: [
			{
				_id: false,
				rule_type: { type: String, enum: Object.values(PromotionRuleSetType) },
				price_change: Number,
				price_change_type: String,
				threshold_one: Number,
				threshold_two: Number,
				threshold_three: Number,
				promotionAutoId: { type: ObjectId, ref: 'PromotionAuto' },
				autoState: { type: Number, enum: Object.values(PromotionExecType) },
				createdAt: Date,
			},
		],

		// promotions
		promotionIds: [{ type: ObjectId, ref: 'Promotion' }],

		createdBy: {
			type: ObjectId,
			ref: 'User',
		},
	},
	{ timestamps: true }
);

// PromotionRuleSetBlocksSchema.index({ rulesetId: 1, blockId: 1 }, { unique: true });

// PromotionRuleSetBlocksSchema.pre('save', function (next) {
// 	if (this.ruleBlockType === PromotionRuleSetBlockType.Default) {
// 		this.currentRules = this.activeRules.map(r => r.ruleType);
// 	}

// 	next();
// });

PromotionRuleSetBlocksSchema.statics = {
	findByRuleSetId(rulesetId) {
		return this.find({ rulesetId });
	},
};

module.exports = mongoose.model('PromotionRuleSetBlocks', PromotionRuleSetBlocksSchema, 'promotion_ruleset_blocks');

const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const PromotionBlocksSchema = new Schema(
	{
		promotionId: { type: ObjectId, ref: 'Promotion' },
		blockId: { type: ObjectId, ref: 'Block' },
		rateIds: [{ type: ObjectId, ref: 'Rate' }],
		ratePlanIds: [{ type: Number, ref: 'RatePlan' }],
		manual: { type: Boolean, default: true },
		promotionRulesetBlockId: { type: ObjectId, ref: 'PromotionRuleSetBlocks' },
		otaName: String,
	},
	{
		timestamps: true,
	}
);

PromotionBlocksSchema.index({ promotionId: 1, blockId: 1 }, { unique: true });

PromotionBlocksSchema.statics.remove = async function (promotionId, blockId) {
	return await this.findOneAndRemove({ promotionId, blockId });
};

module.exports = mongoose.model('PromotionBlocks', PromotionBlocksSchema, 'promotion_blocks');

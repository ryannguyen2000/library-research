const mongoose = require('mongoose');
const { OTAs, PromotionCalcType } = require('@utils/const');

const { Schema, Custom } = mongoose;
const { ObjectId } = Schema.Types;

const PromotionRateChannelSchema = new Schema(
	{
		blockId: Custom.Ref({ type: ObjectId, ref: 'Block' }),
		otaName: { type: String, required: true, enum: Object.values(OTAs) },
		name: { type: String },
		value: { type: Number, default: 0, min: 0, max: 100 },
		geniusValue: { type: Number, default: 0, min: 0, max: 100 },
		calcType: { type: String, default: PromotionCalcType.Multi, enum: Object.values(PromotionCalcType) },
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('PromotionRateChannel', PromotionRateChannelSchema, 'promotion_rate_channel');

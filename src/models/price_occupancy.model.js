const mongoose = require('mongoose');

const { PolicyRuleDiscountTypes } = require('@utils/const');
// const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const PriceOccupancySchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block', required: true },
		roomTypeId: { type: ObjectId, ref: 'RoomType', required: true },
		ratePlanId: { type: Number, ref: 'RatePlan', required: true },
		baseOccupancies: [
			{
				type: {
					type: Number,
					enum: Object.values(PolicyRuleDiscountTypes),
					required: true,
					default: PolicyRuleDiscountTypes.Amount,
				},
				amount: { type: Number },
				occupancy: { type: Number, min: 1, required: true },
				otas: [String],
			},
		],
		createdBy: { type: ObjectId, ref: 'User' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('PriceOccupancy', PriceOccupancySchema, 'price_occupancy');

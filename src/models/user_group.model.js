const mongoose = require('mongoose');
const { BOOKING_PRICE_VAT_TYPES } = require('@utils/const');

const { Schema } = mongoose;

const UserGroupSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
		},
		primary: Boolean,
		hotlines: [String],
		configs: {
			displayPrimaryBankAccountTransaction: Boolean,
			maxTransactionAmountToDisplay: Number,
			maxTimeToDisplay: Number,
			autoVATTask: Boolean,
			bookingPriceInVAT: { type: String, enum: Object.values(BOOKING_PRICE_VAT_TYPES) },
			defaultIsOwnerCollect: Boolean,
		},
		// otts: [{ type: Schema.Types.ObjectId, ref: 'Ott' }],
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('UserGroup', UserGroupSchema, 'user_group');

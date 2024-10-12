const mongoose = require('mongoose');
const { PAYMENT_CARD_SWIPE_STATUS } = require('@utils/const');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		cardHolderName: String,
		cardNumber: String,
		cardType: String,
		expiryDate: String,
		currency: String,
		amount: Number,
		securityCode: String,
		isSingleSwipe: Boolean,
		statusPaid: { type: Boolean, default: false },
		swipeStatus: {
			type: String,
			default: PAYMENT_CARD_SWIPE_STATUS.UNSWIPED,
			enum: Object.values(PAYMENT_CARD_SWIPE_STATUS),
		},
		updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('PaymentCard', ModelSchema, 'payment_card');

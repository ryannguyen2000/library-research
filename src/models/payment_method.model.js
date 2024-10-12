const mongoose = require('mongoose');
const { PayoutSources, ThirdPartyPayment } = require('@utils/const');

const { Schema } = mongoose;

const PaymentMethodSchema = new Schema(
	{
		name: String,
		accessKey: String,
		serectkey: String,
		secretKey: String,
		partnerCode: String,
		endpoint: String,
		returnUrl: String,
		notifyUrl: String,
		configs: Schema.Types.Mixed,
	},
	{
		timestamps: true,
	}
);

PaymentMethodSchema.statics = {
	getPayoutSource(method) {
		if (method === ThirdPartyPayment.MOMO) {
			return PayoutSources.ONLINE_WALLET;
		}
		return PayoutSources.THIRD_PARTY;
	},
};

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema, 'payment_method');

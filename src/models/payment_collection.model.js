const mongoose = require('mongoose');
const { PayoutCollectStatus } = require('@utils/const');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		otaName: String,
		account: String,
		blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
		createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
		date: String,
		paymentMethod: Number,
		paymentMethodName: String,
		propertyId: String,
		propertyName: String,
		status: { type: String, enum: Object.values(PayoutCollectStatus) },
		totalAmount: Number,
		newPayout: Boolean,
		payoutExportId: { type: Schema.Types.ObjectId, ref: 'PayoutExport' },
		transactions: [
			{
				otaId: String,
				amountToSale: Number,
				amountFromOTA: Number,
				amountToOTA: Number,
				amount: Number,
				otaBookingId: String,
				otaName: String,
				booked: String,
				checkIn: String,
				checkOut: String,
				guestName: String,
				id: String,
				status: String,
				currency: String,
				adjustment: Boolean,
				originData: Schema.Types.Mixed,
			},
		],
		originTransactions: [Schema.Types.Mixed],
		collectionIds: [String],
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('PaymentCollection', ModelSchema, 'payment_collection');

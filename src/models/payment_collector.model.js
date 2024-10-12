const mongoose = require('mongoose');
const { PayoutSources } = require('@utils/const');

const { Schema } = mongoose;

const PaymentCollectorSchema = new Schema(
	{
		name: String,
		tag: { type: String, required: true },
		conds: [
			{
				fromDate: String, // Y-MM-DD
				toDate: String, // Y-MM-DD
				ota: { type: String },
				key: { type: String },
				value: { type: Schema.Types.Mixed },
				equal: { type: String },
				fee: { type: Number },
				fixedFee: { type: Number },
				minFee: { type: Number },
				additionals: [
					{
						_id: false,
						key: { type: String },
						value: { type: Schema.Types.Mixed },
					},
				],
			},
		],
		active: { type: Boolean, default: true },
		banking: Boolean,
		bankingSearchRegex: String,
		fixedFee: Number,
		roundedValue: { type: Number, default: 0 },
		collectionType: { type: String, enum: Object.values(PayoutSources) },
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('PaymentCollector', PaymentCollectorSchema, 'payment_collector');

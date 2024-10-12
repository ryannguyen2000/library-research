const mongoose = require('mongoose');
const {
	Services,
	Currency,
	REPORT_STREAM_TRANSACTION_STATUS,
	REPORT_STREAM_TRANSACTION_TYPES,
	REPORT_STREAM_SOURCES,
} = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ReportStreamTransactionSchema = new Schema(
	{
		date: { type: String, required: true },
		blockId: { type: ObjectId, ref: 'Block', required: true },
		serviceType: { type: Number, enum: Object.values(Services) },
		bookingId: { type: ObjectId, ref: 'Booking' },
		roomId: { type: ObjectId, ref: 'Room' },
		payoutId: { type: ObjectId, ref: 'Payout' },
		categoryId: { type: ObjectId, ref: 'ReportStreamCategory', required: true },
		projectId: { type: ObjectId, ref: 'ReportStreamCategory' },
		amount: { type: Number },
		currency: { type: String, default: Currency.VND },
		gmv: { type: Number },
		provinceId: { type: Number },
		districtId: { type: Number },
		wardId: { type: Number },
		otaName: { type: String },
		description: { type: String },
		type: {
			type: Number,
			enum: Object.values(REPORT_STREAM_TRANSACTION_TYPES),
			required: true,
		},
		source: { type: Number, enum: Object.values(REPORT_STREAM_SOURCES) },
		status: {
			type: Number,
			enum: Object.values(REPORT_STREAM_TRANSACTION_STATUS),
			default: REPORT_STREAM_TRANSACTION_STATUS.TEMPOLARY,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('ReportStreamTransaction', ReportStreamTransactionSchema, 'report_stream_transaction');

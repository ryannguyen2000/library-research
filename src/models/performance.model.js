const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const PerformanceSchema = new mongoose.Schema(
	{
		blockId: { type: ObjectId, ref: 'Block', required: true },
		date: { type: Date, required: true },
		otaName: { type: String, required: true },
		account: { type: String, required: true },
		result_views: { type: Number, default: 0 },
		property_views: { type: Number, default: 0 },
		bookings: { type: Number, default: 0 },
		total_score: { type: Number, default: 0 },
		score: { type: Number, default: 0 },
	},
	{
		timestamps: true,
	}
);

PerformanceSchema.index({ blockId: 1, date: 1, otaName: 1, account: 1 }, { unique: true });

module.exports = mongoose.model('Performance', PerformanceSchema, 'performance');

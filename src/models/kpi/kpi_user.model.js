const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const KPISchema = new Schema(
	{
		userId: { ref: 'User', type: ObjectId },
		kpiId: { ref: 'KPI', type: ObjectId },
		status: {
			type: String,
			enum: ['doing', 'canceled', 'failed', 'done_min', 'done'],
			default: 'doing',
		},
		progress: { type: Number, default: 0 },
		timeStart: { type: Date, default: Date.now },
		timeEnd: Date,
		rewarded: Boolean,
		cashReward: Number,
		pointReward: Number,
	},
	{ timestamps: true }
);

module.exports = mongoose.model('KPIUser', KPISchema, 'kpi_user');

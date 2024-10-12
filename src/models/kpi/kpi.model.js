const mongoose = require('mongoose');
const { KPIs } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const KPISchema = new Schema(
	{
		name: String,
		type: { type: String, enum: Object.values(KPIs) },
		createdBy: { type: ObjectId, ref: 'User' },
		assigned: [{ type: ObjectId, ref: 'KPIUser' }],
		parentId: { type: ObjectId, ref: 'KPI' },
		enable: { type: Boolean, default: true },
		configs: {
			minNumberItems: Number,
			maxNumberItems: Number,
			minReservations: Number,
			maxReservations: Number,
			minScores: Number,
			maxScores: Number,
			chanels: [String],
			types: [String],
			timeStart: Date,
			timeEnd: Date,
			rolesRequired: [String],
			levelRequired: { type: Number, default: 0 },
			minCashReward: Number,
			maxCashReward: Number,
			minCashGotReward: Number,
			minPointReward: Number,
			maxPointReward: Number,
			minPointGotReward: Number,
		},
	},
	{ timestamps: true }
);

module.exports = mongoose.model('KPI', KPISchema, 'kpi');

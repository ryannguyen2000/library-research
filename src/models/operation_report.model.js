const _ = require('lodash');
const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;
const { OperationReportStatus, OPERATION_REPORT_TYPE } = require('@utils/const');

const ModelSchema = new Schema(
	{
		period: { type: String, required: true }, // YYYY-MM
		name: { type: String },
		description: { type: String },
		createdBy: { ref: 'User', type: ObjectId },
		resourceId: { type: ObjectId, ref: 'ResourceFile' },
		blockId: { type: ObjectId, ref: 'Block' },
		status: {
			type: String,
			enum: Object.values(OperationReportStatus),
			default: OperationReportStatus.IN_PROGRESS,
		},
		type: {
			type: String,
			enum: Object.values(OPERATION_REPORT_TYPE),
			default: OPERATION_REPORT_TYPE.REVENUE_REPORT,
		},
		url: String,
		version: { type: Number },
		from: { type: Date },
		to: { type: Date },
		language: String,
		numRun: { type: Number, default: 0 },
		operationReportCategories: [{ type: String }],
		startTime: { type: Date },
		endTime: { type: Date },
		params: {
			taxRate: Number,
			revenueKeys: [String],
			config: Mixed,
			feeGroupReport: Mixed,
			block: Mixed,
			rooms: Mixed,
		},
		data: {
			hostRevenues: Mixed,
			revenues: Mixed,
			fees: Mixed,
		}, // data of report at confirmed time
	},
	{ timestamps: true }
);

module.exports = mongoose.model('OperationReport', ModelSchema, 'operation_report');

const mongoose = require('mongoose');
const { REPORT_STREAM_CTG_TYPES } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ReportProjectSchema = new Schema(
	{
		name: { type: String },
		type: { type: String, enum: Object.values(REPORT_STREAM_CTG_TYPES) },
		data: [
			{
				//
			},
		],
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('ReportStreamTemplate', ReportProjectSchema, 'report_stream_template');

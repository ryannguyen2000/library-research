const mongoose = require('mongoose');
const {
	REPORT_STREAM_CTG_TYPES,
	REPORT_STREAM_VIRTUAL_CTG_TYPES,
	REPORT_STREAM_SOURCES,
	EXPENSES_STREAM_DATA_TYPES,
} = require('@utils/const');
const { OPERATORS } = require('@utils/operator');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const StreamCtgSchema = new Schema(
	{
		name: { type: String },
		description: { type: String },
		type: { type: String, enum: Object.values(REPORT_STREAM_CTG_TYPES) },
		parentId: { type: ObjectId, ref: 'ReportStreamCategory' },
		isVirtual: { type: Boolean, default: false },
		virtualType: { type: String, enum: Object.values(REPORT_STREAM_VIRTUAL_CTG_TYPES) },
		order: Number,
		dataType: {
			type: Number,
			enum: Object.values(EXPENSES_STREAM_DATA_TYPES),
		},
		refIds: [{ type: ObjectId, ref: 'ReportStreamCategory' }],
		operation: {
			operator: { type: String, enum: Object.values(OPERATORS) },
			values: [Mixed],
		},
		suffix: String,
		sources: [
			{
				type: Number,
				enum: Object.values(REPORT_STREAM_SOURCES),
			},
		],
		chartColor: String,
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

StreamCtgSchema.virtual('children', {
	ref: 'ReportStreamCategory',
	localField: '_id',
	foreignField: 'parentId',
});

StreamCtgSchema.virtual('totalChilds', {
	ref: 'ReportStreamCategory',
	localField: '_id',
	foreignField: 'parentId',
	count: true,
});

module.exports = mongoose.model('ReportStreamCategory', StreamCtgSchema, 'report_stream_category');

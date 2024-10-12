const mongoose = require('mongoose');
const _ = require('lodash');

const { REPORT_TEMPLATE_TYPES } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const ModelSchema = new Schema(
	{
		name: { type: String },
		type: { type: String, enum: _.values(REPORT_TEMPLATE_TYPES) },
		taskCategoryIds: [{ type: ObjectId, ref: 'TaskCategory' }],
		customVariables: [
			{ name: { type: String }, values: [{ value: { type: String }, blockIds: [{ type: ObjectId }] }] },
		],
		resourceFolder: { folderName: { type: String }, children: { type: Object } },
		body: [
			{
				text: { type: String },
				style: Mixed,
				checkListCategories: [{ type: ObjectId, ref: 'CheckListCategory' }],
				attachments: { type: [{ type: String }] },
			},
		],
	},
	{ timestamps: true }
);
module.exports = mongoose.model('ReportTemplate', ModelSchema, 'report_template');

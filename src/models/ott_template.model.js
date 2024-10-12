const mongoose = require('mongoose');
// const { UserRoles } = require('@utils/const');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const OttTemplateSchema = new Schema(
	{
		ottName: { type: String, required: true },
		name: String,
		active: { type: Boolean, default: true },
		templateId: String,
		templateName: String,
		createdTime: Number,
		status: String,
		templateQuality: String,
		content: Mixed,
		ottId: { type: ObjectId, ref: 'Ott' },
	},
	{
		timestamps: true,
	}
);

OttTemplateSchema.statics = {};

module.exports = mongoose.model('OttTemplate', OttTemplateSchema, 'ott_template');

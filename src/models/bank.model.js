const mongoose = require('mongoose');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		name: String,
		bankCode: { type: String },
		shortName: String,
		detail: String,
		regex: String,
		bin: String,
		citadCode: String,
		logo: String,
		bankCodeMB: String,
		SWIFT: String,
		ignoreValidation: Boolean,
		forceValidation: Boolean,
		active: { type: Boolean, default: true },
	},
	{
		timestamps: false,
		versionKey: false,
	}
);

ModelSchema.statics = {};

module.exports = mongoose.model('Bank', ModelSchema, 'bank');

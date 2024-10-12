const mongoose = require('mongoose');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		from: String,
		data: Schema.Types.Mixed,
		headers: Schema.Types.Mixed,
		request: Schema.Types.Mixed,
		response: Schema.Types.Mixed,
		url: String,
		receiving: Boolean,
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

module.exports = mongoose.model('APIDebugger', ModelSchema, 'api_debugger');

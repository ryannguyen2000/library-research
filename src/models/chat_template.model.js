const mongoose = require('mongoose');

const { Schema } = mongoose;

const ChatTemplateSchema = new Schema(
	{
		name: String,
		description: String,
		vi: String,
		en: String,
		order: { type: Number, default: 0 },
		notes: Schema.Types.Mixed,
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('ChatTemplate', ChatTemplateSchema, 'chat_template');

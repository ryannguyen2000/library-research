const mongoose = require('mongoose');

const { Schema } = mongoose;

const HookSchema = new Schema(
	{
		from: { type: String, enum: ['mail'], default: 'mail' },
		done: { type: Boolean, default: false },
		data: Schema.Types.Mixed,
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Hook', HookSchema, 'hook');

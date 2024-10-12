const mongoose = require('mongoose');

const { Schema } = mongoose;

const UserLogSchema = new Schema(
	{
		username: { type: String },
		method: String,
		action: String,
		body: Schema.Types.Mixed,
		detail: Schema.Types.Mixed,
		response: Schema.Types.Mixed,
	},
	{
		timestamps: {
			createdAt: true,
			updatedAt: false,
		},
		versionKey: false,
		autoIndex: false,
		toJSON: {
			virtuals: true,
		},
	}
);

UserLogSchema.index({ createdAt: 1 });

module.exports = mongoose.model('UserLogError', UserLogSchema, 'user_log_error');

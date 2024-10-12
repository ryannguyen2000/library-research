const mongoose = require('mongoose');
const { EMAIL_TYPE } = require('@utils/const');

const { Schema } = mongoose;

const EmailRecipients = new Schema(
	{
		email: { type: String },
		type: { type: String, enum: Object.values(EMAIL_TYPE) },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('EmailRecipients', EmailRecipients, 'email_recipients');

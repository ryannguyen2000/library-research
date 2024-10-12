const mongoose = require('mongoose');
const _ = require('lodash');

const { EMAIL_TYPE, EMAIL_SUB_TYPE } = require('@utils/const');
const { decryptData } = require('@utils/crypto');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const EmailConfig = new Schema(
	{
		email: { type: String },
		password: { type: String },
		type: { type: String, enum: Object.values(EMAIL_TYPE), required: true },
		subTypes: [{ type: String, enum: Object.values(EMAIL_SUB_TYPE) }],
		configs: [
			{
				type: { type: String, enum: Object.values(EMAIL_SUB_TYPE) },
				options: {
					to: String,
					cc: String,
					bcc: String,
				},
			},
		],
		credential: Mixed,
		info: Mixed,
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		isSystem: { type: Boolean, default: false },
		signature: [
			{
				userId: { type: ObjectId, ref: 'User' },
				new: { type: ObjectId, ref: 'EmailSignature' },
				replyAndForward: { type: ObjectId, ref: 'EmailSignature' },
				isBeforeQuotedText: { type: Boolean, default: false },
			},
		],
	},
	{ timestamps: true }
);

EmailConfig.virtual('decryptedPassword').get(function () {
	try {
		const decryptedPassword = decryptData(this.password);
		return decryptedPassword;
	} catch (err) {
		return null;
	}
});

module.exports = mongoose.model('EmailConfig', EmailConfig, 'email_config');

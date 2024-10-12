const mongoose = require('mongoose');

const { SYS_BANK_ACCOUNT_TYPE } = require('@utils/const');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		name: String,
		bankCode: String,
		username: { type: String },
		password: { type: String },
		isTest: Boolean,
		accountType: {
			type: String,
			enum: Object.values(SYS_BANK_ACCOUNT_TYPE),
			default: SYS_BANK_ACCOUNT_TYPE.OUTBOUND,
		},
		active: { type: Boolean, default: true },
		configs: {
			serectKey: String,
			expiresIn: Number, // minute
			partnerCode: String,
			apiKey: String,
			privateKey: String,
			publicKey: String,
			endpoint: String,
			applicationType: String,
			authenType: String,
			transType: String,
			customerType: String,
			customerLevel: String,
			serviceType: String,
			channel: String,
			ftp: Schema.Types.Mixed,
		},
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

// ModelSchema.virtual('decryptedPassword').get(function () {
// 	try {
// 		const decryptedPassword = decryptData(this.password);
// 		return decryptedPassword;
// 	} catch (err) {
// 		return null;
// 	}
// });

ModelSchema.statics = {
	//
};

module.exports = mongoose.model('BankServiceAccount', ModelSchema, 'bank_service_account');

const mongoose = require('mongoose');
const { AccountConfigTypes, AccountProvider } = require('@utils/const');

const Schema = new mongoose.Schema(
	{
		name: { type: String },
		username: { type: String },
		password: { type: String },
		accountType: { type: String, enum: Object.values(AccountConfigTypes) }, // for internal guest type
		others: { type: mongoose.Schema.Types.Mixed },
		provider: { type: String, enum: Object.values(AccountProvider) },
		active: { type: Boolean, default: true },
		groupIds: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'UserGroup',
			},
		],
		blockIds: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Block',
			},
		],
		authorizationKey: {
			accessKey: String,
			secretKey: String,
			accessToken: String,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('AccountConfig', Schema, 'account_config');

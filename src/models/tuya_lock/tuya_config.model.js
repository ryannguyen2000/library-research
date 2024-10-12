const { Schema, model } = require('mongoose');

const tuyaConfigSchema = new Schema(
	{
		authorizationKey: {
			accessKey: String,
			serectKey: String,
		},
		appAccountUID: [String],
		expiryDate: Date,
		enable: { type: Boolean, default: true },
	},
	{
		timestamps: true,
	}
);

module.exports = model('TuyaConfig', tuyaConfigSchema, 'config');

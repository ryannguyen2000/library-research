const { Schema, model } = require('mongoose');

const tuyaHomeSchema = new Schema(
	{
		homeId: Number,
		name: String,
		address: String,
		createAt: Number,
	},
	{
		timestamps: true,
	}
);

module.exports = model('TuyaHome', tuyaHomeSchema, 'tuya_home');

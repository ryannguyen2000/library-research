const { Schema, model } = require('mongoose');

const tuyaDeviceSchema = new Schema(
	{
		homeId: Number,
		deviceId: String,
		deviceName: String,
		type: String,
		createAt: Number,
		batteryState: String,
		model: String,
	},
	{
		timestamps: true,
	}
);

module.exports = model('TuyaDevice', tuyaDeviceSchema, 'tuya_device');

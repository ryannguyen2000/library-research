const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const UserDeviceSchema = new Schema(
	{
		userId: ObjectId,
		deviceName: { type: String },
		notiId: String,
	},
	{
		timestamps: true,
	}
);

UserDeviceSchema.statics = {
	async updateOrCreate(userId, deviceName, notiId) {
		let userDevice = await this.findOne({ userId, deviceName });
		if (userDevice) {
			userDevice.notiId = notiId;
		} else {
			userDevice = new this({ userId, deviceName, notiId });
		}
		await userDevice.save();
		return userDevice;
	},

	async getNotiKeys(userIds) {
		const devices = await this.find({ userId: userIds });
		return devices.map(d => d.notiId);
	},
};

module.exports = mongoose.model('UserDevice', UserDeviceSchema, 'user_device');

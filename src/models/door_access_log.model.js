const _ = require('lodash');
const mongoose = require('mongoose');
const { DOOR_LOCK_TYPE } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const AccessLog = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block' },
		roomId: { type: ObjectId, ref: 'Room' },
		bookingId: { type: ObjectId, ref: 'Booking' },
		userId: String,
		time: Date,
		type: String,
		checkin: Boolean,
		deviceId: String,
		nameUnlocker: String,
		action: String,
		lockType: { type: String, enum: _.values(DOOR_LOCK_TYPE) },
		messageId: String, // Tuya log key
	},
	{ timestamps: true, autoIndex: false }
);

AccessLog.index({ bookingId: 1 });
AccessLog.index({ time: -1 });
AccessLog.index({ roomId: 1 });
AccessLog.index({ blockId: 1 });

module.exports = mongoose.model('DoorAccessLog', AccessLog, 'door_access_log');

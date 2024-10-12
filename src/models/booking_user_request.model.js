const mongoose = require('mongoose');
const { PayoutCollectStatus } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		bookingId: { type: ObjectId, ref: 'Booking', required: true },
		roomId: { type: ObjectId, ref: 'Room', required: true },
		reasonId: { type: ObjectId, ref: 'ReasonUpdating', required: true },
		reasonOther: String,
		requestData: [
			{
				key: String,
				value: Number,
			},
		],
		status: { type: String, enum: Object.values(PayoutCollectStatus) },
		createdBy: { type: ObjectId, ref: 'User' },
		description: { type: String },
		approvedBy: { type: ObjectId, ref: 'User' },
		approvedAt: { type: Date },
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('BookingUserRequest', ModelSchema, 'booking_user_request');

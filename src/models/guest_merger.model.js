const mongoose = require('mongoose');

const { Schema } = mongoose;

const GuestMergerSchema = new Schema(
	{
		createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
		targetId: { type: Schema.Types.ObjectId, ref: 'Guest' },
		targetData: Schema.Types.Mixed,
		rollback: { type: Boolean, default: false },
		rollbackAt: Date,
		rollbackBy: { type: Schema.Types.ObjectId, ref: 'User' },
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
		mergerConditions: [
			{
				key: String,
				value: String,
			},
		],
		guests: [
			{
				_id: false,
				guestId: { type: Schema.Types.ObjectId, ref: 'Guest' },
				bookingIds: [{ type: Schema.Types.ObjectId, ref: 'Booking' }],
				messageIds: [{ type: Schema.Types.ObjectId, ref: 'Messages' }],
			},
		],
	},
	{
		timestamps: true,
		autoIndex: false,
	}
);

const GuestMerger = mongoose.model('GuestMerger', GuestMergerSchema, 'guest_merger');

module.exports = GuestMerger;

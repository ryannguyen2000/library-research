const mongoose = require('mongoose');
const { newCSEventEmitter, NEWCS_EVENTS } = require('@utils/events');
const { InboxType } = require('@utils/const');

const { Schema } = mongoose;

const OTTMessageSchema = new Schema(
	{
		ottName: { type: String },
		toId: String,
		user: String, // 'me' or 'guest'
		messageId: String,
		sender: String,
		time: Date,
		otaBookingId: String,
		otaName: String,
		fromMe: { type: Boolean, default: true },
		messageType: { type: String },
		payoutId: Schema.Types.ObjectId,
		requestId: Schema.Types.ObjectId,
		event: { type: String, default: InboxType.MESSAGE },
	},
	{
		timestamps: true,
	}
);

OTTMessageSchema.index({ ottName: 1 });
OTTMessageSchema.index({ messageId: 1 });

OTTMessageSchema.post('save', function (doc) {
	// NEWCS
	if (doc.otaBookingId && doc.otaName && doc.messageId) {
		newCSEventEmitter.emit(NEWCS_EVENTS.NEW_MSG, doc);
	}
});

module.exports = mongoose.model('OTTMessage', OTTMessageSchema, 'ott_message');

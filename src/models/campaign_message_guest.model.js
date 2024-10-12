const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const CampaignMessageSchema = new Schema(
	{
		guestId: { type: ObjectId, ref: 'Guest' },
		campaignId: { type: ObjectId, ref: 'CampaignMessage' },
		createdBy: { type: ObjectId, ref: 'User' },
	},
	{ timestamps: true }
);

CampaignMessageSchema.index({
	guestId: 1,
	campaignId: 1,
});

module.exports = mongoose.model('CampaignMessageGuest', CampaignMessageSchema, 'campaign_message_guest');

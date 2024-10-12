const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const CampaignImageSchema = new Schema(
	{
		name: { type: String, required: true },
		fileName: { type: String, required: true },
		url: { type: String, required: true },
		createdBy: { type: ObjectId, ref: 'User' },
		campaignId: { type: ObjectId, ref: 'CampaignMessage' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('CampaignImage', CampaignImageSchema, 'campaign_image');

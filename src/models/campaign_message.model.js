const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const CampaignMessageSchema = new Schema(
	{
		name: { type: String, required: true },
		active: { type: Boolean, default: true },
		description: { type: String },
		type: { type: String },
		createdBy: { type: ObjectId, ref: 'User' },
		api: String,
		fields: [String],
		fieldsResponse: [String],
		languages: [String],
		groupId: { type: ObjectId, ref: 'UserGroup' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('CampaignMessage', CampaignMessageSchema, 'campaign_message');

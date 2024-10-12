const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const CallSchema = new Schema(
	{
		name: String,
		url: String,
		apiKeySid: String,
		apiKeySecret: String,
		listAgentsUrl: String,
		stringeeGroupId: String,
		stringeeQueueId: String,
		stringeeProjectId: Number,
		token: String,
		tokenExp: Number,
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		phoneList: [
			{
				_id: false,
				id: String,
				number: String,
				alias: String,
				priority: Boolean,
				branchName: [String],
				groupId: { type: ObjectId, ref: 'UserGroup' },
			},
		],
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('CallProject', CallSchema, 'call_project');

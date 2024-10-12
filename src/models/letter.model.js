const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const LetterSchema = new Schema(
	{
		name: { type: String, required: true },
		fileName: { type: String, required: true },
		url: { type: String, required: true },
		createdBy: { type: ObjectId, ref: 'User' },
		type: { type: String, enum: ['apology'] },
		groupId: { type: ObjectId, ref: 'UserGroup' },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Letter', LetterSchema, 'letter');

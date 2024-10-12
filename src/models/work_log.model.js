const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const WLSchema = new Schema(
	{
		userId: { type: ObjectId, ref: 'User', required: true },
		state: { type: String },
		time: { type: Date, required: true },
		description: String,
		attachments: [String],
		blockId: { type: ObjectId, ref: 'Block' },
		ottName: String,
		ottId: String,
		ottPhone: String,
		msgId: String,
	},
	{ timestamps: true }
);

module.exports = mongoose.model('WorkLog', WLSchema, 'work_log');

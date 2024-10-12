const mongoose = require('mongoose');
const { HISTORY_TYPE } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const HistorySchema = new Schema(
	{
		description: String,
		images: [String],
		createdBy: { type: ObjectId, ref: 'User' },
		deletedBy: { type: ObjectId, ref: 'User' },
		performedby: { type: ObjectId, ref: 'User' },
		blockId: { type: ObjectId, ref: 'Block' },
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		isWorkNote: { type: Boolean, default: false },
		deleted: { type: Boolean, default: false },
		isSystem: { type: Boolean, default: false },
		editable: { type: Boolean, default: true },
		type: { type: String, required: true, enum: Object.values(HISTORY_TYPE), default: HISTORY_TYPE.BLOCK },
		ownerTime: Date,
		assetIds: [{ type: ObjectId, ref: 'AssetActive' }],

		ottName: String,
		ottAccount: String,
		ottMessageId: String,
		// for log
		action: String, // UPDATE, CREATE, DELETE
		data: String,
		prevData: String,
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('History', HistorySchema, 'history');

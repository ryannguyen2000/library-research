const mongoose = require('mongoose');
const _ = require('lodash');
const { ROOM_CARD_TYPES } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		type: { type: String, required: true, enum: Object.values(ROOM_CARD_TYPES), default: ROOM_CARD_TYPES.NORMAL },
		deleted: { type: Boolean, default: false },
		deletedBy: { type: ObjectId, ref: 'User' },
		createdBy: { type: ObjectId, ref: 'User' },
		userId: { type: ObjectId, ref: 'User' },
		blockId: { type: ObjectId, ref: 'Block', required: true },
		expiredAt: { type: Date },
		cardInfo: { cardno: String, lockno: String, etime: String },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('RoomCard', ModelSchema, 'room_card');

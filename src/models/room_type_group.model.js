const mongoose = require('mongoose');
const _ = require('lodash');
const { ROOM_GROUP_TYPES } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		name: { type: String, required: true },
		type: { type: String, required: true, enum: Object.values(ROOM_GROUP_TYPES), default: ROOM_GROUP_TYPES.CUSTOM },
		deleted: { type: Boolean, default: false },
		deletedBy: { type: ObjectId, ref: 'User' },
		createdBy: { type: ObjectId, ref: 'User' },
		blockId: { type: ObjectId, ref: 'Block', required: true },
		order: { type: Number },
	},
	{ timestamps: true }
);

ModelSchema.statics = {
	async syncDefaultRoomType({ blockId }) {
		blockId = mongoose.Types.ObjectId(blockId);

		const defaultRoomTypes = await this.model('Room').aggregate([
			{ $match: { blockId, virtual: false, isSelling: true } },
			{
				$group: {
					_id: '$info.name',
					roomIds: { $push: '$_id' },
					roomPoint: { $max: '$roomPoint' },
					layoutBg: { $max: '$info.layoutBg' },
				},
			},
		]);

		if (!defaultRoomTypes.length) return;

		const roomTypeGroup = await this.findOneAndUpdate(
			{ blockId, type: ROOM_GROUP_TYPES.DEFAULT, deleted: false },
			{
				$set: {
					order: 999,
				},
				$setOnInsert: {
					name: 'Loại phòng mặc định',
				},
			},
			{
				upsert: true,
				new: true,
			}
		);

		const RoomType = this.model('RoomType');

		const roomTypes = await defaultRoomTypes.asyncMap(defaultRoom => {
			return RoomType.findOneAndUpdate(
				{
					blockId,
					type: ROOM_GROUP_TYPES.DEFAULT,
					roomTypeGroupId: roomTypeGroup._id,
					name: defaultRoom._id,
					deleted: false,
				},
				{
					$set: {
						roomIds: defaultRoom.roomIds,
					},
					$setOnInsert: {
						roomPoint: defaultRoom.roomPoint,
						layoutBg: defaultRoom.layoutBg,
					},
				},
				{
					upsert: true,
					new: true,
				}
			);
		});

		await RoomType.deleteMany({
			blockId,
			type: ROOM_GROUP_TYPES.DEFAULT,
			_id: { $nin: _.map(roomTypes, '_id') },
		});
	},
};

module.exports = mongoose.model('RoomTypeGroup', ModelSchema, 'room_type_group');

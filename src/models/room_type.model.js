const mongoose = require('mongoose');
const _ = require('lodash');
const { logger } = require('@utils/logger');
const { ROOM_GROUP_TYPES } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		name: { type: String, required: true },
		description: { type: String },
		blockId: { type: ObjectId, ref: 'Block', required: true },
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		roomTypeGroupId: { type: ObjectId, ref: 'RoomTypeGroup', required: true },
		layoutBg: { type: String },
		deleted: { type: Boolean, default: false },
		deletedBy: { type: ObjectId, ref: 'User' },
		createdBy: { type: ObjectId, ref: 'User' },
		roomPoint: { type: Number, default: 1 },
		// virtual: { type: Boolean, default: false },
		listingId: { type: ObjectId, ref: 'Listing' },
		type: { type: String, required: true, enum: Object.values(ROOM_GROUP_TYPES), default: ROOM_GROUP_TYPES.CUSTOM },
	},
	{ timestamps: true }
);

ModelSchema.pre('save', function (next) {
	if (this.roomIds && this.roomIds.length && !this.populated('roomIds')) {
		this.roomIds = _.uniqBy(this.roomIds, _.toString);
	}

	this.$locals.isNew = this.isNew;
	this.$locals.isModifiedName = this.isModified('name');
	this.$locals.isModifiedRoomIds = this.isModified('roomIds');

	next();
});

ModelSchema.post('save', function () {
	if (this.type === ROOM_GROUP_TYPES.DEFAULT && (this.$locals.isModifiedName || this.$locals.isModifiedRoomIds)) {
		mongoose
			.model('Room')
			.updateMany(
				{
					_id: { $in: this.roomIds },
				},
				{
					$set: {
						'info.name': this.name,
					},
				}
			)
			.catch(e => {
				logger.error(e);
			});
	}
});

ModelSchema.statics = {
	async syncListingVirtualRoomType(listing) {
		let roomType = await this.findOne({
			blockId: listing.blockId,
			listingId: listing._id,
			type: ROOM_GROUP_TYPES.VIRTUAL,
		});

		if (roomType && !listing.virtualRoomType) {
			roomType.deleted = true;
		} else if (roomType && listing.virtualRoomType) {
			roomType.deleted = false;
			roomType.name = listing.name;
			roomType.roomIds = listing.roomIds;
		} else if (!roomType && listing.virtualRoomType) {
			const roomTypeGroup = await this.model('RoomTypeGroup').findOneAndUpdate(
				{
					blockId: listing.blockId,
					type: ROOM_GROUP_TYPES.VIRTUAL,
					deleted: false,
				},
				{
					$setOnInsert: {
						name: 'Loại phòng ảo',
					},
				},
				{
					upsert: true,
					new: true,
				}
			);

			roomType = new this({
				name: listing.name,
				blockId: listing.blockId,
				listingId: listing._id,
				roomIds: listing.roomIds,
				roomTypeGroupId: roomTypeGroup._id,
				type: ROOM_GROUP_TYPES.VIRTUAL,
				createdBy: listing.createdBy,
			});
		}

		if (!roomType) return;

		await roomType.save();

		if (listing.virtualRoomType) {
			await this.model('Listing').updateOne(
				{
					_id: listing._id,
				},
				{
					roomTypeId: roomType._id,
				}
			);
		}

		return roomType;
	},

	findDefaultRoomTypes(filter) {
		return this.find({
			...filter,
			deleted: false,
			type: ROOM_GROUP_TYPES.DEFAULT,
		});
	},
};

module.exports = mongoose.model('RoomType', ModelSchema, 'room_type');

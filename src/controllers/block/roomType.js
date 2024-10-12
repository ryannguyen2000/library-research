const _ = require('lodash');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { ROOM_GROUP_TYPES } = require('@utils/const');

async function getRoomTypeGroups({ blockId }) {
	const roomTypeGroups = await models.RoomTypeGroup.find({ blockId, deleted: false })
		.sort({ order: -1, createdAt: -1 })
		.populate('createdBy', 'username name')
		.lean();

	return {
		roomTypeGroups,
	};
}

async function getRoomTypeGroup({ blockId, roomTypeGroupId }) {
	const roomTypeGroup = await models.RoomTypeGroup.findOne({ _id: roomTypeGroupId, blockId, deleted: false })
		.populate('createdBy', 'username name')
		.lean();

	if (!roomTypeGroup) {
		throw new ThrowReturn().status(404);
	}

	return {
		roomTypeGroup,
	};
}

async function createRoomTypeGroup({ user, blockId, data }) {
	const roomTypeGroup = await models.RoomTypeGroup.create({ ...data, createdBy: user._id, blockId });

	return {
		roomTypeGroup,
	};
}

async function updateRoomTypeGroup({ roomTypeGroupId, blockId, data }) {
	const roomTypeGroup = await models.RoomTypeGroup.findOne({ _id: roomTypeGroupId, blockId, deleted: false });

	if (!roomTypeGroup) {
		throw new ThrowReturn().status(404);
	}

	_.assign(roomTypeGroup, data);
	await roomTypeGroup.save();

	return {
		roomTypeGroup,
	};
}

async function deleteRoomTypeGroup({ user, roomTypeGroupId, blockId }) {
	const roomTypeGroup = await models.RoomTypeGroup.findOne({ _id: roomTypeGroupId, blockId, deleted: false });

	if (!roomTypeGroup) {
		throw new ThrowReturn().status(404);
	}

	if (roomTypeGroup.type === ROOM_GROUP_TYPES.VIRTUAL || roomTypeGroup.type === ROOM_GROUP_TYPES.DEFAULT) {
		throw new ThrowReturn().status(403);
	}

	roomTypeGroup.deletedBy = user._id;
	roomTypeGroup.deleted = true;
	await roomTypeGroup.save();

	await models.RoomType.updateMany({ roomTypeGroupId: roomTypeGroup._id }, { deleted: true, deletedBy: user._id });
}

async function getRoomTypes({ blockId, roomTypeGroupId, type }) {
	const filter = { blockId, deleted: false };

	if (roomTypeGroupId) {
		filter.roomTypeGroupId = roomTypeGroupId;
	} else {
		filter.type = [ROOM_GROUP_TYPES.DEFAULT, ROOM_GROUP_TYPES.VIRTUAL];
	}
	if (!_.isEmpty(type)) {
		filter.type = type;
	}

	const roomTypes = await models.RoomType.find(filter)
		.sort({ roomPoint: -1, createdAt: -1 })
		.populate('roomIds', 'info.name info.roomNo')
		.populate('createdBy', 'username name')
		.lean();

	return {
		roomTypes,
	};
}

async function getRoomType({ blockId, roomTypeId }) {
	const roomType = await models.RoomType.findOne({ _id: roomTypeId, blockId, deleted: false })
		.populate('roomIds', 'info.name info.roomNo')
		.populate('createdBy', 'username name')
		.lean();

	if (!roomType) {
		throw new ThrowReturn().status(404);
	}

	return {
		roomType,
	};
}

async function createRoomType({ user, blockId, data }) {
	const roomType = await models.RoomType.create({ ...data, createdBy: user._id, blockId });

	if (roomType.roomIds && roomType.roomIds.length) {
		await models.RoomType.updateMany(
			{
				_id: { $ne: roomType._id },
				roomTypeGroupId: roomType.roomTypeGroupId,
				roomIds: { $in: roomType.roomIds },
				type: { $ne: ROOM_GROUP_TYPES.VIRTUAL },
			},
			{
				$pullAll: {
					roomIds: roomType.roomIds,
				},
			}
		);
	}

	return {
		roomType,
	};
}

async function updateRoomType({ blockId, data, roomTypeId }) {
	const roomType = await models.RoomType.findOne({ _id: roomTypeId, blockId, deleted: false });

	if (!roomType) {
		throw new ThrowReturn().status(404);
	}

	if (roomType.type === ROOM_GROUP_TYPES.VIRTUAL) {
		throw new ThrowReturn().status(403);
	}

	_.assign(roomType, data);
	await roomType.save();

	if (data.roomIds) {
		await models.RoomType.updateMany(
			{
				_id: { $ne: roomType._id },
				roomTypeGroupId: roomType.roomTypeGroupId,
				roomIds: { $in: roomType.roomIds },
				type: { $ne: ROOM_GROUP_TYPES.VIRTUAL },
			},
			{
				$pullAll: {
					roomIds: roomType.roomIds,
				},
			}
		);
	}

	return {
		roomType,
	};
}

async function deleteRoomType({ user, blockId, roomTypeId }) {
	const roomType = await models.RoomType.findOne({ _id: roomTypeId, blockId, deleted: false });

	if (!roomType) {
		throw new ThrowReturn().status(404);
	}

	if (roomType.type === ROOM_GROUP_TYPES.VIRTUAL) {
		throw new ThrowReturn().status(403);
	}

	roomType.deletedBy = user._id;
	roomType.deleted = true;
	await roomType.save();
}

module.exports = {
	getRoomTypeGroups,
	getRoomTypeGroup,
	createRoomTypeGroup,
	updateRoomTypeGroup,
	deleteRoomTypeGroup,
	getRoomTypes,
	createRoomType,
	updateRoomType,
	deleteRoomType,
	getRoomType,
};

const _ = require('lodash');
const mongoose = require('mongoose');

const models = require('@models');
const { UserRoles } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');

function getParam(req, name) {
	const objId = req.params[name] || req.query[name] || req.body[name];

	if (objId && mongoose.Types.ObjectId.isValid(objId)) return mongoose.Types.ObjectId(objId);

	return null;
}

async function blockAccess(req, blockId) {
	const { user } = req.decoded;

	if (user.role === UserRoles.ADMIN) return;

	const access = await models.HostBlock.findOne({
		userId: user._id,
		blockId,
	});
	if (!access) {
		throw new ThrowReturn().status(403);
	}

	if (access.roomIds && access.roomIds.length) _.set(req, 'data.accessRoomIds', access.roomIds);
}

async function roomAccess(req, roomId, blockId) {
	const { user } = req.decoded;

	if (user.role === UserRoles.ADMIN) return;

	const access = await models.HostBlock.findOne({
		userId: user._id,
		blockId,
		$or: _.compact([
			{
				roomIds: { $exists: false },
			},
			{
				roomIds: [],
			},
			roomId && {
				roomIds: _.isArray(roomId) ? { $in: roomId } : roomId,
			},
		]),
	});
	if (!access) {
		throw new ThrowReturn().status(403);
	}

	if (access.roomIds && access.roomIds.length) _.set(req, 'data.accessRoomIds', access.roomIds);
}

async function checkBlockId(req) {
	const blockId = getParam(req, 'blockId');
	if (blockId) {
		const block = await models.Block.findById(blockId);
		if (!block) throw new ThrowReturn().status(404);

		await blockAccess(req, block._id);

		_.set(req, 'logData.blockId', block._id);
		_.set(req, 'data.block', block);
	}
}

async function checkRoomId(req) {
	const roomId = getParam(req, 'roomId');
	if (roomId) {
		const room = await models.Room.findById(roomId);
		if (!room) throw new ThrowReturn().status(404);

		await roomAccess(req, room._id, room.blockId);

		_.set(req, 'logData.blockId', room.blockId);
		_.set(req, 'data.room', room);
	}
}

async function checkListingId(req) {
	const listingId = getParam(req, 'listingId');
	if (listingId) {
		const listing = await models.Listing.findById(listingId);
		if (!listing) throw new ThrowReturn().status(404);

		await roomAccess(req, listing.roomIds, listing.blockId);

		_.set(req, 'logData.blockId', listing.blockId);
		_.set(req, 'data.listing', listing);
	}
}

async function checkBookingId(req) {
	const bookingId = getParam(req, 'bookingId');
	if (bookingId) {
		const booking = await models.Booking.findById(bookingId);
		if (!booking) throw new ThrowReturn().status(404);

		await roomAccess(req, booking.reservateRooms, booking.blockId);

		_.set(req, 'logData.blockId', booking.blockId);
		_.set(req, 'data.booking', booking);
	}
}

async function checkMessageId(req) {
	const messageId = getParam(req, 'messageId');
	if (messageId) {
		const message = await models.Messages.findById(messageId);
		if (!message) throw new ThrowReturn().status(404);

		const inbox = await models.BlockInbox.findOne({ messageId });
		if (!inbox) throw new ThrowReturn().status(404);

		_.set(req, 'data.message', message);
		_.set(req, 'data.inbox', inbox);

		const blockId = inbox.blockId || message.blockId;
		if (blockId) {
			_.set(req, 'logData.blockId', blockId);
		}
	}
}

async function checkUserId(req) {
	const userId = getParam(req, 'userId');
	if (userId) {
		const { user } = req.decoded;
		const roles = await models.RoleGroup.getUnderRoles({ roleName: user.role });
		const currentUser = await models.User.findOne({
			_id: userId,
			role: { $in: roles },
			groupIds: { $in: user.groupIds },
		});
		if (!currentUser) throw new ThrowReturn().status(403);

		_.set(req, 'data.user', currentUser);
	}
}

function hostRestriction(req, res, next) {
	if (!_.get(req.decoded, 'user')) {
		return next();
	}

	return checkBlockId(req)
		.then(() => checkRoomId(req))
		.then(() => checkListingId(req))
		.then(() => checkBookingId(req))
		.then(() => checkMessageId(req))
		.then(() => checkUserId(req))
		.then(() => next());
}

module.exports = {
	hostRestriction,
};

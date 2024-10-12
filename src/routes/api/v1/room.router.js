const _ = require('lodash');

const router = require('@core/router').Router();
const models = require('@models');
const Listing = require('@controllers/block/listing');
const Block = require('@controllers/block');
const History = require('@controllers/block/history');
const Layout = require('@controllers/block/layout');
const GuestConfig = require('@controllers/block/guest');
const Lock = require('@controllers/lock');
const BlockConfig = require('@controllers/block/config');
const RoomType = require('@controllers/block/roomType');
const listingController = require('@controllers/client/listing');
const staticContent = require('@controllers/block/staticContent');

async function listOTA(req, res) {
	let [data, group] = await Promise.all([
		models.BookingSource.find({ active: { $ne: false } })
			.sort({ order: -1, name: 1 })
			.lean(),
		models.BookingSourceGroup.find({ active: { $ne: false } })
			.sort({ order: -1 })
			.lean(),
	]);

	res.sendData({ data, group });
}

async function listBlocks(req, res) {
	const data = await Block.getBlocks(req.decoded.user, req.query);
	res.sendData(data);
}

async function getRoom(req, res) {
	const { room } = req.data;

	await models.Room.populate(room, ['roomIds']);

	res.sendData({ room });
}

async function createBlock(req, res) {
	const data = await Block.createBlock(req.decoded.user, req.body);

	if (data && data.block) {
		_.set(req, ['logData', 'blockId'], data.block._id);
	}

	res.sendData(data);
}

async function getBlock(req, res) {
	const { block, accessRoomIds } = req.data;
	const data = await Block.getBlock({ block, accessRoomIds });
	res.sendData(data);
}

async function updateBlock(req, res) {
	const data = await Block.updateBlock(req.data.block, req.body);
	res.sendData(data);
}

async function createRooms(req, res) {
	const data = await Block.createRooms(req.params.roomId, req.body);
	res.sendData(data);
}

async function updateRoom(req, res) {
	const data = await Block.updateRoom(req.params.roomId, req.body);
	res.sendData(data);
}

async function getStats(req, res) {
	const data = await Block.getStats(req.decoded.user, req.query);
	res.sendData(data);
}

async function getListLocations(req, res) {
	const results = await models.Block.find({
		isTest: false,
		active: true,
		isProperty: true,
		visibleOnWebsite: { $ne: false },
		'listingIds.0': { $exists: true },
	})
		.select('info.name info.address info.location.coordinates info.blog info.url OTAProperties virtualRoomId')
		.sort({ createdAt: -1 })
		.populate('virtualRoomId', 'info.images')
		.then(rs =>
			rs.map(block => {
				block.OTAProperties = block.OTAProperties.filter(o => o.url);
				return block;
			})
		);

	res.sendData(results);
}

async function changeRoomParent(req, res) {
	const data = await Block.changeRoomParent(req.params.roomId, req.body);
	res.sendData(data);
}

async function changeLockCode(req, res) {
	const data = await Lock.changeLockCode(req.params.roomId, req.body);
	res.sendData(data);
}

async function getLockAccessLogs(req, res) {
	const data = await Lock.getLockLogs(req.query, req.decoded.user);
	res.sendData(data);
}

async function getAccessLogHistory(req, res) {
	const data = await Lock.getAccessLogHistory(req.query, req.decoded.user);
	res.sendData(data);
}

async function getHistories(req, res) {
	const data = await History.getHistories(req.decoded.user, { ...req.query, ...req.params });
	res.sendData(data);
}

async function createHistory(req, res) {
	const data = await History.createHistory(req.decoded.user, { ...req.body, ...req.params });
	res.sendData(data);
}

async function updateHistory(req, res) {
	const data = await History.updateHistory(req.params.id, { ...req.body, ...req.params });
	res.sendData(data);
}

async function deleteHistory(req, res) {
	const data = await History.deleteHistory(req.params.id, req.decoded.user);
	res.sendData(data);
}

async function getBlockLayout(req, res) {
	const data = await Layout.getLayout(req.params.blockId, req.decoded.user);
	res.sendData(data);
}

async function updateBlockLayout(req, res) {
	const data = await Layout.updateLayout(req.params.blockId, req.body, req.decoded.user);
	res.sendData(data);
}

async function syncBlockLayout(req, res) {
	const data = await Layout.syncLayout(req.decoded.user, req.data.block, req.body);
	res.sendData(data);
}

async function getRooms(req, res) {
	const data = await Block.getRooms(req.data, req.query);
	res.sendData(data);
}

async function getRoomsAvailable(req, res) {
	const data = await Block.getAvailableRooms(req.params.blockId, req.query);

	res.sendData(data);
}

async function filterRoomsLayout(req, res) {
	const data = await Block.filterRoomsLayout(req, req.query);
	res.sendData(data);
}

async function getLocks(req, res) {
	const data = await Lock.getLocks(req.query);
	res.sendData(data);
}

async function createLock(req, res) {
	const data = await Lock.createLock(req.body, req.decoded.user);
	res.sendData(data);
}

async function updateLock(req, res) {
	const data = await Lock.updateLock(req.params.id, req.body, req.decoded.user);
	res.sendData(data);
}

async function deleteLock(req, res) {
	const data = await Lock.deleteLock(req.params.id, req.decoded.user);
	res.sendData(data);
}

async function getDeviceLocks(req, res) {
	const data = await Lock.getDeviceLocks(req.query, req.decoded.user);
	res.sendData(data);
}

async function getHomeLocks(req, res) {
	const data = await Lock.getHomes(req.query, req.decoded.user);
	res.sendData(data);
}

async function syncHomeLockPasswords(req, res) {
	await Lock.syncTempPasswords(req.params.id);
	res.sendData();
}

async function getCheckListCategories(req, res) {
	const { blockId, taskCategoryId } = req.params;
	const checkListCategories = await BlockConfig.getCheckListCategories(blockId, taskCategoryId);
	res.sendData(checkListCategories);
}

async function addCheckListCategoryToBlock(req, res) {
	const { blockId, taskCategoryId, checkListCategoryId } = req.params;
	await BlockConfig.addCheckItemCategory(blockId, taskCategoryId, checkListCategoryId);
	res.sendData();
}

async function removeCheckListCategoryFromBlock(req, res) {
	const { blockId, taskCategoryId, checkListCategoryId } = req.params;
	await BlockConfig.removeCheckItemCategory(blockId, taskCategoryId, checkListCategoryId);
	res.sendData();
}

async function sortCheckListCategories(req, res) {
	const { blockId, taskCategoryId } = req.params;
	const { order } = req.body;
	await BlockConfig.sortCheckListCategories(blockId, taskCategoryId, order);
	res.sendData();
}

async function getBlockConfig(req, res) {
	const blockConfig = await BlockConfig.get(req.params.blockId);
	res.sendData(blockConfig);
}

async function addTaskCategoryToBlock(req, res) {
	const { blockId, taskCategoryId } = req.params;
	await BlockConfig.addTaskCategory(blockId, taskCategoryId);
	res.sendData();
}

async function getRoomTypeGroups(req, res) {
	const data = await RoomType.getRoomTypeGroups({
		user: req.decoded.user,
		blockId: req.params.blockId,
	});

	res.sendData(data);
}

async function getRoomTypeGroup(req, res) {
	const data = await RoomType.getRoomTypeGroup({
		user: req.decoded.user,
		roomTypeGroupId: req.params.roomTypeGroupId,
		blockId: req.params.blockId,
	});

	res.sendData(data);
}

async function createRoomTypeGroup(req, res) {
	const data = await RoomType.createRoomTypeGroup({
		user: req.decoded.user,
		blockId: req.params.blockId,
		data: req.body,
	});

	res.sendData(data);
}

async function updateRoomTypeGroup(req, res) {
	const data = await RoomType.updateRoomTypeGroup({
		user: req.decoded.user,
		blockId: req.params.blockId,
		roomTypeGroupId: req.params.roomTypeGroupId,
		data: req.body,
	});

	res.sendData(data);
}

async function deleteRoomTypeGroup(req, res) {
	const data = await RoomType.deleteRoomTypeGroup({
		user: req.decoded.user,
		blockId: req.params.blockId,
		roomTypeGroupId: req.params.roomTypeGroupId,
	});

	res.sendData(data);
}

async function getRoomTypes(req, res) {
	const data = await RoomType.getRoomTypes({
		...req.query,
		user: req.decoded.user,
		blockId: req.params.blockId,
	});

	res.sendData(data);
}

async function getRoomType(req, res) {
	const data = await RoomType.getRoomType({
		user: req.decoded.user,
		blockId: req.params.blockId,
		roomTypeId: req.params.roomTypeId,
	});

	res.sendData(data);
}

async function createRoomType(req, res) {
	const data = await RoomType.createRoomType({
		user: req.decoded.user,
		blockId: req.params.blockId,
		data: req.body,
	});

	res.sendData(data);
}

async function updateRoomType(req, res) {
	const data = await RoomType.updateRoomType({
		user: req.decoded.user,
		blockId: req.params.blockId,
		data: req.body,
		roomTypeId: req.params.roomTypeId,
	});

	res.sendData(data);
}

async function deleteRoomType(req, res) {
	const data = await RoomType.deleteRoomType({
		user: req.decoded.user,
		blockId: req.params.blockId,
		roomTypeId: req.params.roomTypeId,
	});

	res.sendData(data);
}

async function getCMListings(req, res) {
	const data = await listingController.getCMSellingListings(req.query, req.decoded.user);

	res.sendData(data);
}

async function syncPropertyContent(req, res) {
	const data = await staticContent.syncPropertiesContent(req.query, req.decoded.user);

	res.sendData(data);
}

router.getS('/listOTA', listOTA, true);
router.getS('/pages', listBlocks, true);

router.postS('/block', createBlock, true);
router.getS('/block/locations', getListLocations, false);
router.putS('/block/:blockId', updateBlock, true);
router.getS('/block/:blockId', getBlock, true);
router.getS('/block/:blockId/rooms', getRooms, true);

router.getS('/block/:blockId/config', getBlockConfig, true);

router.putS('/block/:blockId/task-category/:taskCategoryId', addTaskCategoryToBlock, true);

router.getS('/block/:blockId/task-category/:taskCategoryId/check-list-category', getCheckListCategories, true);
router.putS('/block/:blockId/task-category/:taskCategoryId/check-list-category/order', sortCheckListCategories, true);
router.putS(
	'/block/:blockId/task-category/:taskCategoryId/check-list-category/:checkListCategoryId',
	addCheckListCategoryToBlock,
	true
);
router.deleteS(
	'/block/:blockId/task-category/:taskCategoryId/check-list-category/:checkListCategoryId',
	removeCheckListCategoryFromBlock,
	true
);

router.getS('/block/:blockId/history', getHistories, true);
router.postS('/block/:blockId/history', createHistory, true);
router.putS('/block/:blockId/history/:id', updateHistory, true);
router.deleteS('/block/:blockId/history/:id', deleteHistory, true);

router.getS('/block/:blockId/guest/register', GuestConfig.getRegisterConfigs, true);
router.postS('/block/:blockId/guest/register', GuestConfig.createRegisterConfig, true);
router.putS('/block/:blockId/guest/register/:id', GuestConfig.updateRegisterConfig, true);
router.deleteS('/block/:blockId/guest/register/:id', GuestConfig.deleteRegisterConfig, true);

router.getS('/block/:blockId/layout', getBlockLayout, true);
router.postS('/block/:blockId/layout', updateBlockLayout, true);
router.postS('/block/:blockId/layout/sync', syncBlockLayout, true);

router.getS('/block/:blockId/filterRoomsLayout', filterRoomsLayout, true);
router.getS('/block/:blockId/available', getRoomsAvailable);

router.getS('/block/:blockId/roomTypeGroup', getRoomTypeGroups);
router.getS('/block/:blockId/roomTypeGroup/:roomTypeGroupId', getRoomTypeGroup);
router.postS('/block/:blockId/roomTypeGroup', createRoomTypeGroup);
router.putS('/block/:blockId/roomTypeGroup/:roomTypeGroupId', updateRoomTypeGroup);
router.deleteS('/block/:blockId/roomTypeGroup/:roomTypeGroupId', deleteRoomTypeGroup);

router.getS('/block/:blockId/roomType', getRoomTypes);
router.getS('/block/:blockId/roomType/:roomTypeId', getRoomType);
router.postS('/block/:blockId/roomType', createRoomType);
router.putS('/block/:blockId/roomType/:roomTypeId', updateRoomType);
router.deleteS('/block/:blockId/roomType/:roomTypeId', deleteRoomType);

router.getS('/listing/sales', getCMListings);

router.getS('/listings', Listing.getListings, true);
router.getS('/listing/:listingId/:otaName', Listing.getListing, true);
router.postS('/listing', Listing.createListing, true);
router.putS('/listing/:listingId', Listing.updateListing, true);
router.postS('/listing/:listingId/:otaName/fetch', Listing.fetchListingInfo, true);
router.postS('/listing/:listingId/sync', Listing.syncListing, true);

router.getS('/stats', getStats, true);

router.getS('/lock/accessLogs', getLockAccessLogs);
router.getS('/lock/accessLogHistory', getAccessLogHistory);
router.getS('/lock', getLocks);
router.getS('/lock/device', getDeviceLocks);
router.getS('/lock/home', getHomeLocks);
router.postS('/lock', createLock);
router.putS('/lock/:id', updateLock);
router.deleteS('/lock/:id', deleteLock);
router.postS('/lock/:id/sync-passwords', syncHomeLockPasswords);

router.postS('/propertyContent/sync', syncPropertyContent);

router.postS('/:roomId', createRooms, true);
router.putS('/:roomId', updateRoom, true);
router.getS('/:roomId', getRoom, true);
router.postS('/:roomId/changeParent', changeRoomParent, true);
router.postS('/:roomId/changeLockCode', changeLockCode, true);
// router.postS('/:roomId/roomLock', RoomLock.createCommand, true);

const activity = {
	BLOCK_CREATE: {
		key: '/block',
		exact: true,
	},
	BLOCK_UPDATE: {
		key: '/block',
		method: 'PUT',
		exact: true,
	},
	BLOCK_HISTORY_CREATE: {
		key: '/block/{id}/history',
		exact: true,
	},
	BLOCK_HISTORY_UPDATE: {
		key: '/block/{id}/history/{id}',
		method: 'PUT',
		exact: true,
	},
	BLOCK_HISTORY_DELETE: {
		key: '/block/{id}/history/{id}',
		method: 'DELETE',
		exact: true,
	},
	LISTING_CREATE: {
		key: '/listing',
		exact: true,
	},
	LISTING_UPDATE: {
		key: '/listing/{id}',
		method: 'PUT',
		exact: true,
	},
	LISTING_DELETE: {
		key: '/listing',
		method: 'DELETE',
	},
	ROOM_SET_DOOR_CODE: {
		key: '/door/accessCode',
		exact: true,
	},
	ROOM_LOCK_CREATE: {
		key: '/lock',
		exact: true,
	},
	ROOM_LOCK_UPDATE: {
		key: '/lock/{id}',
		exact: true,
		method: 'PUT',
	},
	ROOM_LOCK_DELETE: {
		key: '/lock/{id}',
		exact: true,
		method: 'DELETE',
	},
	ROOM_CREATE: {
		key: '/{id}',
		exact: true,
	},
	ROOM_UPDATE: {
		key: '/{id}',
		method: 'PUT',
		exact: true,
	},
	ROOM_UPDATE_PARENT: {
		key: '/{id}/changeParent',
		exact: true,
	},
	ROOM_CHANGE_DOOR_CODE: {
		key: '/{id}/changeLockCode',
		exact: true,
	},
	CONFIG_ADD_TASK_CATEGORY: {
		key: '/block/{id}/task-category/{id}',
		method: 'PUT',
	},
	CONFIG_ADD_CHECK_LIST_CATEGORY: {
		key: '/block/{id}/task-category/{id}/check-list-category/{id}',
		method: 'PUT',
	},
	CONFIG_REMOVE_CHECK_LIST_CATEGORY: {
		key: '/block/{id}/task-category/{id}/check-list-category/{id}',
		method: 'DELETE',
	},
};

module.exports = { router, activity };

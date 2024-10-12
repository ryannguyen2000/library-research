const mongosee = require('mongoose');
const _ = require('lodash');

const { normPhone } = require('@utils/phone');

const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

async function updateHost(req, res) {
	const { hostId } = req.params;
	if (!mongosee.Types.ObjectId.isValid(hostId)) {
		throw new ThrowReturn(`Id ${hostId} is invalid!`);
	}

	const data = _.omit(req.body, ['score', 'cash', 'level', 'role', 'username', 'password', 'enable']);

	const host = await models.Host.findByIdAndUpdate(hostId, data, {
		new: true,
		runValidators: true,
	}).then(h => h.toObject());

	if (!host) {
		throw new ThrowReturn(`Not found User!`);
	}

	data.phone = normPhone(data.phone);

	const user = await models.User.findByIdAndUpdate(hostId, data, {
		new: true,
		runValidators: true,
	}).then(h => h.toObject());

	_.assign(host, user);

	res.sendData({ host: _.pick(host, _.keys(data)) });
}

async function getHost(req, res) {
	const { hostId } = req.params;

	let host = await models.Host.findById(hostId).populate('hosting', 'info');

	if (!host) {
		throw new ThrowReturn('Not found user!');
	}

	host = host.toObject();

	const user = await models.User.findById(host._id)
		.select('-password -revokeKey')
		.populate('managerId', 'name username')
		.then(u => u.toObject());

	Object.assign(host, user);

	const blocks = await models.HostBlock.find({ userId: hostId })
		.select('blockId roomIds createdAt')
		.populate('blockId', 'info.name info.address')
		.populate('roomIds', 'info.roomNo info.name');

	res.sendData({ host, blocks });
}

async function addHostBlock(req, res) {
	const { hostId } = req.params;
	const { blocks } = req.body;

	const host = await models.Host.findById(hostId);
	if (!host) throw new ThrowReturn('Not found user!');

	const rs = await models.HostBlock.addBlocksToUsers(blocks, [host._id], req.decoded.user);

	res.sendData({ blocks: rs });
}

async function removeHostBlock(req, res) {
	const { hostId } = req.params;
	const { blocks } = req.body;

	const host = await models.Host.findById(hostId);
	if (!host) throw new ThrowReturn('Not found user!');

	const rs = await models.HostBlock.removeBlocksFromUsers(blocks, [host._id]);

	res.sendData({ deletedCount: rs.deletedCount });
}

async function updateHostRoom(req, res) {
	const { hostId, blockId } = req.params;

	const host = await models.Host.findById(hostId);
	if (!host) throw new ThrowReturn('Not found user!');

	const hostBlock = await models.HostBlock.findOne({
		userId: hostId,
		blockId,
	});
	if (!hostBlock) throw new ThrowReturn(`This user do not have permission to access this house!`);

	hostBlock.roomIds = req.body.roomIds;
	await hostBlock.save();

	res.sendData(_.pick(hostBlock, 'roomIds'));
}

router.getS('/:hostId', getHost);
router.putS('/:hostId', updateHost);

router.postS('/:hostId/block', addHostBlock);
router.deleteS('/:hostId/block', removeHostBlock);
router.putS('/:hostId/block/:blockId', updateHostRoom);

const activity = {
	ACCOUNT_UPDATE: {
		key: '/{id}',
		exact: true,
		method: 'PUT',
	},
	ACCOUNT_HOUSE_UPDATE: {
		key: '/{id}/block',
		exact: true,
		method: 'POST',
	},
	ACCOUNT_HOUSE_REMOVE: {
		key: '/{id}/block',
		exact: true,
		method: 'DELETE',
	},
	ACCOUNT_ROOM_UPDATE: {
		key: '/{id}/block/{id}',
		exact: true,
		method: 'PUT',
	},
};

module.exports = { router, activity };

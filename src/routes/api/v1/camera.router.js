const _ = require('lodash');

const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

async function getCameras(req, res) {
	const { blockIds } = await models.Host.getBlocksOfUser({
		user: req.decoded.user,
		filterBlockIds: req.query.blockId,
	});

	const data = await models.Camera.find({ blockId: { $in: blockIds } }).populate('blockId', 'info.name');

	res.sendData({ data });
}

async function createCamera(req, res) {
	const data = req.body;
	data.userId = req.decoded.user._id;

	const doc = await models.Camera.create(data);

	res.sendData(doc);
}

async function updateCamera(req, res) {
	const { id } = req.params;
	const data = req.body;
	delete data.userId;

	const doc = await models.Camera.findById(id);
	if (!doc) throw new ThrowReturn('Camera not found!');

	Object.assign(doc, data);
	await doc.save();

	res.sendData();
}

async function deleteCamera(req, res) {
	const { id } = req.params;
	await models.Camera.deleteOne({ _id: id });

	res.sendData();
}

router.getS('/', getCameras, true);
router.postS('/', createCamera, true);
router.putS('/:id', updateCamera, true);
router.deleteS('/:id', deleteCamera, true);

module.exports = { router };

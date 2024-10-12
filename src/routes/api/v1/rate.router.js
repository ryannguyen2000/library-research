const router = require('@core/router').Router();
const controller = require('@controllers/rate/rate.controller');

async function getRoomTypeRates(req, res) {
	const data = await controller.roomTypeRates(req.query);
	res.sendData(data);
}

async function syncRates(req, res) {
	const data = await controller.syncRates(req.query);
	res.sendData(data);
}

router.getS('/', controller.get);
router.getS('/roomTypeRates', getRoomTypeRates);
router.postS('/', controller.create);
router.putS('/:id', controller.update);
router.deleteS('/:rateId', controller.deleteRate);
router.postS('/link', controller.linkToListing);
router.postS('/syncRates', syncRates);

module.exports = { router };

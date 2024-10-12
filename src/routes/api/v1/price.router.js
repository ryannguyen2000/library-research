// const _ = require('lodash');
const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const Price = require('@controllers/pricing');
const PriceAuto = require('@controllers/pricing/newAuto');
const PriceCalendar = require('@controllers/pricing/calendar');

async function setRoomsPrice(req, res) {
	await Price.setRoomsPrice(req.body, req.decoded.user);

	res.sendData();
}

async function deleteRoomsPrice(req, res) {
	const { priceId } = req.params;

	const doc = await models.PriceHistory.findById(priceId);
	if (!doc) {
		throw new ThrowReturn('Price not found!');
	}

	if (!doc.timeStart || doc.timeStart <= new Date()) {
		throw new ThrowReturn('Price was set!');
	}

	await models.PriceHistory.deleteOne({ _id: priceId });
	await models.JobPricing.deleteMany({ priceId });

	res.sendData();
}

async function getBookingPrice(req, res) {
	const { blockId, roomId } = req.params;
	const { from, to } = req.query;

	const results = await Price.getBookingPrice(blockId, roomId, new Date(from), new Date(to));

	res.sendData(results);
}

async function history(req, res) {
	const data = await Price.history({ ...req.query, ...req.params });

	res.sendData(data);
}

async function setBulkPrice(req, res) {
	await Price.bulkUpdatePrice(req.body, req.decoded.user);

	res.sendData();
}

async function getAutoPrices(req, res) {
	const data = await PriceAuto.getAutos({ ...req.query });

	res.sendData(data);
}

async function getAutoPrice(req, res) {
	const data = await PriceAuto.getAuto(req.params.id);

	res.sendData(data);
}

async function createAutoPrice(req, res) {
	const data = await PriceAuto.createAuto(req.body, req.decoded.user);

	res.sendData(data);
}

async function updateAutoPrice(req, res) {
	const data = await PriceAuto.updateAuto(req.params.id, req.body, req.decoded.user);

	res.sendData(data);
}

async function deleteAutoPrice(req, res) {
	const data = await PriceAuto.deleteAuto(req.params.id, req.decoded.user);

	res.sendData(data);
}

async function getCalendar(req, res) {
	const calendar = await PriceCalendar.getCalendar({
		...req.params,
		...req.query,
	});
	res.sendData(calendar);
}

async function getCalendarHistory(req, res) {
	const calendar = await PriceCalendar.getCalendarHistory({
		...req.params,
		...req.query,
	});
	res.sendData(calendar);
}

async function getOccupancyPrice(req, res) {
	const data = await Price.getOccupancyPrice(req.query, req.decoded.user);

	res.sendData(data);
}

async function setOccupancyPrice(req, res) {
	const data = await Price.setOccupancyPrice(req.body, req.decoded.user);

	res.sendData(data);
}

async function syncLocalPromotion(req, res) {
	const data = await Price.syncLocalPromotionPrice(req.query);

	res.sendData(data);
}

router.getS('/autoPrice', getAutoPrices, true);
router.getS('/autoPrice/:id', getAutoPrice, true);
router.postS('/autoPrice', createAutoPrice, true);
router.putS('/autoPrice/:id', updateAutoPrice, true);
router.deleteS('/autoPrice/:id', deleteAutoPrice, true);

router.getS('/:blockId/history', history, true);
router.getS('/:blockId/calendar', getCalendar, true);
router.getS('/:blockId/calendarHistory', getCalendarHistory, true);

router.getS('/:blockId/:roomId/bookingPrice', getBookingPrice, true);

router.postS('/', setRoomsPrice, true);
router.deleteS('/:priceId', deleteRoomsPrice, true);
router.postS('/bulkUpdate', setBulkPrice, true);

router.getS('/occupancyPrice', getOccupancyPrice);
router.postS('/occupancyPrice', setOccupancyPrice);

router.postS('/syncLocalPromotion', syncLocalPromotion);

const activity = {
	PRICE_UPDATE: {
		key: '/',
		exact: true,
	},
	PRICE_DELETE: {
		key: '/{id}',
		exact: true,
		method: 'DELETE',
	},
	PRICE_AUTO_CREATE: {
		key: '/autoPrice',
		exact: true,
	},
	PRICE_AUTO_UPDATE: {
		key: '/autoPrice/{id}',
		exact: true,
		method: 'PUT',
	},
	PRICE_AUTO_DELETE: {
		key: '/autoPrice/{id}',
		exact: true,
		method: 'DELETE',
	},
	PRICE_BULK_UPDATE: {
		key: '/bulkUpdate',
	},
	PRICE_OCCUPANCY_UPDATE: {
		key: '/occupancyPrice',
	},
};

module.exports = { router, activity };

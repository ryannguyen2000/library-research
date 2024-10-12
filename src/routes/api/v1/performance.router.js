const router = require('@core/router').Router();
const stats = require('@controllers/performance/stats');
const ota = require('@controllers/performance/ota');
const revenue = require('@controllers/performance/revenue');
const Review = require('@controllers/review');
const Accelerator = require('@controllers/performance/accelerator');

async function getOTAPerformance(req, res) {
	const data = await stats.getStatsPerformance(req.query, req.decoded.user);
	res.sendData(data);
}

async function fetchOTAPerformance(req, res) {
	await ota.fetchPerformance();
	res.sendData();
}

async function getStats(req, res) {
	const data = await ota.getPerformance(req.query);
	res.sendData(data);
}

async function getRevenues(req, res) {
	const data = await revenue.getRevenues(req.query, req.decoded.user);
	res.sendData(data);
}

async function getOverview(req, res) {
	const [avgRating, otaRevenueStats, occupancyRate] = await Promise.all([
		Review.getRatingAvg(req.query, req.decoded.user),
		stats.getStatsPerformance({ ...req.query, type: 'OtaOverview' }, req.decoded.user),
		stats.getStatsPerformance({ ...req.query, type: 'occupancyRate' }, req.decoded.user),
	]);

	res.sendData({ otaRevenueStats, avgRating, occupancyRate });
}

async function getAccelerators(req, res) {
	const data = await Accelerator.getAccelerators(req.query);

	res.sendData(data);
}

async function createAccelerator(req, res) {
	const data = await Accelerator.createAccelerator(req.decoded.user, req.body);

	res.sendData(data);
}

async function updateAccelerator(req, res) {
	const data = await Accelerator.updateAccelerator(req.decoded.user, req.params.id, req.body);

	res.sendData(data);
}

async function deleteAccelerator(req, res) {
	const data = await Accelerator.deleteAccelerator(req.decoded.user, req.params.id);

	res.sendData(data);
}

router.getS('/', getOTAPerformance);
router.postS('/fetch', fetchOTAPerformance);
router.getS('/stats', getStats);
router.getS('/stats/revenue', getRevenues);
router.getS('/stats/overview', getOverview);

router.getS('/accelerators', getAccelerators);
router.postS('/accelerators', createAccelerator);
router.putS('/accelerators/:id', updateAccelerator);
router.deleteS('/accelerators/:id', deleteAccelerator);

const activity = {
	ACCELERATOR_CREATE: {
		key: '/accelerators',
		method: 'POST',
	},
	ACCELERATOR_UPDATE: {
		key: '/accelerators/{id}',
		exact: true,
		method: 'PUT',
	},
	ACCELERATOR_DELETE: {
		key: '/accelerators/{id}',
		exact: true,
		method: 'DELETE',
	},
};

module.exports = { router, activity };

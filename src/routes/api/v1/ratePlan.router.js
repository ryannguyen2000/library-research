const router = require('@core/router').Router();
const RatePlan = require('@controllers/rate/ratePlan');

async function getRatePlans(req, res) {
	const data = await RatePlan.getRatePlans(req.decoded.user, req.query);
	res.sendData(data);
}

async function createRatePlan(req, res) {
	const data = await RatePlan.createRatePlan(req.decoded.user, req.body);
	res.sendData(data);
}

async function updateRatePlan(req, res) {
	const data = await RatePlan.updateRatePlan(req.decoded.user, req.params.ratePlanId, req.body);
	res.sendData(data);
}

async function deleteRatePlan(req, res) {
	const data = await RatePlan.deleteRatePlan(req.decoded.user, req.params.ratePlanId);
	res.sendData(data);
}

async function getPolicies(req, res) {
	const data = await RatePlan.getPolicies(req.decoded.user, req.query);
	res.sendData(data);
}

async function createPolicy(req, res) {
	const data = await RatePlan.createPolicy(req.decoded.user, req.body);
	res.sendData(data);
}

async function updatePolicy(req, res) {
	const data = await RatePlan.updatePolicy(req.decoded.user, req.params.policyId, req.body);
	res.sendData(data);
}

async function deletePolicy(req, res) {
	const data = await RatePlan.deletePolicy(req.decoded.user, req.params.policyId);
	res.sendData(data);
}

async function checkPrice(req, res) {
	const data = await RatePlan.checkPrice(req.decoded.user, req.query);
	res.sendData(data);
}

router.getS('/policy', getPolicies);
router.postS('/policy', createPolicy);
router.putS('/policy/:policyId', updatePolicy);
router.deleteS('/policy/:policyId', deletePolicy);

router.getS('/checkPrice', checkPrice);

router.getS('/', getRatePlans);
router.postS('/', createRatePlan);
router.putS('/:ratePlanId', updateRatePlan);
router.deleteS('/:ratePlanId', deleteRatePlan);

module.exports = { router };

const models = require('@models');
const KPIController = require('@controllers/kpi');

async function list(req, res) {
	const { start = 0, limit = 20, ...query } = req.query;
	const userId = req.decoded.user._id;

	const promise = models.KPIUser.find({ userId, ...query })
		.populate('userId', 'name username')
		.populate('kpiId')
		.sort({ $natural: -1 })
		.skip(parseInt(start))
		.limit(parseInt(limit));

	const data = await promise;
	const total = await models.KPI.countDocuments(query);

	const score = await models.Host.findById(userId).select('level cash score');

	res.sendData({ userKPIs: data, total, score });

	data.forEach(item => {
		KPIController.calcReview(item.kpiId._id, userId);
	});
}

async function create(req, res) {
	const KPIUser = await KPIController.create(req.body, req.decoded.user);
	res.sendData({ KPIUser });
}

async function view(req, res) {
	const { id } = req.params;
	const userId = req.decoded.user._id;

	const data = await KPIController.calcReview(id, userId);
	const KPIUser = await models.KPIUser.findById(id).populate('userId', 'username name').populate('kpiId');

	return res.sendData({ KPIUser, ...data });
}

async function del(req, res) {
	const { id } = req.params;

	const KPIUser = await models.KPIUser.findById(id).populate('userId', 'username name').populate('kpiId');

	return res.sendData({ KPIUser });
}

async function reward(req, res) {
	const { id } = req.params;
	const { nextKPI } = req.body;
	const { user } = req.decoded;

	const data = await KPIController.reward({ id, nextKPI, user });

	res.sendData(data);
}

module.exports = { view, list, create, del, reward };

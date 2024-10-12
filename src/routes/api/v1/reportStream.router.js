const router = require('@core/router').Router();

const Configs = require('@controllers/report/stream/config');
const ReportStream = require('@controllers/report/stream');

async function getConfig(req, res) {
	const data = await Configs.getConfig(req.query.blockId, req.decoded.user);

	res.sendData(data);
}

async function updateConfig(req, res) {
	const data = await Configs.updateConfig(req.body.blockId, req.body.revenueStreams, req.decoded.user);

	res.sendData(data);
}

async function getCategories(req, res) {
	const data = await Configs.getCategories(req.query, req.decoded.user);
	res.sendData(data);
}

async function getProjects(req, res) {
	const data = await Configs.getProjects(req.query, req.decoded.user);
	res.sendData(data);
}

async function getRevenuesStream(req, res) {
	const data = await ReportStream.getRevenueStream(req.query, req.decoded.user);
	res.sendData(data);
}

async function getExpensesStream(req, res) {
	const data = await ReportStream.getExpensesStream(req.query, req.decoded.user);
	res.sendData(data);
}

async function getIncomeStatement(req, res) {
	const data = await ReportStream.getIncomeStatement(req.query, req.decoded.user);
	res.sendData(data);
}

router.getS('/config', getConfig);
router.postS('/config', updateConfig);

router.getS('/category', getCategories);
router.getS('/project', getProjects);

router.getS('/revenueStream', getRevenuesStream);
router.getS('/expensesStream', getExpensesStream);
router.getS('/incomeStatement', getIncomeStatement);

const activity = {
	STREAM_REPORT_CONFIG: {
		key: '/config',
		exact: true,
		method: 'POST',
	},
};

module.exports = { router, activity };

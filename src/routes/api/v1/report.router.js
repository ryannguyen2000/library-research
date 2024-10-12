const moment = require('moment');

const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const { getArray } = require('@utils/query');
const { runWorker } = require('@workers/index');
const { REPORT_CALCULATOR } = require('@workers/const');
const operationReport = require('@controllers/report/api');

async function getReport(req, res) {
	const { blockId } = req.params;
	const { from, to, month, roomIds } = req.query;

	const data = await runWorker({
		type: REPORT_CALCULATOR,
		data: {
			blockId,
			from,
			to,
			month,
			roomIds: getArray(roomIds),
			userId: req.decoded.user._id.toString(),
			language: req.language,
		},
	}).catch(e => {
		console.log(e);
		throw new ThrowReturn(e);
	});

	res.sendData(data);
}

async function getReportV2(req, res) {
	const { blockId } = req.params;
	const { from, to, month, roomIds } = req.query;

	const data = await runWorker({
		type: REPORT_CALCULATOR,
		data: {
			blockId,
			from,
			to,
			month,
			roomIds: getArray(roomIds),
			userId: req.decoded.user._id.toString(),
			language: req.language,
			// version: 2,
		},
	}).catch(e => {
		throw new ThrowReturn(e);
	});

	res.sendData(data);
}

async function getPeriodToDate(req, res) {
	const { block } = req.data;
	const period = req.query.period || moment().format('YYYY-MM');

	const [from, to] = block.findDatesOfPeriod(period);

	res.sendData({
		period,
		from: from.toDateMysqlFormat(),
		to: to.toDateMysqlFormat(),
	});
}

async function exportOperationReport(req, res) {
	const { blockId, from, to, type, operationReportCategories } = req.body;
	const data = await operationReport.exportOperationReport({
		blockId,
		from,
		to,
		language: req.language,
		operationReportCategories,
		createdBy: req.decoded.user._id,
		type,
	});
	res.sendData(data);
}

async function getListOperationReport(req, res) {
	const data = await operationReport.getListOperationReport(req.decoded.user, req.query);
	res.sendData(data);
}

async function approveReport(req, res) {
	const { blockId, period, description } = req.body;

	const data = await operationReport.approveReport({
		blockId,
		period,
		description,
		user: req.decoded.user,
	});

	res.sendData(data);
}

async function requestToModifyReport(req, res) {
	const { blockId, period, description } = req.body;

	const data = await operationReport.requestToModifyReport({
		blockId,
		period,
		description,
		user: req.decoded.user,
	});

	res.sendData(data);
}

router.getS('/:blockId', getReport);
router.getS('/:blockId/v2', getReportV2);
router.getS('/:blockId/p2d', getPeriodToDate);

router.postS('/operation/export', exportOperationReport, true);
router.getS('/operation/list', getListOperationReport, true);
router.postS('/operation/approve', approveReport, true);
router.postS('/operation/requestModify', requestToModifyReport, true);

const activity = {
	OPERATION_REPORT_CREATE: {
		key: '/operation/export',
		method: 'POST',
		exact: true,
	},
	OPERATION_REPORT_APPROVED: {
		key: '/operation/approve',
		exact: true,
	},
	OPERATION_REPORT_REQUEST_TO_MODIFY: {
		key: '/operation/requestModify',
		exact: true,
	},
};

module.exports = { router, activity };

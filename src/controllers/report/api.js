const moment = require('moment');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { OperationReportStatus, OPERATION_REPORT_TYPE } = require('@utils/const');
const { SYS_EVENTS, sysEventEmitter } = require('@utils/events');
const models = require('@models');
const { OPERATION_REPORT_CATEGORIES } = require('./const');

async function exportOperationReport({
	blockId,
	from,
	to,
	period,
	createdBy,
	language = 'vi',
	type = OPERATION_REPORT_TYPE.REVENUE_REPORT,
	operationReportCategories,
}) {
	period = period || moment(from).format('Y-MM');

	if (!from) {
		const block = await models.Block.findById(blockId);
		[from, to] = block.findDatesOfPeriod(period);
	}

	const version = await models.OperationReport.countDocuments({
		blockId,
		period,
		type,
	});

	if (!operationReportCategories) {
		operationReportCategories = [
			OPERATION_REPORT_CATEGORIES.REVENUE_REPORT.key,
			OPERATION_REPORT_CATEGORIES.INVOICE.key,
		];
	}

	const operationReport = await models.OperationReport.create({
		period,
		createdBy,
		blockId,
		status: OperationReportStatus.IN_PROGRESS,
		from,
		to,
		language,
		version,
		type,
		operationReportCategories,
	});

	return operationReport;
}

async function getListOperationReport(user, { start, limit, blockId, period, status, from, to, checkInQueue }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;
	const query = { blockId };
	const select = checkInQueue ? 'blockId version period' : '-params -data';

	if (status) {
		query.status = status;
	}
	if (period) {
		query.period = period;
	}

	if (from && moment(from).isValid()) {
		_.set(query, 'createdAt.$gte', moment(from).startOf('date').toDate());
	}
	if (to && moment(to).isValid()) {
		_.set(query, 'createdAt.$lte', moment(to).endOf('date').toDate());
	}

	const [data, total] = await Promise.all([
		models.OperationReport.find(_.pickBy(query))
			.populate([
				{ path: 'resourceId', select: 'parent name' },
				{
					path: 'blockId',
					select: 'info.name info.shortName',
				},
				{
					path: 'createdBy',
					select: 'name username',
				},
			])
			.select(select)
			.skip(start)
			.limit(limit)
			.sort({ createdAt: -1 })
			.lean(),
		models.OperationReport.countDocuments(query),
	]);

	return { data, total };
}

async function approveReport({ blockId, period, description, user }) {
	const type = OPERATION_REPORT_TYPE.APPROVED_REPORT;

	const report = await models.OperationReport.findOne({
		blockId,
		period,
		type: { $in: [type, OPERATION_REPORT_TYPE.REQUEST_MODIFY_REPORT] },
	})
		.sort({
			createdAt: -1,
		})
		.select('type');

	if (report && report.type === type) {
		throw new ThrowReturn('Báo cáo đã được xác nhận trước đó!');
	}

	const version = await models.OperationReport.countDocuments({
		blockId,
		period,
		type,
	});

	const block = await models.Block.findById(blockId);
	const [from, to] = block.findDatesOfPeriod(period);

	const operationReport = await models.OperationReport.create({
		period,
		createdBy: user._id,
		blockId,
		version,
		type,
		description,
		from,
		to,
	});

	sysEventEmitter.emit(SYS_EVENTS.HOST_REPORT_APPROVED, operationReport);

	return operationReport;
}

async function requestToModifyReport({ blockId, period, description, user }) {
	const type = OPERATION_REPORT_TYPE.REQUEST_MODIFY_REPORT;

	const report = await models.OperationReport.findOne({
		blockId,
		period,
		type: { $in: [OPERATION_REPORT_TYPE.APPROVED_REPORT, type] },
	})
		.sort({ createdAt: -1 })
		.select('type');

	if (!report || report.type === type) {
		throw new ThrowReturn('Báo cáo đã được xác nhận trước đó!');
	}

	const version = await models.OperationReport.countDocuments({
		blockId,
		period,
		type,
	});

	if (!description) {
		throw new ThrowReturn('Vui lòng nhập mô tả chi tiết cho việc chỉnh sửa!');
	}

	const block = await models.Block.findById(blockId);
	const [from, to] = block.findDatesOfPeriod(period);

	const operationReport = await models.OperationReport.create({
		period,
		createdBy: user._id,
		blockId,
		status: OperationReportStatus.COMPLETED,
		version,
		type,
		description,
		from,
		to,
	});

	sysEventEmitter.emit(SYS_EVENTS.HOST_REPORT_MODIFIED, operationReport);

	return operationReport;
}

module.exports = { exportOperationReport, getListOperationReport, approveReport, requestToModifyReport };

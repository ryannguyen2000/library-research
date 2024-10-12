const moment = require('moment');
const schedule = require('node-schedule');

const { logger } = require('@utils/logger');
const { OperationReportStatus, OPERATION_REPORT_TYPE } = require('@utils/const');
const { saveOperationReport } = require('@src/controllers/report');

const models = require('@models');

const MAX_RETRY = 2;

let running = false;

async function runDownloadOperationReport() {
	if (running) {
		return;
	}

	running = true;

	const filter = {
		status: [OperationReportStatus.IN_PROGRESS, OperationReportStatus.ERROR],
		type: { $in: [OPERATION_REPORT_TYPE.OPERATION_REPORT, OPERATION_REPORT_TYPE.REVENUE_REPORT] },
		numRun: { $lt: MAX_RETRY },
	};

	const task = await models.OperationReport.findOne(filter)
		.sort({
			createdAt: 1,
		})
		.populate('blockId', 'info operationReportCategories')
		.populate('createdBy')
		.catch(() => null);

	if (!task) {
		running = false;
		return;
	}

	try {
		task.startTime = new Date();
		await task.save();

		logger.info('RUNNING EXPORT OPERATION', task._id);

		const params = {
			block: task.blockId,
			blockId: task.blockId._id,
			user: task.createdBy,
			userId: task.createdBy._id,
			from: moment(task.from).format('Y-MM-DD'),
			to: moment(task.to).format('Y-MM-DD'),
			language: task.language,
			task,
			period: task.period,
		};
		const { url, resourceId, name } = await saveOperationReport(params);

		task.url = url;
		task.name = name;
		task.resourceId = resourceId;
		task.numRun = (task.numRun || 0) + 1;
		task.endTime = new Date();
		task.status = OperationReportStatus.COMPLETED;

		logger.info('EXPORT REPORT DONE', task._id);
		await task.save().catch(err => {
			logger.error(err);
		});
		running = false;
	} catch (e) {
		logger.error('EXPORT REPORT ERROR', e);
		task.numRun = (task.numRun || 0) + 1;
		task.endTime = new Date();
		task.status = OperationReportStatus.ERROR;
		await task.save().catch(err => {
			logger.error(err);
		});
		running = false;
	}
}

schedule.scheduleJob(`*/2 * * * * *`, () => {
	runDownloadOperationReport().catch(err => {
		logger.error('runDownloadOperationReport', err);
	});
});

const schedule = require('node-schedule');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { OTAs, DefaultCommission } = require('@utils/const');
const models = require('@models');
const apis = require('@controllers/ota_api/accelerators');

const RUNNING_OTAS = {};
const RUNNING_IDS = {};
const MAX_RETRY_TASK = 4;
const MAX_RUN_TASK = 3;

let filtering = false;

function start(task) {
	const { ota } = task;

	RUNNING_OTAS[ota] = true;
	RUNNING_IDS[task._id] = true;
}

async function done(task, isDone) {
	task.done = isDone;
	task.numRun = isDone ? 0 : task.numRun + 1;
	await task.save().catch(e => {
		logger.error(e);
	});

	delete RUNNING_OTAS[task.ota];
	delete RUNNING_IDS[task._id];
}

async function runTask(task) {
	if (!apis[task.ota] || !apis[task.ota].syncAccelerator) {
		logger.warn('Not found module syncAccelerator', task.ota);
		return;
	}

	const accelerator = await models.Accelerator.findById(task.acceleratorId).populate('blockId', 'OTAProperties');

	const properties = _.uniqBy(
		accelerator.blockId.OTAProperties.filter(ota => ota.otaName === task.ota),
		'propertyId'
	);

	if (!properties.length) {
		logger.warn('Not found properties syncAccelerator', task._id);
		return;
	}

	const today = new Date().toDateMysqlFormat();
	task.from = _.max([today, task.from]);

	const commByDates = await models.Accelerator.getCommByDates({
		blockId: accelerator.blockId._id,
		ota: task.ota,
		from: task.from,
		to: task.to,
	});
	const defautlRelOTA = OTAs.Agoda;

	let relComm;

	if (accelerator.otas.includes(defautlRelOTA)) {
		const fixedOTA = accelerator.blockId.OTAProperties.find(ota => ota.otaName === defautlRelOTA);
		relComm = _.get(fixedOTA, 'commission') || DefaultCommission[defautlRelOTA];
	}

	await properties.asyncMap(async property => {
		const otaConfig = await models.OTAManager.findOne({
			active: true,
			name: task.ota,
			account: property.account,
		});

		const currentComm = _.get(property, 'commission') || DefaultCommission[task.ota];

		const meta = await apis[task.ota].syncAccelerator({
			otaConfig,
			property,
			accelerator,
			from: task.from,
			to: task.to,
			commByDates,
			relComm: relComm || currentComm,
			currentComm,
		});

		const dataOTA = _.find(task.dataOTAs, ota => ota.ota === task.ota && ota.propertyId === property.propertyId);
		if (dataOTA) {
			await models.Accelerator.updateOne(
				{ _id: accelerator._id },
				{ $set: { 'dataOTAs.$[elem].meta': meta } },
				{
					arrayFilters: [{ 'elem.ota': dataOTA.ota, 'elem.propertyId': dataOTA.propertyId }],
				}
			);
		} else {
			await models.Accelerator.updateOne(
				{ _id: accelerator._id },
				{ $addToSet: { dataOTAs: { ota: task.ota, propertyId: property.propertyId, meta } } }
			);
		}
	});
}

async function runJobAccelerator() {
	if (filtering) return;

	try {
		filtering = true;

		const today = new Date().toDateMysqlFormat();

		const filter = {
			_id: { $nin: _.keys(RUNNING_IDS).toMongoObjectIds() },
			done: false,
			numRun: { $lt: MAX_RUN_TASK },
			to: { $gte: today },
			ota: {
				$nin: _.keys(RUNNING_OTAS),
			},
		};

		const task = await models.JobAccelerator.findOne(filter).sort({ createdAt: 1 });

		filtering = false;

		if (!task) return;

		let isDone = false;

		try {
			start(task);

			await runTask(task);

			isDone = true;
		} catch (err) {
			logger.error('runJobAccelerator', task._id, err);
			isDone = false;
		} finally {
			await done(task, isDone);
		}
	} catch (e) {
		logger.error(e);
		filtering = false;
	}
}

async function retryTasks() {
	try {
		await models.JobAccelerator.updateMany(
			{
				_id: { $nin: _.keys(RUNNING_IDS).toMongoObjectIds() },
				done: false,
				numRun: { $gte: MAX_RUN_TASK },
				numRetry: { $lte: MAX_RETRY_TASK },
			},
			{
				$set: {
					numRun: 0,
				},
				$inc: {
					numRetry: 1,
				},
			}
		);
	} catch (e) {
		logger.error('retryTasks', e);
	}
}

schedule.scheduleJob(`*/2 * * * * *`, runJobAccelerator);
schedule.scheduleJob('*/20 * * * *', retryTasks);

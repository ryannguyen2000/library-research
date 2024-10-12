const moment = require('moment');
const schedule = require('node-schedule');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { LocalOTAs, OTAs, RuleHour } = require('@utils/const');
const models = require('@models');
const sync = require('@controllers/sync');
const { syncAuto, syncAll } = require('@controllers/sync/auto');

const RUNNING_ERROR_OTAS = {};
const RUNNING_IDS = {};
const MAX_RETRY_TASK = 10;
const MAX_CONCURRENT = 2;

const EXECUTING = {
	NOR: false,
	ERR: false,
};
let running = 0;

function getOTALockKeys(otas) {
	if (!otas || !otas.length) {
		return _.values(OTAs);
	}
	if (typeof otas[0] === 'string') {
		return otas;
	}
	return _.map(otas, ({ otaName }) => otaName);
}

function start(task, isError) {
	task.doing = true;
	task.save().catch(e => {
		logger.error('done start', task._id, e);
	});

	if (isError) {
		const otas = getOTALockKeys(task.otas);
		otas.forEach(ota => {
			RUNNING_ERROR_OTAS[ota] = RUNNING_ERROR_OTAS[ota] || 0;
			RUNNING_ERROR_OTAS[ota] += 1;
		});
	} else {
		running++;
	}

	RUNNING_IDS[task._id] = true;
}

async function done(task, isError) {
	task.done = true;
	task.doing = false;
	task.numRun = (task.numRun || 0) + 1;

	await task.save().catch(e => {
		logger.error('done task', task._id, e);
	});

	if (isError) {
		const otas = getOTALockKeys(task.otas);
		otas.forEach(ota => {
			RUNNING_ERROR_OTAS[ota] = RUNNING_ERROR_OTAS[ota] || 0;
			RUNNING_ERROR_OTAS[ota] = Math.max(RUNNING_ERROR_OTAS[ota] - 1, 0);
		});
	} else {
		running = Math.max(running - 1, 0);
	}

	delete RUNNING_IDS[task._id];
}

async function runJobSchedule(isError) {
	const exeKey = isError ? 'ERR' : 'NOR';
	if (EXECUTING[exeKey]) return;

	if (!isError && running >= MAX_CONCURRENT) {
		return;
	}

	EXECUTING[exeKey] = true;

	try {
		const now = moment().format('HH:mm');
		const to = now >= RuleHour.openHour ? new Date().zeroHours() : moment().subtract(1, 'day').toDate().zeroHours();

		const filter = {
			_id: { $nin: _.keys(RUNNING_IDS).toMongoObjectIds() },
			done: false,
			to: { $gte: to },
		};
		if (isError) {
			filter.error = true;
			filter['otas.otaName'] = {
				$nin: _.keys(RUNNING_ERROR_OTAS).filter(ota => RUNNING_ERROR_OTAS[ota] >= MAX_CONCURRENT),
			};
		} else {
			filter.error = null;
		}

		const task = await models.JobCalendar.findOne(filter).sort({ from: 1, to: 1, createdAt: 1 });

		EXECUTING[exeKey] = false;

		if (!task) return;

		try {
			start(task, isError);

			const { error } = task;
			if (task.from < to) task.from = to;

			const errorOTAs = await sync.synchronizeSchedules({
				listingId: task.listingIds,
				from: task.from,
				to: task.to,
				otas: task.otas,
				taskId: task._id,
			});

			if (errorOTAs && errorOTAs.length) {
				if (error) {
					task.otas = errorOTAs;
				} else {
					errorOTAs.forEach(o =>
						models.JobCalendar.createByListing({
							listingIds: task.listingIds,
							from: task.from,
							to: task.to,
							otas: [o],
							description: task._id,
							error: true,
						})
					);
				}
			} else if (error) {
				task.error = false;
			}
		} catch (err) {
			logger.error('runJobSchedule', task._id, err);
			task.error = true;
		} finally {
			await done(task, isError);
		}
	} catch (e) {
		logger.error(e);
		EXECUTING[exeKey] = false;
	}
}

async function syncLocalCalendar() {
	try {
		const localOTAs = Object.values(LocalOTAs);
		const listings = await models.Listing.find({
			OTAs: {
				$elemMatch: { otaName: { $in: localOTAs }, active: true },
			},
		}).select('_id');

		await listings.asyncForEach(l =>
			sync.synchronizeSchedules({
				listingId: l._id,
				otas: localOTAs,
			})
		);
	} catch (e) {
		logger.error(e);
	}
}

async function retryCalendarTasks() {
	try {
		await models.JobCalendar.updateMany(
			{
				// _id: { $nin: _.keys(RUNNING_IDS).toMongoObjectIds() },
				error: true,
				numRun: { $lte: MAX_RETRY_TASK },
			},
			{
				done: false,
			}
		);
	} catch (e) {
		logger.error('retryTaskCalendar error', e);
	}
}

function jobOTAAuto() {
	if (new Date().getDate() === 1) {
		syncAll();
	} else {
		syncAuto(moment(), moment().add(10, 'days'));
	}
}

schedule.scheduleJob(`*/1 * * * * *`, () => {
	runJobSchedule();
	runJobSchedule(true);
});
schedule.scheduleJob('30 5 * * *', syncLocalCalendar);
schedule.scheduleJob('10 4 * * *', jobOTAAuto);
schedule.scheduleJob('*/5 * * * *', retryCalendarTasks);

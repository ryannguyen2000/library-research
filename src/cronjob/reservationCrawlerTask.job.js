const schedule = require('node-schedule');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { eventEmitter, EVENTS } = require('@utils/events');
const { MAX_RUN_CRAWLER, ONE_MINUTE, RESOURCE_FILE_TYPE, RESOURCE_FILE_STATUS } = require('@utils/const');
const models = require('@models');
const crawler = require('@controllers/sync/crawler');
const { confirmAutoReportsWithFile } = require('@controllers/finance/payoutGroupAuto');
const Mails = require('@controllers/booking/mails');
const { uploadFileData } = require('@controllers/resource/upload');

const crawlerConfig = {
	// timeout: 5 * 60 * 1000,
	running: {},
	// timer: {},
};
const hookConfig = {
	running: false,
};

async function runHookJobs() {
	try {
		if (hookConfig.running) return;
		hookConfig.running = true;

		const task = await models.Hook.findOne({ done: false });
		if (!task) return;
		if (task.from === 'mail') {
			runMailHook(task.data);
		}
		task.done = true;
		await task.save();
	} catch (e) {
		logger.error(e);
	} finally {
		hookConfig.running = false;
	}
}

function addMessagesFromDataHook(threads, otaName) {
	_.forEach(threads, (thread, threadId) => {
		if (!thread) return;

		const messages = thread.msg || thread || [];
		if (messages.length) {
			eventEmitter.emit(EVENTS.MESSAGE_ADD, {
				otaName,
				otaBookingId: messages[0].otaBookingId,
				threadId,
				messages,
			});
		} else if (thread.otaBookingId) {
			eventEmitter.emit(EVENTS.MESSAGE_ADD, {
				otaName,
				otaBookingId: thread.otaBookingId,
			});
		}
	});
}

async function addCrawlerJobFromDataHook(data, otaName) {
	const timeLimit = new Date(Date.now() - ONE_MINUTE * 2);

	const isExists = await models.JobCrawler.findOne({
		otaName,
		reservationId: data.id,
		$or: [
			{
				done: false,
			},
			{
				createdAt: { $gte: timeLimit },
			},
		],
	}).select('_id');
	if (isExists) return;

	await models.JobCrawler.create({
		otaName,
		reservationId: data.id,
		propertyId: data.propertyId,
		propertyName: data.propertyName,
		from: data.from,
		to: data.to,
		email: data.email,
		bookingInfo: data.bookingInfo,
		done: false,
		numCrawl: 0,
		timeToStart: new Date(Date.now() + 30000),
	});
}

function addThreadFromDataHook(data, otaName) {
	_.forEach(data, thread => {
		if (!thread || !thread.threadId) return;

		models.OTAManager.findOne({ username: thread.email, active: true, name: otaName })
			.then(otaInfo => {
				if (otaInfo) {
					eventEmitter.emit(EVENTS.MESSAGE_THREAD_UPDATE, {
						threadId: thread.threadId.toString(),
						account: otaInfo.account,
						otaName,
					});
				}
			})
			.catch(e => {
				logger.error(e);
			});
	});
}

async function addBookingConfirmationDataFromMail(data, otaName) {
	try {
		const { otaBookingId, title } = data;
		if (!otaBookingId) return;

		const bookingConfirmation = await models.BookingConfirmation.findOne({
			otaName,
			otaBookingId,
		});
		const mail = { title, data };

		if (!bookingConfirmation) {
			await models.BookingConfirmation.create({
				otaBookingId,
				otaName,
				mails: [mail],
			});
		} else {
			// Check duplicate
			const mails = bookingConfirmation.mails || [];
			const isDuplicate = mails.some(_mail => _.isEqual(_mail.data, mail.data));

			if (isDuplicate) {
				logger.error(`OtaBookingId: ${otaBookingId}: mail data duplicate`);
			} else {
				await bookingConfirmation.addReceipt(mail);
			}
		}
	} catch (err) {
		logger.error('addBookingConfirmationDataFromMail', err);
	}
}

async function recocileReport({ source, attachments }) {
	try {
		if (source && attachments.length) {
			await attachments.asyncForEach(async attachment => {
				const { fileDoc, resource } = await uploadFileData({
					data: attachment.data,
					mimeType: attachment.mimetype,
					fileName: attachment.filename,
					fileUrl: attachment.url,
					rootFolder: 'finance',
					resourceName: source,
					fileType: RESOURCE_FILE_TYPE.RECONCILIATION,
					fileStatus: RESOURCE_FILE_STATUS.WAITING,
				});

				await confirmAutoReportsWithFile({
					source,
					fileDoc,
					resource,
				});
			});
		}
	} catch (err) {
		logger.error('recocileReport', err);
	}
}

function runMailHook(data) {
	const reservations = new Set();

	_.forEach(data, item => {
		const { otaName } = item;

		if (item.reservationData) {
			addCrawlerJobFromDataHook(item.reservationData, otaName);

			const isHaveTemplate = _.keys(Mails).includes(otaName);
			const htmlData = _.get(item, 'reservationData.htmlData');
			if (htmlData && isHaveTemplate) addBookingConfirmationDataFromMail(htmlData, otaName);
		} else if (item.reservation) {
			reservations.add(otaName);
		}

		if (item.chat) {
			addMessagesFromDataHook(item.chat, otaName);
		}

		if (item.messageData) {
			addThreadFromDataHook(item.messageData, otaName);
		}

		if (item.reconciliation) {
			recocileReport(item);
		}
	});

	// update reservations
	if (reservations.size) {
		crawler.getReservationsOfOTAs([...reservations]);
	}
}

async function isDoneTask(task) {
	if (!task.reservationId || !task.otaName) {
		return true;
	}

	const booking = await models.Booking.findOne({
		otaBookingId: task.reservationId,
		otaName: task.otaName,
	}).select('_id');

	return !!booking;
}

async function runCrawlerJobs() {
	if (crawlerConfig.finding) return;

	try {
		crawlerConfig.finding = true;

		const task = await models.JobCrawler.findOne({
			done: false,
			otaName: { $nin: _.keys(crawlerConfig.running) },
			numCrawl: { $lt: MAX_RUN_CRAWLER },
			$or: [
				{
					timeToStart: null,
				},
				{
					timeToStart: { $lte: new Date() },
				},
			],
		});

		crawlerConfig.finding = false;

		if (!task) return;

		logger.info('runCrawlerJobs', task._id);

		crawlerConfig.running[task.otaName] = true;

		let done = false;

		try {
			await crawler.getReservationsOfOTAsHook(task);
			done = await isDoneTask(task);
		} catch (e) {
			logger.error(e);
		} finally {
			await models.JobCrawler.updateOne({ _id: task._id }, { $inc: { numCrawl: 1 }, $set: { done } }).catch(e => {
				logger.error(e);
			});

			delete crawlerConfig.running[task.otaName];
		}
	} catch (e) {
		logger.error(e);
		crawlerConfig.finding = false;
	}
}

async function retryCrawlerTasks() {
	try {
		await models.JobCrawler.updateMany(
			{
				reservationId: { $nin: [null, ''] },
				done: false,
			},
			{
				numCrawl: 0,
			}
		);
	} catch (e) {
		logger.error('retryTask error', e);
	}
}

schedule.scheduleJob('*/2 * * * * *', () => {
	runHookJobs();
	runCrawlerJobs();
});

schedule.scheduleJob('*/10 * * * *', () => {
	retryCrawlerTasks();
});

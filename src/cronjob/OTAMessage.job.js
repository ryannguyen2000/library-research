const schedule = require('node-schedule');
const _ = require('lodash');
const moment = require('moment');

const { logger } = require('@utils/logger');
const { OTAs, MessageUser, BookingGuideStatus, BookingStatus } = require('@utils/const');
const models = require('@models');
const { syncMessage } = require('@controllers/message');

const DELAY_MINUTE = 30;

async function syncThreadIds(threadIds, page = 1) {
	if (!threadIds || !threadIds.length) return;

	const limit = 20;
	const skip = (page - 1) * limit;

	const messages = await models.Messages.find({
		_id: { $in: threadIds },
		updatedAt: {
			$lt: moment()
				.add(-(DELAY_MINUTE - 5), 'minute')
				.toDate(),
		},
		'messages.0.user': { $ne: MessageUser.GUEST },
		'messages.0.time': { $gte: moment().add(-5, 'hour').toDate() },
	})
		.select('_id otaName')
		.skip(skip)
		.limit(limit)
		.lean();

	await _.values(_.groupBy(messages, 'otaName')).asyncMap(threads => {
		return threads.asyncForEach(async thread => {
			const message = await models.Messages.findById(thread._id);
			return syncMessage(message, false).catch(e => {
				logger.error('syncOTAThreads', thread._id, thread.otaName, e);
			});
		});
	});

	if (messages.length === limit) {
		await syncThreadIds(threadIds, page + 1);
	}
}

async function syncOTAThreads() {
	try {
		const inboxGroup = await models.BlockInbox.aggregate()
			.match({
				otaName: { $in: [OTAs.Agoda, OTAs.Booking] },
				from: { $gte: new Date().zeroHours() },
				guideStatus: {
					$in: [
						BookingGuideStatus.CantContact,
						BookingGuideStatus.WaitingForResponse,
						BookingGuideStatus.Responding,
					],
				},
				status: BookingStatus.CONFIRMED,
				ottSource: { $in: ['', null] },
			})
			.group({
				_id: null,
				messageIds: { $addToSet: '$messageId' },
			});

		await syncThreadIds(_.get(inboxGroup, [0, 'messageIds']));
	} catch (e) {
		logger.error('syncOTAThreads', e);
	}
}

schedule.scheduleJob(`*/${DELAY_MINUTE} * * * *`, syncOTAThreads);

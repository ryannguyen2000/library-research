const schedule = require('node-schedule');
const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');
const uuid = require('uuid').v4;
const AsyncLock = require('async-lock');

const { eventEmitter, EVENTS } = require('@utils/events');
const { equalConditions } = require('@utils/func');
const { BookingStatus, MessageAutoType, AutoTemplates, AutoEvents, RuleDay, OTTs, LANGUAGE } = require('@utils/const');
const logger = require('@utils/logger').log('chat-bot');
const models = require('@models');
const message = require('@controllers/message');
const messageOTT = require('@controllers/message/ott');

const queueLock = new AsyncLock();

const ENABLE_LOG = false;
const SEND_OTT_DELAY = 10 * 1000;
const IS_PRODUCTION = !global.isDev;
const CACHE_OTT = {};
const WARNING_SPAM_OTTS = [OTTs.WhatsApp];
const Actions = {
	Message: 'message',
	Template: 'template',
};

function _error(...args) {
	logger.error(...args);
}

function _info(...args) {
	if (ENABLE_LOG) {
		logger.info(...args);
	}
}

async function sendThrowOTT(ottName, phone, messageId, groupId, blockId, msgs, isRetry) {
	try {
		const isWarningSpam = WARNING_SPAM_OTTS.includes(ottName);
		if (isWarningSpam && isRetry) return false;

		const exists = await messageOTT.checkOTTExists({ ottName, phone, groupId, blockId });
		if (_.get(exists, 'data.exists')) {
			const lastSent = _.get(CACHE_OTT, [ottName, 'lastSent']);
			if (lastSent) {
				const diffTime = Date.now() - lastSent;
				if (diffTime < SEND_OTT_DELAY) {
					await Promise.delay(SEND_OTT_DELAY - diffTime);
				}
			}

			const text = isWarningSpam ? msgs[1] : msgs[0];

			await messageOTT.sendOTTMessage({
				ottName,
				phone,
				text,
				messageId,
				groupId,
				blockId,
			});

			_.set(CACHE_OTT, [ottName, 'lastSent'], Date.now());

			return true;
		}
	} catch (e) {
		_error(ottName, e);
		return false;
	}
}

async function sendThrowOTA(messageId, msg) {
	if (!IS_PRODUCTION) return false;

	try {
		const res = await message.postMessage({ messageId, msg });
		return res.otaName;
	} catch (e) {
		_error(e);
		return false;
	}
}

async function sendThrowOTTs(messageId, blockId, msgs, guest, template, sendAll, isRetry) {
	if (!IS_PRODUCTION) return false;

	let prevOtt;

	const inbox = await models.BlockInbox.findOne({ messageId }).select('ottSource phone groupIds').lean();
	if (inbox && inbox.ottSource) {
		prevOtt = inbox.ottSource;
		const ottId = guest.ottIds[prevOtt];
		if (ottId && _.includes(template.otts, prevOtt)) {
			const success = await sendThrowOTT(prevOtt, ottId, messageId, inbox.groupIds, blockId, msgs, isRetry);
			if (success) return [prevOtt];
		}
	}

	const hasOtt = _.keys(guest.ottIds).length;
	if (!template.otts || !template.otts.length || (!hasOtt && !guest.phone)) {
		return false;
	}

	const sentOtts = [];

	for (const ottName of template.otts) {
		if (prevOtt && prevOtt === ottName) continue;

		const ottId = _.get(guest.ottIds, ottName) || guest.phone;
		if (!ottId) continue;

		const success = await sendThrowOTT(ottName, ottId, messageId, template.groupIds, blockId, msgs, isRetry);
		if (success) {
			if (!sendAll) return [ottName];
			sentOtts.push(ottName);
		}
	}

	return sentOtts.length ? sentOtts : false;
}

async function onTemplate({ templateId, booking, guest, messageId, blockId, template }) {
	const rs = [];

	if (!IS_PRODUCTION || !template.otts || !template.otts.length) return rs;

	await template.otts.asyncMap(ottName =>
		messageOTT
			.sendOTTTemplate({
				ottName,
				messageId,
				blockId,
				templateId,
				guestId: guest._id,
				groupId: booking.groupIds,
			})
			.then(() => {
				rs.push(ottName);
			})
	);

	return rs;
}

async function validateAsync(auto, booking, guest, messageId, options) {
	if (!booking) return true;

	if (
		!_.get(options, 'retry') ||
		(auto.template !== AutoTemplates.Guide && auto.template !== AutoTemplates.Reservation)
	) {
		const automatedBooking = await models.Booking.findOne({
			otaName: booking.otaName,
			otaBookingId: booking.otaBookingId,
			$or: [
				{
					ignoreTemplate: auto.template,
				},
				{
					doneTemplate: auto.template,
				},
				{
					error: { $gt: 0 },
					status: BookingStatus.CONFIRMED,
				},
			],
		}).select('_id');
		if (automatedBooking) {
			return false;
		}
	}

	const isSelfCheckin = _.get(auto.conditions, 'isSelfCheckin');
	if (_.isBoolean(isSelfCheckin)) {
		const block = await models.Block.findById(booking.blockId).select('isSelfCheckin');
		if (isSelfCheckin !== Boolean(_.get(block, 'isSelfCheckin'))) {
			return false;
		}
	}

	const isExtended = _.get(auto.conditions, 'isExtended');
	if (_.isBoolean(isExtended)) {
		const sources = await models.BookingSource.find({ extend: true }).select('name');

		let extendedBooking;

		if (!sources.length) {
			extendedBooking = false;
		} else {
			extendedBooking = await models.Booking.findOne({
				from: booking.to,
				status: BookingStatus.CONFIRMED,
				otaName: { $in: _.map(sources, 'name') },
				reservateRooms: { $in: booking.reservateRooms },
			}).select('_id');
		}

		if (isExtended !== Boolean(extendedBooking)) {
			return false;
		}
	}

	const isOldGuest = _.get(auto.conditions, 'isOldGuest');
	if (_.isBoolean(isOldGuest)) {
		const oldBooking = await models.Booking.findOne({
			to: { $lt: booking.from },
			status: BookingStatus.CONFIRMED,
			$or: [
				{
					guestId: guest._id,
				},
				{
					guestIds: guest._id,
				},
			],
		}).select('_id');
		if (isOldGuest !== Boolean(oldBooking)) {
			return false;
		}
	}

	const attitude = _.get(auto.conditions, 'attitude');
	if (attitude) {
		const thread = await models.Messages.findById(messageId).select('attitude');
		if (!thread || !equalConditions(attitude, thread.attitude)) {
			return false;
		}
	}

	const diffReleaseDay = _.get(auto.conditions, 'diffReleaseDay');
	if (diffReleaseDay) {
		const oldestBooking = await models.Booking.findOne({
			status: BookingStatus.CONFIRMED,
			blockId: booking.blockId,
		})
			.select('from')
			.sort({ from: 1 });
		const time = oldestBooking ? oldestBooking.from : new Date();
		if (!equalConditions(diffReleaseDay, moment().diff(time, 'day'))) {
			return false;
		}
	}

	return true;
}

async function execute(template, blockId, booking, otaName, guest, messageId, options) {
	try {
		const isValid = await validateAsync(template, booking, guest, messageId, options);
		if (!isValid) return _info('ignore', booking && booking._id, template._id);

		const sentOtts = [];
		const sendAll =
			_.get(options, 'sendAll') ||
			(!_.get(booking, 'doneTemplate.length') && !_.get(booking, 'ignoreTemplate.length'));
		const isRetry = _.get(options, 'retry');

		const OTAcontent = _.find(template.OTAcontents, o => o.otaName === otaName);

		await template.contents.asyncForEach(async (content, index) => {
			if (content.action === Actions.Message) {
				const contents = [content];

				const currentOTAContent = _.get(OTAcontent, ['contents', index]);
				if (currentOTAContent) {
					contents.push(currentOTAContent);
				}

				const [msgs, OTAMsgs] = await models.ChatAutomatic.replaceContent({ contents, booking, guest });

				if (sendAll) {
					const [ota, otts] = await Promise.all([
						sendThrowOTA(messageId, _.get(OTAMsgs, 0) || msgs[0]),
						sendThrowOTTs(messageId, blockId, msgs, guest, template, sendAll, isRetry),
					]);
					if (ota) sentOtts.push(ota);
					if (otts) sentOtts.push(...otts);
				} else {
					const otts = await sendThrowOTTs(messageId, blockId, msgs, guest, template, sendAll, isRetry);
					if (!otts) {
						const ota = await sendThrowOTA(messageId, _.get(OTAMsgs, 0) || msgs[0]);
						if (ota) sentOtts.push(ota);
					} else {
						sentOtts.push(...otts);
					}
				}
			}
			if (!isRetry && content.action === Actions.Template) {
				const otts = await onTemplate({
					templateId: content.templateId,
					booking,
					guest,
					messageId,
					blockId,
					template,
				});
				sentOtts.push(...otts);
			}
		});

		if (!booking) return;

		await models.Booking.setDoneTemplate(booking, guest, template, sentOtts);
	} catch (err) {
		_error(err);
	}
}

async function executeEvent(templates, blockId, otaName, booking, guest, messageId, options) {
	const activeTemplates = models.ChatAutomatic.validateSync({ templates, blockId, booking, otaName, guest });
	await activeTemplates.asyncForEach(auto => execute(auto, blockId, booking, otaName, guest, messageId, options));
}

async function sendBookingConfirmation(booking, options) {
	try {
		const templates = await models.ChatAutomatic.find({
			active: true,
			triggerNow: true,
			autoType: MessageAutoType.GUEST,
			event: AutoEvents.Confirmed,
			groupIds: booking.groupIds[0],
		});

		if (templates.length) {
			await queueLock.acquire(`${booking.otaName}_${booking.otaBookingId}`, async () => {
				const currentBooking = await models.Booking.findById(booking._id)
					.select('-histories')
					.populate('guestId');

				await executeEvent(
					templates,
					currentBooking.blockId,
					currentBooking.otaName,
					currentBooking,
					currentBooking.guestId,
					currentBooking.messages,
					options
				);
			});
		}
	} catch (e) {
		_error(e);
	}
}

async function onReservation(booking) {
	const block = await models.Block.findById(booking.blockId).select('disableAutoMsg');
	if (block.disableAutoMsg) return;

	// delay few seconds to update all relative booking and run
	setTimeout(b => sendBookingConfirmation(b), 3000, booking);
	setTimeout(data => onNotificationForOwner(data), 3000, {
		booking,
		autoTemplateType: AutoTemplates.Reservation,
		autoEvent: AutoEvents.Confirmed,
	});
}

async function onInquiry(guest, threadId, listingId, otaName) {
	try {
		const block = await models.Block.findOne({ listingIds: listingId }).select('_id groupIds disableAutoMsg');
		if (block.disableAutoMsg) return;

		const templates = await models.ChatAutomatic.find({
			active: true,
			triggerNow: true,
			autoType: MessageAutoType.GUEST,
			event: AutoEvents.Inquiry,
			groupIds: block.groupIds[0],
		});
		if (templates.length) {
			await executeEvent(templates, block._id, listingId, otaName, null, guest, threadId);
		}
	} catch (e) {
		_error(e);
	}
}

async function onCanceled(booking, guest, fromOTA, roomIds) {
	try {
		if (fromOTA) return;

		const block = await models.Block.findById(booking.blockId).select('disableAutoMsg');
		if (block.disableAutoMsg) return;

		const templates = await models.ChatAutomatic.find({
			active: true,
			triggerNow: true,
			autoType: MessageAutoType.GUEST,
			event: AutoEvents.Canceled,
			groupIds: booking.groupIds[0],
		});

		await executeEvent(templates, booking.blockId, booking.otaName, booking, guest, booking.messages);
		await onNotificationForOwner({
			booking,
			autoTemplateType: AutoTemplates.Reservation,
			autoEvent: AutoEvents.Canceled,
			blockId: booking.blockId,
			roomIds,
		});
	} catch (e) {
		_error(e);
	}
}

async function onCheckCheckin(booking, guest) {
	try {
		const block = await models.Block.findById(booking.blockId).select('disableAutoMsg');
		if (block.disableAutoMsg) return;

		const templates = await models.ChatAutomatic.find({
			active: true,
			triggerNow: true,
			autoType: MessageAutoType.GUEST,
			event: AutoEvents.CheckCheckIn,
			groupIds: booking.groupIds[0],
		});

		await executeEvent(templates, booking.blockId, booking.otaName, booking, guest, booking.messages);
	} catch (e) {
		_error(e);
	}
}

async function onTaskAutoCreated(booking, tasks, isUpdate) {
	try {
		const block = await models.Block.findById(booking.blockId).select('disableAutoMsg');
		if (block.disableAutoMsg) return;

		const template = await models.ChatAutomatic.findOne({
			active: true,
			triggerNow: true,
			autoType: MessageAutoType.GUEST,
			event: AutoEvents.TaskCreate,
			template: isUpdate ? AutoTemplates.UpdateCleaningTask : AutoTemplates.CreateCleaningTask,
			groupIds: booking.groupIds[0],
		});
		if (!template) return;

		const guest = await models.Guest.findById(booking.guestId);

		for (const content of template.contents) {
			const [msgs, OTAMsgs] = await models.ChatAutomatic.replaceContent({
				contents: [content],
				booking,
				guest,
				tasks,
			});

			const otts = await sendThrowOTTs(booking.messages, booking.blockId, msgs, guest, template);
			if (!otts) {
				await sendThrowOTA(booking.messages, _.get(OTAMsgs, 0) || msgs[0]);
			}
		}
	} catch (e) {
		_error(e);
	}
}

async function onUpdatedPaymentStatus(bookings, isPaid) {
	if (!isPaid) return;

	try {
		const booking = await models.Booking.findOne({
			_id: { $in: _.map(bookings, '_id') },
			doneTemplate: { $ne: AutoTemplates.Guide },
			ignoreTemplate: { $ne: AutoTemplates.Guide },
		})
			.select('-histories')
			.populate('guestId');

		if (booking) {
			const block = await models.Block.findById(booking.blockId).select('disableAutoMsg');
			if (block.disableAutoMsg) return;

			const templates = await models.ChatAutomatic.find({
				active: true,
				triggerNow: true,
				autoType: MessageAutoType.GUEST,
				template: AutoTemplates.Guide,
				groupIds: booking.groupIds[0],
			});

			if (templates.length) {
				await executeEvent(
					templates,
					booking.blockId,
					booking.otaName,
					booking,
					booking.guestId,
					booking.messages
				);
			}
		}
	} catch (e) {
		_error(e);
	}
}

function getOperator(con) {
	if (!_.isObject(con)) return con;

	const rs = {};
	_.forEach(con, (val, key) => {
		rs[`$${key}`] = _.isArray(val)
			? val.map(v => (mongoose.Types.ObjectId.isValid(v) ? mongoose.Types.ObjectId(v) : v))
			: val;
	});

	return rs;
}

async function runJob(jobId, triggerHour) {
	const autos = await models.ChatAutomatic.find({
		active: true,
		autoType: MessageAutoType.GUEST,
		displayOnly: { $ne: true },
		triggerHour,
	});

	if (!autos.length) return clearJob(jobId);

	await autos.asyncForEach(async auto => {
		const filter = {
			error: 0,
			status: BookingStatus.CONFIRMED,
			groupIds: { $in: auto.groupIds },
		};

		if (auto.event === AutoEvents.CheckOut) {
			const isSameDay = moment().format('HH:mm') < RuleDay.from;
			const diff = -auto.triggerDate + (isSameDay ? -1 : 0);
			const to = moment().add(diff, 'day').toDate().zeroHours();
			_.set(filter, ['to', '$eq'], to);
		} else {
			if (auto.event === AutoEvents.CheckIn) {
				filter.checkedIn = true;
			}
			const from = moment().add(-auto.triggerDate, 'day').toDate().zeroHours();
			_.set(filter, ['from', '$eq'], from);
		}

		const paid = _.get(auto.conditions, 'paid');
		if (_.isBoolean(paid)) {
			filter.isPaid = paid;
		}
		const serviceType = _.get(auto.conditions, 'serviceType');
		if (serviceType) {
			filter.serviceType = getOperator(serviceType);
		}
		const blockId = _.get(auto.conditions, 'blockId');
		if (blockId) {
			filter.blockId = getOperator(blockId);
		}
		const otaName = _.get(auto.conditions, 'otaName');
		if (otaName) {
			filter.otaName = getOperator(otaName);
		}
		const diffCheckin = _.get(auto.conditions, 'diffCheckin');
		if (diffCheckin) {
			filter.checkedIn = true;
		}

		const blockFilters = {
			isProperty: true,
			disableAutoMsg: { $ne: true },
		};
		const isSelfCheckin = _.get(auto.conditions, 'isSelfCheckin');
		if (_.isBoolean(isSelfCheckin)) {
			blockFilters.isSelfCheckin = isSelfCheckin;
		}

		const blocks = await models.Block.find(blockFilters).select('_id').lean();
		_.set(filter, ['blockId', '$in'], _.map(blocks, '_id'));

		filter.ignoreTemplate = { $ne: auto.template };
		filter.doneTemplate = { $ne: auto.template };

		const bookings = await models.Booking.find(filter)
			.select('-histories')
			.populate('guestId', 'name fullName country phone ottIds passport lang');

		_info('running auto message', auto.template, bookings.length);

		await _.uniqBy(bookings, b => `${b.otaBookingId}_${b.otaName}`).asyncForEach(booking =>
			executeEvent([auto], booking.blockId, booking.otaName, booking, booking.guestId, booking.messages)
		);
	});
}

const jobs = {};

function clearJob(jobId) {
	if (jobs[jobId]) {
		jobs[jobId].cancel();
		delete jobs[jobId];
	}
}

async function initJob() {
	try {
		_.keys(jobs).forEach(clearJob);

		const autos = await models.ChatAutomatic.aggregate([
			{
				$match: {
					active: true,
					autoType: MessageAutoType.GUEST,
					displayOnly: { $ne: true },
					triggerHour: { $ne: null },
				},
			},
			{
				$group: { _id: '$triggerHour' },
			},
		]);

		_.forEach(autos, auto => {
			if (!auto._id) return;

			const jobId = uuid();
			if (auto._id.match(/\d{2}:\d{2}/)) {
				const [h, m] = auto._id.split(':');
				jobs[jobId] = schedule.scheduleJob(`${Number(m)} ${Number(h)} * * *`, () => runJob(jobId, auto._id));
			} else {
				jobs[jobId] = schedule.scheduleJob(auto._id, () => runJob(jobId, auto._id));
			}
		});

		_info('Chat bot auto initialized');
	} catch (e) {
		_error(e);
	}
}

async function getOwnerAndMsgData({ owerNotificationConfig, autoTemplateType, autoEvent, ...data }) {
	if (!data.blockId && !data.roomIds && !data.booking) return {};
	let { roomIds, blockId } = data;

	if (data.booking) {
		const { booking } = data;
		blockId = booking.blockId;
		roomIds = _.get(roomIds, 'length', 0)
			? roomIds
			: await models.Reservation.getReservateRooms(blockId, booking._id);
	}

	const hostBlocks = await models.HostBlock.find({
		blockId,
		$or: [{ roomIds: { $in: roomIds } }, { roomIds: [] }],
	})
		.select('userId blockId roomIds')
		.lean();

	const query = {
		_id: { $in: hostBlocks.map(hb => hb.userId) },
		enable: true,
		role: { $in: owerNotificationConfig.sendForRoles },
		'otts.notificationEnable': true,
		$or: [
			{ 'config.chatAutomaticConfigs': { $in: [null, []] } },
			{
				'config.chatAutomaticConfigs': {
					$elemMatch: { autoTemplate: autoTemplateType, autoEvents: { $in: [null, []] } },
				},
			},
			{
				'config.chatAutomaticConfigs': {
					$elemMatch: { autoTemplate: autoTemplateType, autoEvents: autoEvent },
				},
			},
		],
	};
	const owners = await models.User.find(query).select('name username role otts config').lean();

	return owners.reduce((_owners, _owner) => {
		_owner.otts = _owner.otts.filter(ott => ott.notificationEnable);
		if (_.get(_owner, 'otts.length', 0)) {
			_owners.push(_owner);
		}
		return _owners;
	}, []);
}

async function notifyForOwner(otts, msgs) {
	for (const ott of otts) {
		const { ottId, ottName, ottPhone } = ott;
		let success = false;

		for (const msg of msgs) {
			success = await sendMessage({ phone: ottId, ottName, sender: ottPhone, text: msg[0] });
			if (!success) break;
		}
		if (success) return;
	}
}

async function sendMessage({ ottName, phone, sender, text }, retry = 0) {
	try {
		await messageOTT.sendOTTMessage({ ottName, phone, sender, text });
		return true;
	} catch (err) {
		if (retry < 1) {
			return sendMessage({ ottName, phone, sender, text }, retry + 1);
		}
		return false;
	}
}

async function onNotificationForOwner(data) {
	try {
		const { autoTemplateType, autoEvent, booking, roomIds } = data;
		if (!_.values(AutoTemplates).includes(autoTemplateType)) return;
		if (!_.values(AutoEvents).includes(autoEvent)) return;

		const chatAutomatic = await models.ChatAutomatic.findOne({
			template: AutoTemplates.Reservation,
			autoType: MessageAutoType.CDT_OWNER,
			event: autoEvent,
			groupIds: _.get(booking, 'groupIds[0]'),
		});
		if (!chatAutomatic) return;

		const owerNotificationConfig = await models.Setting.getOwnerNotificationConfig();
		const owners = await getOwnerAndMsgData({ ...data, owerNotificationConfig });
		if (!owners.length) return;

		const langs = [...new Set(_.compact(owners.map(owner => _.get(owner, 'config.lang', LANGUAGE.VI))))];
		if (!langs.length) langs.push(LANGUAGE.VI);

		const guest = await models.Guest.findById(booking.guestId).lean();
		const msgs = await langs.asyncMap(lang =>
			models.ChatAutomatic.replaceContent({
				contents: chatAutomatic.contents,
				booking,
				guest,
				lang,
				roomIds: roomIds || [],
			})
		);

		const msgsKeyByLang = langs.reduce((rs, lang, index) => {
			rs[lang] = msgs[index];
			return rs;
		}, {});

		await owners.asyncForEach(owner => {
			const lang = _.get(owner, 'config.lang', LANGUAGE.VI);
			return notifyForOwner(owner.otts, msgsKeyByLang[lang]);
		});
	} catch (err) {
		console.log(err);
	}
}

async function onChargedBooking(booking) {
	try {
		const block = await models.Block.findById(booking.blockId).select('disableAutoMsg');
		if (block.disableAutoMsg) return;

		booking = await models.Booking.findById(booking._id).select('-histories').populate('guestId');

		const template = await models.ChatAutomatic.findOne({
			active: true,
			triggerNow: true,
			autoType: MessageAutoType.GUEST,
			template: AutoTemplates.BookingChargedAuto,
			groupIds: { $in: [booking.groupIds[0], null] },
		});

		if (template) {
			await executeEvent(
				[template],
				booking.blockId,
				booking.otaName,
				booking,
				booking.guestId,
				booking.messages
			);
		}
	} catch (e) {
		_error(e);
	}
}

function initAutoMessage() {
	eventEmitter.on(EVENTS.RESERVATION, onReservation);
	eventEmitter.on(EVENTS.SEND_BOOKING_CONFIRMATION, sendBookingConfirmation);
	eventEmitter.on(EVENTS.RESERVATION_CANCEL, onCanceled);
	eventEmitter.on(EVENTS.INQUIRY, onInquiry);
	eventEmitter.on(EVENTS.UPDATE_AUTOMATION, initJob);
	eventEmitter.on(EVENTS.CHECK_CHECKIN, onCheckCheckin);
	eventEmitter.on(EVENTS.TASK_CREATE_AUTO, onTaskAutoCreated);
	eventEmitter.on(EVENTS.UPDATE_PAYMENT_STATUS, onUpdatedPaymentStatus);
	// eventEmitter.on(EVENTS.HOST_NOTIFICATION, onNotificationForHost);

	eventEmitter.on(EVENTS.BOOKING_CHARGED, onChargedBooking);

	initJob();
}

module.exports = {
	initAutoMessage,
	initJob,
	onNotificationForOwner,
};

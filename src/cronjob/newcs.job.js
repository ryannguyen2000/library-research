const schedule = require('node-schedule');
const _ = require('lodash');
const moment = require('moment');

const { logger } = require('@utils/logger');
const {
	BookingGuideStatus,
	BookingGuideDoneStatus,
	BookingCallStatus,
	BookingStatus,
	BookingQueueCancellation,
	BookingStatusKeys,
	RuleDay,
} = require('@utils/const');
const { isVNPhone } = require('@utils/phone');
const { Settings } = require('@utils/setting');
const { eventEmitter, EVENTS } = require('@utils/events');
const models = require('@models');

const KEYS_STATUS = [
	BookingStatusKeys.GuideStatus,
	BookingStatusKeys.GuideDoneStatus,
	BookingStatusKeys.CallStatus,
	BookingStatusKeys.QueueCancellationStatus,
];

function getCITime() {
	const [h, m] = RuleDay.from.split(':');

	return moment().hour(+h).minute(+m).startOf('minute').toDate();
}

// NEWCS
async function guideC1(setting) {
	const time = moment().subtract(setting.value, 'minute').toDate();
	const ciTime = getCITime();

	const filter = {
		status: BookingStatus.CONFIRMED,
		callStatus: BookingCallStatus.NeedCall,
		guideStatus: { $in: [BookingGuideStatus.CantContact, BookingGuideStatus.WaitingForResponse] },
		createdAt: setting.key === Settings.DelayForReCallAfterIn.key ? { $gte: ciTime } : { $lt: ciTime },
		from: { $gte: new Date().zeroHours() },
		displayToday: true,
		$and: [
			{
				$or: [
					{
						lastTimeCalled: null,
					},
					{
						lastTimeCalled: { $lte: time },
					},
				],
			},
			{
				$or: [
					{
						lastTimeSent: null,
					},
					{
						lastTimeSent: { $lte: time },
					},
				],
			},
		],
	};

	const bookings = await models.Booking.find(filter)
		.select('isPaid otaBookingId otaName')
		.populate({
			path: 'totalCall',
			match: {
				'data.from_internal': 1,
			},
		})
		.lean();

	const items = bookings.map(booking => {
		let callStatus;

		if (booking.totalCall <= Settings.MaxCallOut.value) {
			callStatus = BookingCallStatus.NeedCall;
		} else if (booking.isPaid) {
			// Đẩy sang danh sách cần liên hệ gọi điện để chốt CI Guide
			callStatus = BookingCallStatus.NeedCallForGuide;
		} else {
			// Đẩy sang danh sách cần liên hệ gọi điện để chốt Đặt phòng
			callStatus = BookingCallStatus.NeedCallForConfirmation;
		}

		return {
			bookingId: booking._id,
			data: {
				display: true,
				callStatus,
			},
		};
	});

	return items;
}

async function guideC2(callStatus) {
	const time = moment().subtract(Settings.DelayForReCallGuide.value, 'minute').toDate();
	const filter = {
		status: BookingStatus.CONFIRMED,
		callStatus,
		guideStatus: { $ne: BookingGuideStatus.Done },
		displayToday: true,
		from: { $gte: new Date().zeroHours() },
		$and: [
			{
				$or: [
					{
						lastTimeCalled: null,
					},
					{
						lastTimeCalled: { $lte: time },
					},
				],
			},
			{
				$or: [
					{
						lastTimeSent: null,
					},
					{
						lastTimeSent: { $lte: time },
					},
				],
			},
		],
	};

	const chain = models.Booking.find(filter).select('otaBookingId otaName createdAt from');

	if (callStatus === BookingCallStatus.NeedCallForConfirmation) {
		chain.populate({
			path: 'totalCall',
			match: {
				'data.from_internal': 1,
				'data.answer_time': 0, // gọi nhỡ
			},
		});
	}

	const bookings = await chain.lean();

	const items = bookings.map(booking => {
		if (moment(booking.createdAt).isSameOrAfter(booking.from, 'day')) {
			if (
				callStatus === BookingCallStatus.NeedCallForConfirmation &&
				booking.totalCall > Settings.MaxCallOut.value
			) {
				// Hoàn thành tác vụ Checkin Guide với trạng thái không liên hệ được
				// Đẩy Res vào QUEUE HỦY PHÒNG
				return {
					bookingId: booking._id,
					data: {
						callStatus: BookingCallStatus.None,
						guideStatus: BookingGuideStatus.Done,
						guideDoneStatus: BookingGuideDoneStatus.CantContact,
						queueCancellationStatus: BookingQueueCancellation.NeedCancel,
						ignoreGuide: true,
						display: true,
					},
				};
			}
			// Đẩy sang danh sách cần liên hệ gọi điện để chốt CI Guide
			return {
				bookingId: booking._id,
				data: {
					display: true,
					callStatus,
				},
			};
		}

		// Đẩy sang danh sách cần liên hệ gọi điện để chốt CI Guide vào ngày mai
		return {
			bookingId: booking._id,
			data: {
				display: true,
				displayToday: false,
			},
		};
	});

	return items;
}

async function guideC3(setting) {
	const time = moment().subtract(setting.value, 'minute').toDate();
	const ciTime = getCITime();
	const filter = {
		status: BookingStatus.CONFIRMED,
		guideStatus: BookingGuideStatus.WaitingForResponse,
		createdAt: setting.key === Settings.DelayForReCallAfterIn.key ? { $gte: ciTime } : { $lt: ciTime },
		displayToday: true,
		from: { $gte: new Date().zeroHours() },
		$and: [
			{
				$or: [
					{
						lastTimeCalled: null,
					},
					{
						lastTimeCalled: { $lte: time },
					},
				],
			},
			{
				$or: [
					{
						lastTimeSent: null,
					},
					{
						lastTimeSent: { $lte: time },
					},
				],
			},
		],
	};

	const bookings = await models.Booking.find(filter)
		.select('otaName otaBookingId from to blockId guestId countSentGuide')
		.populate({
			path: 'totalCall',
			match: {
				'data.from_internal': 1,
			},
		})
		.populate({
			path: 'guestId',
			select: 'phone',
		})
		.lean();

	const items = bookings.map(booking => {
		const isSameDay = moment().isSame(booking.from, 'day');
		const hasVNPhone = isVNPhone(booking.guestId.phone);

		if (isSameDay) {
			if ((!hasVNPhone || booking.totalCall) && booking.countSentGuide >= Settings.MaxSendMessage.value) {
				// Hoàn thành tác vụ Checkin Guide với trạng thái không liên hệ được
				// Đẩy Res vào QUEUE HỦY PHÒNG
				return {
					bookingId: booking._id,
					data: {
						display: true,
						ignoreGuide: true,
						callStatus: BookingCallStatus.None,
						guideStatus: BookingGuideStatus.Done,
						guideDoneStatus: BookingGuideDoneStatus.CantContact,
						queueCancellationStatus: BookingQueueCancellation.NeedCancel,
					},
				};
			}
		}

		if (!hasVNPhone || booking.totalCall) {
			// Đẩy Res vào task xác nhận đặt phòng vào mai
			return {
				bookingId: booking._id,
				data: {
					display: true,
					displayToday: false,
					guideStatus: BookingGuideStatus.WaitingForResponse,
					callStatus: BookingCallStatus.NeedCallForConfirmation,
				},
			};
		}

		return null;
	});

	return _.compact(items);
}

async function guideC4() {
	const time = moment().subtract(Settings.DelayForReCallBeforeIn.value, 'minute').toDate();

	const filter = {
		status: BookingStatus.CONFIRMED,
		from: { $gt: new Date().zeroHours() },
		guideStatus: BookingGuideStatus.Responding,
		callStatus: { $ne: BookingCallStatus.NeedCallForConfirmation },
		isPaid: false,
		displayToday: true,
		$and: [
			{
				$or: [
					{
						lastTimeCalled: null,
					},
					{
						lastTimeCalled: { $lte: time },
					},
				],
			},
			{
				$or: [
					{
						lastTimeSent: null,
					},
					{
						lastTimeSent: { $lte: time },
					},
				],
			},
		],
	};

	const bookings = await models.Booking.find(filter).select('_id').lean();

	// Đẩy Res vào task xác nhận đặt phòng vào mai
	const items = bookings.map(booking => {
		return {
			bookingId: booking._id,
			data: {
				display: true,
				displayToday: false,
				callStatus: BookingCallStatus.NeedCallForConfirmation,
			},
		};
	});

	return items;
}

async function resendBookingConfirmation(setting) {
	const time = moment().subtract(setting.value, 'minute').toDate();
	const ciTime = getCITime();

	const filter = {
		status: BookingStatus.CONFIRMED,
		$or: [
			{
				from: new Date().zeroHours(),
			},
			{
				from: { $gt: new Date().zeroHours() },
				'rateDetail.isNonRefundable': true,
			},
		],
		createdAt: setting.key === Settings.DelayForReSendAfterIn.key ? { $gte: ciTime } : { $lt: ciTime },
		checkedIn: false,
		guideStatus: BookingGuideStatus.WaitingForResponse,
		lastTimeSent: { $lte: time },
		countSentGuide: { $lt: Settings.MaxSendMessage.value },
	};

	const blocks = await models.Block.find({
		isProperty: true,
		disableAutoMsg: { $ne: true },
	})
		.select('_id')
		.lean();
	_.set(filter, ['blockId', '$in'], _.map(blocks, '_id'));

	const bookings = await models.Booking.find(filter)
		.select('otaName otaBookingId from to createdAt isPaid blockId guestId groupIds')
		.lean();

	bookings.forEach(booking => {
		eventEmitter.emit(EVENTS.SEND_BOOKING_CONFIRMATION, booking, { sendAll: true, retry: true });
	});
}

async function updateDayStatus() {
	try {
		// NEWCS
		const filter = {
			// status: BookingStatus.CONFIRMED,
			from: { $gte: new Date().zeroHours() },
			displayToday: false,
		};
		const data = { displayToday: true, display: true };

		await models.Booking.updateMany(filter, data);
		await models.BlockInbox.updateMany(filter, data);
	} catch (e) {
		logger.error(e);
	}
}

async function runJob() {
	try {
		await resendBookingConfirmation(Settings.DelayForReSendAfterIn);
		await resendBookingConfirmation(Settings.DelayForReSendBeforeIn);

		const items = await Promise.all([
			guideC1(Settings.DelayForReCallAfterIn),
			guideC1(Settings.DelayForReCallBeforeIn),
			guideC2(BookingCallStatus.NeedCallForGuide),
			guideC2(BookingCallStatus.NeedCallForConfirmation),
			guideC3(Settings.DelayForReCallAfterIn),
			guideC3(Settings.DelayForReCallBeforeIn),
			guideC4(),
		]);

		const status = {};
		const bookingBulks = [];
		const inboxBulks = [];

		items.forEach(item => {
			item.forEach(data => {
				bookingBulks.push({
					updateOne: {
						filter: {
							_id: data.bookingId,
						},
						update: data.data,
						timestamps: false,
					},
				});
				inboxBulks.push({
					updateOne: {
						filter: {
							bookingId: data.bookingId,
						},
						update: data.data,
						timestamps: false,
					},
				});
				KEYS_STATUS.forEach(key => {
					if (data.data[key] !== undefined) {
						status[key] = status[key] || new Set();
						status[key].add(data.data[key]);
					}
				});
			});
		});

		if (bookingBulks.length) {
			await models.Booking.bulkWrite(bookingBulks);
			await models.BlockInbox.bulkWrite(inboxBulks);

			const arrStatus = [];

			_.forEach(status, (arr, sKey) => {
				_.forEach([...arr], sVal => {
					arrStatus.push({
						[sKey]: sVal,
					});
				});
			});

			eventEmitter.emit(EVENTS.BOOKING_BSTATUS_UPDATED, {}, arrStatus);
		}
	} catch (e) {
		logger.error(e);
	}
}

schedule.scheduleJob('*/5 7-23 * * *', runJob);
schedule.scheduleJob('8 0 * * *', updateDayStatus);

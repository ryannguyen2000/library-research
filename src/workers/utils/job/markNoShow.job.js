const schedule = require('node-schedule');
const moment = require('moment');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { BookingStatus, CanceledByType, BookingStatusCanceled } = require('@utils/const');
const models = require('@models');
const synchronize = require('@controllers/ota_api/synchronize');

const LIMIT = 20;

async function findBookings(filters, page = 1) {
	const skip = (page - 1) * LIMIT;

	const bookings = await models.Booking.find(filters)
		.select('listingId otaBookingId other relativeBookings')
		.skip(skip)
		.limit(LIMIT)
		.populate({
			path: 'listingId',
			select: 'OTAs blockId',
			populate: {
				path: 'blockId',
				select: 'OTAProperties',
			},
		})
		.populate({
			path: 'relativeBookings',
			select: 'status',
		});

	const data = [];

	bookings.forEach(booking => {
		const ota = booking.listingId && booking.listingId.getOTA(filters.otaName);
		if (!ota) {
			logger.error('Mark Noshow - Not found listing', booking.otaBookingId);
			return;
		}
		const property = booking.listingId && booking.listingId.blockId.getPropertyId(filters.otaName, ota.account);
		if (!property) {
			logger.error('Mark Noshow - Not found property', booking.otaBookingId);
			return;
		}

		if (
			booking.relativeBookings &&
			booking.relativeBookings.length &&
			booking.relativeBookings.some(b => !BookingStatusCanceled.includes(b.status))
		) {
			return;
		}

		data.push({
			_id: booking._id,
			account: ota.account,
			propertyId: property.propertyId,
			otaBookingId: booking.otaBookingId,
			rresIds: _.get(booking.other, 'rresIds'),
		});
	});

	const otaConfigs = await models.OTAManager.find({
		active: true,
		name: filters.otaName,
		account: _.uniq(_.map(data, 'account')),
	});
	const otaConfigsObj = _.keyBy(otaConfigs, 'account');

	return {
		data,
		otaConfigs: otaConfigsObj,
		hasNext: bookings.length === LIMIT,
	};
}

async function runCommand(cmdName, filters, onDone) {
	await _.entries(synchronize)
		.filter(([, func]) => func[cmdName])
		.asyncMap(async ([otaName, func]) => {
			const run = async (page = 1) => {
				const { data, otaConfigs, hasNext } = await findBookings({ ...filters, otaName }, page);

				await data.asyncForEach(item => {
					return func[cmdName]({
						...item,
						otaConfig: otaConfigs[item.account],
					})
						.then(() => onDone(item))
						.catch(e => {
							logger.error(cmdName, item, e);
						});
				});

				if (hasNext) {
					await run(page + 1);
				}
			};

			await run();
		});
}

async function startMark() {
	try {
		const today = new Date().zeroHours();
		const prev2Day = moment(today).add(-4, 'day').toDate();

		await runCommand(
			'markNoShow',
			{
				from: { $gte: prev2Day, $lt: today },
				status: [BookingStatus.CANCELED, BookingStatus.CHARGED, BookingStatus.NOSHOW],
				markOnOTA: null,
				'canceledBy.type': { $ne: CanceledByType.OTA },
			},
			item => models.Booking.updateOne({ _id: item._id }, { 'markOnOTA.time': new Date() })
		);
	} catch (e) {
		logger.error('job.startMark', e);
	}
}

async function requestToCancelReservations() {
	try {
		const today = new Date().zeroHours();
		const prev2Day = moment(today).add(4, 'day').toDate();

		await runCommand(
			'requestToCancelReservation',
			{
				from: { $gte: prev2Day },
				status: BookingStatus.CANCELED,
				markOnOTA: null,
				requestToCancel: null,
				'canceledBy.type': { $ne: CanceledByType.OTA },
			},
			item => models.Booking.updateOne({ _id: item._id }, { requestToCancel: new Date() })
		);
	} catch (e) {
		logger.error('job.requestToCancelReservations', e);
	}
}

async function cancelReservations() {
	try {
		const today = new Date().zeroHours();
		const prev2Day = moment(today).add(2, 'day');
		const minDayRequestToCancel = moment().add(-24, 'hour').toDate();

		await runCommand(
			'cancelReservation',
			{
				from: { $gte: prev2Day },
				status: BookingStatus.CANCELED,
				markOnOTA: null,
				requestToCancel: { $lte: minDayRequestToCancel },
			},
			item => models.Booking.updateOne({ _id: item._id }, { 'markOnOTA.time': new Date() })
		);
	} catch (e) {
		logger.error('job.cancelReservations', e);
	}
}

async function startJobs() {
	await startMark();
	await requestToCancelReservations();
	await cancelReservations();
}

schedule.scheduleJob('5 7,23 * * *', startJobs);

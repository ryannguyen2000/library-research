const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { BookingLogs } = require('@utils/const');
const models = require('@models');
const WorkNote = require('@controllers/working/work_note');

async function createHistory({ user, booking, body }) {
	const { description, images, isWorkNote, type } = body;

	const history = await booking.addHistory(
		{
			by: user._id,
			description,
			images,
			isWorkNote,
			noteType: type,
		},
		true
	);

	if (isWorkNote) {
		history.workNote = await models.WorkNote.create({
			blockId: booking.blockId,
			bookingId: booking._id,
			date: new Date(),
			images,
			note: description,
			createdBy: user._id,
			historyId: history._id,
			type,
		});
		await WorkNote.syncProblemStatus(booking._id, user);
	}

	return { history };
}

async function updateHistory({ user, booking, historyId, body }) {
	const userId = user._id;

	const history = booking.findHistory(historyId);
	if (!history || history.isWorkNote || (history.by && !history.by.equals(userId))) {
		throw new ThrowReturn().status(403);
	}

	const data = _.omit(body, ['_id', 'removedBy', 'by', 'createdAt', 'system', 'type']);
	Object.assign(history, data, { updatedBy: userId });

	await booking.save();

	if (data.isWorkNote) {
		history.workNote = await models.WorkNote.create({
			blockId: booking.blockId,
			bookingId: booking._id,
			date: history.createdAt,
			images: history.images,
			note: history.description,
			createdBy: userId,
			type: history.noteType,
			historyId,
		});

		await WorkNote.syncProblemStatus(booking._id, user);
	}

	await models.User.populate(history, {
		path: 'by updatedBy removedBy',
		select: 'name username role',
	});

	return { history };
}

async function removeHistory({ user, booking, historyId }) {
	const userId = user._id;

	const history = booking.findHistory(historyId);
	if (history.by && !history.by.equals(userId)) {
		throw new ThrowReturn().status(403);
	}

	history.removedBy = userId;
	await booking.save();

	await models.User.populate(history, {
		path: 'by updatedBy removedBy',
		select: 'name username role',
	});

	return { history };
}

async function listUpdatedBookings(query, user) {
	const actions = [
		BookingLogs.BOOKING_CANCELED,
		BookingLogs.BOOKING_CHARGED,
		BookingLogs.BOOKING_NOSHOW,
		BookingLogs.BOOKING_SPLIT,
		BookingLogs.BOOKING_UPDATE_CHECKIN,
		BookingLogs.BOOKING_UPDATE_CHECKOUT,
		BookingLogs.PRICE_UPDATE,
		BookingLogs.PRICE_UPDATE_AUTO,
		BookingLogs.FEE_ELECTRIC_UPDATE,
		BookingLogs.FEE_WATER_UPDATE,
		BookingLogs.FEE_SERVICE_UPDATE,
		BookingLogs.FEE_LATE_CHECKOUT,
		BookingLogs.FEE_EARLY_CHECKIN,
		BookingLogs.FEE_ROOM_UPGRADE,
		BookingLogs.FEE_BOOKING,
		BookingLogs.FEE_MANAGEMENT,
		BookingLogs.FEE_EXTRA_PEOPLE,
		BookingLogs.FEE_CHANGE_DATE,
		BookingLogs.FEE_CLEANING,
		BookingLogs.FEE_COMPENSATION,
		BookingLogs.FEE_VAT,
		BookingLogs.FEE_SERVICE,
		BookingLogs.FEE_INTERNET,
		BookingLogs.FEE_MOTOBIKE,
		BookingLogs.FEE_CAR,
		BookingLogs.FEE_LAUNDRY,
		BookingLogs.FEE_DRINK_WATER,
		BookingLogs.FEE_OTA_UPDATE,
		BookingLogs.PREVIOUS_ELECTRIC_QUANTITY,
		BookingLogs.CURRENT_ELECTRIC_QUANTITY,
		BookingLogs.ELECTRIC_PRICE_PER_KWH,
		BookingLogs.PREVIOUS_WATER_QUANTITY,
		BookingLogs.CURRENT_WATER_QUANTITY,
		BookingLogs.DEFAULT_WATER_PRICE,
		BookingLogs.MINIBAR,
	];

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: query.blockId,
		excludeBlockId: query.excludeBlockId,
		roomKey: 'reservateRooms',
	});

	const filter = {
		...filters,
		to: { $gt: new Date(query.from).zeroHours() },
		from: { $lte: new Date(query.to).zeroHours() },
		histories: {
			$elemMatch: {
				action: {
					$in: actions,
				},
				createdAt: { $gte: new Date(query.time) },
			},
		},
	};

	const start = parseInt(query.start) || 0;
	const limit = parseInt(query.limit) || 20;

	const bookings = await models.Booking.find(filter)
		.select('otaName otaBookingId from to price roomPrice')
		.skip(start)
		.limit(limit)
		.lean();
	const total = await models.Booking.countDocuments(filter);

	return {
		data: bookings,
		total,
	};
}

module.exports = {
	createHistory,
	updateHistory,
	removeHistory,
	listUpdatedBookings,
};

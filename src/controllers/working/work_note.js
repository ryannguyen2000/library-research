const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { getArray } = require('@utils/query');
const models = require('@models');
const { ProblemStatus } = require('@utils/const');
const { setBookingStatus } = require('@controllers/booking/newcs');

async function list(bodyQuery, user, otherQuery = null) {
	let { blockId, from, to, status, start, limit, keyword, bookingId } = bodyQuery;

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	const { filters } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockId });

	const $and = [filters];

	if (from || to) {
		from = from && new Date(from).minTimes();
		to = to && new Date(to).maxTimes();

		$and.push({
			$or: _.compact([
				{ date: _.pickBy({ $gte: from, $lte: to }) },
				to && {
					date: { $lte: to },
					status: {
						$in: [
							ProblemStatus.Pending,
							ProblemStatus.Doing,
							ProblemStatus.WaitingForPartnerFix,
							ProblemStatus.DoingManyTimes,
						],
					},
				},
			]),
		});
	}

	const query = {
		...otherQuery,
		$and,
	};
	if (status) {
		query.status = getArray(status);
	}
	if (bookingId) {
		query.bookingId = bookingId;
	}
	if (keyword) {
		query.note = new RegExp(_.escapeRegExp(keyword), 'i');
	}

	const [data, total] = await Promise.all([
		models.WorkNote.find(query)
			.sort({ createdAt: -1 })
			.skip(start)
			.limit(limit)
			.populate('createdBy log.user', 'username name')
			.populate({
				path: 'bookingId',
				select: 'otaName otaBookingId reservateRooms from to checkin checkout guestId price currency numberAdults numberChilden expectCheckIn expectCheckOut',
				populate: {
					path: 'guestId',
					select: 'displayName fullName name avatar',
				},
			})
			.populate('blockId', 'info.name info.shortName')
			.lean(),
		models.WorkNote.countDocuments(query),
	]);

	data.forEach(b => {
		b.roomIds = b.roomIds && b.roomIds.length ? b.roomIds : _.get(b.bookingId, 'reservateRooms');
	});

	await models.Room.populate(data, { path: 'roomIds', select: 'info.roomNo info.name', options: { lean: true } });

	return {
		data,
		total,
	};
}

async function create(note, user) {
	delete note.log;

	const data = await models.WorkNote.create(note);
	await syncBookingHistory(data.bookingId, data.historyId, data, user);
	return data;
}

async function update(id, user, data) {
	const note = await models.WorkNote.findById(id);
	if (!note) throw new ThrowReturn('Note not found!');
	if (note.status === 'closed') throw new ThrowReturn('This note is closed!');

	if (note.bookingId) {
		_.unset(data, 'blockId');
		_.unset(data, 'roomIds');
	}

	const oldData = _.pick(note, _.keys(data));
	Object.assign(note, data);

	note.log.push({ user, date: new Date(), oldData, newData: data });
	await note.save();
	await syncBookingHistory(note.bookingId, note.historyId, data, user);

	return note;
}

async function getBookingIds(bookingId) {
	const booking = await models.Booking.findById(bookingId).select('relativeBookings');
	if (!booking) return [];
	return [booking.id, ...booking.relativeBookings];
}

async function syncBookingHistory(bookingId, historyId, data, user) {
	if (!bookingId && !historyId) return;
	const booking = await models.Booking.findById(bookingId);
	await syncProblemStatus(bookingId);

	if (booking && historyId) {
		const history = booking.findHistory(historyId);
		if (history && history.isWorkNote) {
			Object.assign(history, { description: data.note }, { updateBy: user._id });
			await booking.save();
		}
	}
}

async function syncProblemStatus(bookingId, user) {
	if (!bookingId) return;
	const problemStatus = await models.WorkNote.getStatusByBookingId(bookingId);
	const booking = await models.Booking.findById(bookingId);
	await setBookingStatus(booking, { problemStatus }, user);
}

async function switchStatusForCheckout(bookingId, status = ProblemStatus.CheckoutAndNotDone, user) {
	const { Pending, Doing, DoingManyTimes, WaitingForPartnerFix } = ProblemStatus;
	const bookingIds = await getBookingIds(bookingId);

	await models.WorkNote.updateMany(
		{
			bookingId: bookingIds,
			status: { $in: [Pending, Doing, DoingManyTimes, WaitingForPartnerFix] },
		},
		{
			status,
		}
	);

	await syncProblemStatus(bookingId, user);
}

module.exports = {
	list,
	create,
	update,
	switchStatusForCheckout,
	syncProblemStatus,
};

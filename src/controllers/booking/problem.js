const _ = require('lodash');
const mongoose = require('mongoose');

const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { ProblemStatus } = require('@utils/const');
const { setBookingStatus } = require('./newcs');

async function getBookingIds(bookingId) {
	const booking = await models.Booking.findById(bookingId).select('relativeBookings');
	if (!booking) return [];
	return [booking.id, ...booking.relativeBookings];
}

async function syncProblemStatus(bookingId, user) {
	const problemStatus = await models.BookingProblem.getStatusByBookingId(bookingId);
	const booking = await models.Booking.findById(bookingId);
	await setBookingStatus(booking, { problemStatus }, user);
}

async function switchStatusForCheckout(bookingId, status = ProblemStatus.CheckoutAndNotDone, user) {
	const { Pending, Doing, DoingManyTimes, WaitingForPartnerFix } = ProblemStatus;
	const bookingIds = await getBookingIds(bookingId);

	await models.BookingProblem.updateMany(
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

async function getListByBookingId({ bookingId, ...query }) {
	const start = parseInt(query.start) || 0;
	const limit = parseInt(query.limit) || 20;
	const bookingIds = await getBookingIds(bookingId);
	const filter = { bookingId: bookingIds, deleted: false };

	if (query.status) {
		filter.status = _.isArray(query.status)
			? { $in: _.map(query.status, s => parseInt(s)) }
			: parseInt(query.status);
	}

	const [problems, total] = await Promise.all([
		models.BookingProblem.find(filter)
			.sort({ createdAt: -1 })
			.skip(start)
			.limit(limit)
			.populate('createdBy', 'username name')
			.lean(),
		models.BookingProblem.find(filter).countDocuments(),
	]);
	return { problems, total, start, limit };
}

async function create(body, user) {
	const problem = await models.BookingProblem.create({ ...body, createdBy: user._id });
	await syncProblemStatus(problem.bookingId, user);
	return problem;
}

async function update(problemId, body, user) {
	if (!mongoose.Types.ObjectId.isValid(problemId)) throw new ThrowReturn('ProblemId invalid');
	const problem = await models.BookingProblem.findOne({ _id: problemId, deleted: false });
	if (!problem) throw new ThrowReturn('Problem does not exist');

	Object.assign(problem, _.pick(body, ['status', 'description']));
	await problem.save();
	await syncProblemStatus(problem.bookingId, user);

	return problem;
}

async function remove(problemId, user) {
	if (!mongoose.Types.ObjectId.isValid(problemId)) throw new ThrowReturn('ProblemId invalid');
	const problem = await models.BookingProblem.findOne({ _id: problemId, deleted: false });
	if (!problem) throw new ThrowReturn('Problem does not exist');

	Object.assign(problem, { deleted: true, deletedBy: user._id });
	await problem.save();
	await syncProblemStatus(problem.bookingId, user);
}

module.exports = {
	getListByBookingId,
	create,
	update,
	remove,
	switchStatusForCheckout,
};

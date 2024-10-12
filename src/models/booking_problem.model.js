const mongoose = require('mongoose');
const _ = require('lodash');

const { ProblemStatus } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const BookingProblem = new Schema(
	{
		status: { type: Number, enum: _.values(ProblemStatus) },
		description: String,
		bookingId: { type: ObjectId, ref: 'Booking' },
		messageId: String,
		ottName: String,
		deleted: { type: Boolean, default: false },
		createdBy: { type: ObjectId, ref: 'User' },
		deletedBy: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
	}
);

BookingProblem.statics = {
	async getStatusByBookingId(bookingId) {
		const booking = await this.model('Booking').findById(bookingId).select('relativeBookings');
		const bookingIds = booking ? [booking.id, ...booking.relativeBookings] : [];
		const problems = await this.find({ bookingId: bookingIds, deleted: false }).select('status');
		const rs = _.uniq(_.map(problems, 'status'));
		return rs;
	},
};

module.exports = mongoose.model('BookingProblem', BookingProblem, 'booking_problem');

const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema } = mongoose;

const { ProblemStatus, WORK_NOTE_TYPES } = require('@utils/const');

const { ObjectId, Mixed } = Schema.Types;

const status = _.values(ProblemStatus);

const WorkNoteSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block' },
		bookingId: { type: ObjectId, ref: 'Booking' },
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		date: Date,
		from: Date,
		to: Date,
		note: String,
		images: [String],
		createdBy: { type: ObjectId, ref: 'User' },
		log: [{ user: { type: ObjectId, ref: 'User' }, date: Date, oldData: Mixed, newData: Mixed }],
		status: { enum: status, type: String, default: status[0] },
		historyId: { type: ObjectId },
		type: [{ type: Number, enum: _.values(WORK_NOTE_TYPES) }], // 1: normal, 2: host only
	},
	{ timestamps: true }
);

WorkNoteSchema.statics = {
	async getStatusByBookingId(bookingId) {
		const booking = await this.model('Booking').findById(bookingId).select('relativeBookings');
		const bookingIds = booking ? [booking.id, ...booking.relativeBookings] : [];
		const problems = await this.find({ bookingId: bookingIds }).select('status');
		const rs = _.uniq(_.map(problems, 'status'));
		return rs;
	},
};

module.exports = mongoose.model('WorkNote', WorkNoteSchema, 'work_note');

const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const { TaskStatus, BookingStatus, PayoutSources } = require('@utils/const');

const { Schema, model } = mongoose;

const FormRefundSchema = new Schema(
	{
		bookingId: { type: Schema.Types.ObjectId, required: true },
		phone: { type: String },
		email: { type: String },
		bankAccountHolder: { type: String, required: true },
		bankAccountNumber: { type: String, required: true },
		bankId: { type: Schema.Types.ObjectId, required: true },
		note: { type: String },
	},
	{
		timestamps: true,
	}
);

FormRefundSchema.post('save', async function () {
	await this.createAutoTask();
});

FormRefundSchema.methods = {
	async createAutoTask() {
		const category = await this.model('TaskCategory').getRefund();
		const bookings = await this.model('Booking')
			.find({
				$or: [
					{
						_id: this.bookingId,
					},
					{
						relativeBookings: this.bookingId,
					},
				],
			})
			.select('blockId status otaBookingId otaName');

		const TaskModel = this.model('Task');

		let task = await TaskModel.findOne({
			category: category._id,
			bookingId: { $in: _.map(bookings, '_id') },
			status: { $in: [TaskStatus.Confirmed, TaskStatus.Waiting] },
		});

		if (!task) {
			const booking =
				bookings.find(b => b._id.equals(this.bookingId)) ||
				bookings.find(b => b.status === BookingStatus.CANCELED) ||
				_.last(bookings);

			task = new TaskModel({
				category: category._id,
				departmentId: _.head(category.departmentIds),
				bookingId: booking._id,
				blockId: booking.blockId,
				time: moment().utcOffset(0).hour(new Date().getHours()).toDate(),
				paymentSource: PayoutSources.BANKING,
			});
		}

		task.formRefundId = this._id;
		task.set('other.bankId', this.bankId);
		task.set('other.bankAccountNo', this.bankAccountNumber);
		task.set('other.bankAccountName', this.bankAccountHolder);

		if (this.phone) task.set('other.phone', this.phone);
		if (this.email) task.set('other.email', this.email);
		if (this.note) {
			task.notes.push({
				note: this.note,
			});
		}

		await task.save();
	},
};

const FormRefundModel = model('FormRefund', FormRefundSchema, 'form_refund');

module.exports = FormRefundModel;

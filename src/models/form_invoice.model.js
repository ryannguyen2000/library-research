const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const { BookingStatus, TaskReason } = require('@utils/const');

const { Schema, Custom } = mongoose;

const FormSchema = new Schema(
	{
		bookingCode: [{ type: String, required: true }],
		checkIn: { ...Custom.Schema.Types.Date },
		checkOut: { ...Custom.Schema.Types.Date },
		taxNumber: { type: String, required: true },
		companyName: { type: String, required: true },
		companyAddress: { type: String, required: true },
		email: { ...Custom.Schema.Types.Email, required: true },
		attachments: [{ type: String, required: true }],
		price: Number,
		note: String,
	},
	{
		timestamps: true,
	}
);

FormSchema.post('save', async function () {
	await this.createAutoTask();
});

FormSchema.methods = {
	async createAutoTask() {
		const category = await this.model('TaskCategory').getVAT();
		const bookings = await this.model('Booking')
			.find({ otaBookingId: this.bookingCode, status: BookingStatus.CONFIRMED })
			.select('_id blockId');

		const time = moment().utcOffset(0).hour(new Date().getHours()).toDate();

		await this.model('Task').create({
			category: category._id,
			departmentId: _.head(category.departmentIds),
			blockId: bookings[0].blockId,
			bookingId: bookings.map(b => b._id),
			description: this.note,
			formId: this._id,
			reason: TaskReason.GuestRequest,
			time,
			other: {
				company: this.companyName,
				address: this.companyAddress,
				email: this.email,
				taxNumber: this.taxNumber,
				price: this.price,
			},
			notes:
				(this.attachments && this.attachments.length) || this.note
					? [
							{
								note: this.note,
								createdAt: new Date(),
								images: this.attachments,
							},
					  ]
					: [],
		});
	},
};

const FormInvoiceModel = mongoose.model('FormInvoice', FormSchema, 'form_invoice');
module.exports = FormInvoiceModel;

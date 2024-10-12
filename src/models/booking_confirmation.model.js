const { Schema, model } = require('mongoose');

const MailSchema = new Schema(
	{
		title: String,
		data: Schema.Types.Mixed,
		deleted: { type: Boolean, default: false },
	},
	{
		timestamps: true,
	}
);

const bookingConfirmationSchema = new Schema(
	{
		otaName: String,
		otaBookingId: { type: String, required: true },
		mails: [MailSchema],
	},
	{ timestamps: true }
);

bookingConfirmationSchema.methods = {
	async addReceipt({ title, data }) {
		this.mails.push({ title, data });
		await this.save();
	},
};

module.exports = model('BookingConfirmation', bookingConfirmationSchema, 'booking_confirmation');

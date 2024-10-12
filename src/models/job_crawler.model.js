const mongoose = require('mongoose');

const { Schema } = mongoose;

const JobSchema = new Schema(
	{
		reservationId: String,
		propertyId: String,
		propertyName: String,
		otaName: String,
		from: Date,
		to: Date,
		email: String,
		bookingInfo: {
			guestName: String,
			guestPhone: String,
			guestEmail: String,
			paidType: String,
			amountPayable: String,
			amountToProperty: String,
			commission: String,
			roomNo: String,
		},
		numCrawl: { type: Number, default: 0 },
		canceled: Boolean,
		done: { type: Boolean, default: false },
		timeToStart: { type: Date },
	},
	{ timestamps: true }
);

JobSchema.index({ createdAt: -1 }, { expires: '7d' });

module.exports = mongoose.model('JobCrawler', JobSchema, 'job_crawler');

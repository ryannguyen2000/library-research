const mongoose = require('mongoose');
const { BookingFees } = require('@utils/const');

const { Schema } = mongoose;

const BookingFeeSchema = new Schema(
	{
		type: { type: String, enum: Object.values(BookingFees) },
		value: Number,
		currency: String,
		description: String,
	},
	{ timestamps: true }
);

module.exports = mongoose.model('BookingFee', BookingFeeSchema, 'booking_fee');

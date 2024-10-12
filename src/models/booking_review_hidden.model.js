const mongoose = require('mongoose');

const { Schema } = mongoose;

const BookingReviewHiddenSchema = new Schema(
	{
		reviewId: { type: String, index: true },
		hidden: { type: Boolean, default: true },
		createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
	},
	{ timestamps: true }
);

module.exports = mongoose.model('BookingReviewHidden', BookingReviewHiddenSchema, 'booking_review_hidden');

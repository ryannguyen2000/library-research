const mongoose = require('mongoose');

const { Schema } = mongoose;

const BookingSourceGroup = new Schema(
	{
		name: String,
		label: String,
		description: String,
		order: Number,
		// configs: [
		// 	{
		// 		_id: false,
		// 		blockIds: [{ type: Schema.Types.ObjectId }],
		// 		commission: Number,
		// 		flowObject: String,
		// 		startDate: Date,
		// 		endDate: Date,
		// 	},
		// ],
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('BookingSourceGroup', BookingSourceGroup, 'booking_source_group');

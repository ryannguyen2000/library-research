const mongoose = require('mongoose');

const { Schema } = mongoose;

const OverbookSchema = new Schema(
	{
		bookingId: { type: Schema.ObjectId },
		booking: Schema.Types.Mixed,
		schedulers: [Schema.Types.Mixed],
		canAutoResolve: Boolean,
		swaps: Schema.Types.Mixed,
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Overbook', OverbookSchema, 'overbook');

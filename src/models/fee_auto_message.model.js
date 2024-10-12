const mongoose = require('mongoose');
const _ = require('lodash');

const { EXTRA_FEE } = require('@utils/const');

const { ObjectId } = mongoose.Schema.Types;

const Schema = new mongoose.Schema(
	{
		serviceFeeId: {
			type: ObjectId,
			ref: 'ServiceFee',
		},
		bookingId: {
			type: ObjectId,
			ref: 'Booking',
		},
		type: [{ type: String, enum: [..._.values(EXTRA_FEE), 'Invoice'] }],
		ottName: String,
		ottPhone: String,
		ottId: String,
		messageId: String,
	},
	{
		timestamps: {
			updatedAt: false,
		},
	}
);

Schema.statics = {};

module.exports = mongoose.model('FeeAutoMessage', Schema, 'fee_auto_message');

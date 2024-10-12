const mongoose = require('mongoose');
// const _ = require('lodash');
const { EXTRA_FEE } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		blockIds: [{ type: ObjectId, ref: 'Block' }],
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		serviceTypes: [{ type: String, enum: Object.values(EXTRA_FEE), required: true }],
		// amount: { type: Number },
		formula: { type: String },
		description: String,
		createdBy: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

const ServiceConfigModel = mongoose.model('ServiceFeeConfig', ModelSchema, 'service_fee_config');

module.exports = ServiceConfigModel;

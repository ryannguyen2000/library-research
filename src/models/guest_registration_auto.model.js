const mongoose = require('mongoose');
const { GuestRegisterType } = require('@utils/const');

const { ObjectId } = mongoose.Schema.Types;

const Schema = new mongoose.Schema(
	{
		date: {
			type: String,
			validate: {
				validator(v) {
					return /\d{4}-\d{2}-\d{2}/.test(v);
				},
				message: props => `${props.value} is not valid date with format 'YYYY-MM-DD'`,
			},
		},
		blockId: { type: ObjectId, ref: 'Block' },
		guests: [{ type: ObjectId, ref: 'Guest' }],
		createdBy: { type: ObjectId, ref: 'User' },
		// success: {
		// 	type: Boolean,
		// 	default: true,
		// },
		nationality: { type: String, enum: Object.values(GuestRegisterType) },
		// reason: String,
		isManual: Boolean,
	},
	{
		timestamps: true,
	}
);

Schema.statics = {};

module.exports = mongoose.model('GuestRegistrationAuto', Schema, 'guest_registration_auto');

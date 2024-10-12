// const _ = require('lodash');
const mongoose = require('mongoose');
const { GuestRegisterType, GuestRegisterAccountType } = require('@utils/const');

const Schema = new mongoose.Schema(
	{
		name: { type: String },
		username: { type: String },
		password: { type: String },
		accountType: { type: Number, enum: Object.values(GuestRegisterAccountType) }, // for internal guest type
		nationality: { type: String, enum: Object.values(GuestRegisterType) },
		blockId: { type: mongoose.Types.ObjectId, ref: 'Block' },
		createdBy: { type: mongoose.Types.ObjectId, ref: 'User' },
		isExtCheckout: { type: Boolean },
		active: { type: Boolean, default: true },
		defaultData: {
			province: String,
			district: String,
			ward: String,
			name: String,
			// homeId: String,
			address: String,
			addressType: String,
			accommodationType: String, // TYPE_DORMITORY, TYPE_HOSTEL, TYPE_BUSINESS, TYPE_HEALTHCARE, TYPE_OTHERS, TYPE_HOMESTAY
			accommodationId: String,
			accommodationIndex: Number,
		},
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('GuestRegistrationConfig', Schema, 'guest_registration_config');

const mongoose = require('mongoose');
const _ = require('lodash');

const { OTTs, LANGUAGE, USER_CONTACT_TYPE } = require('@utils/const');

const { Schema } = mongoose;

const GuestV2Schema = new Schema(
	{
		displayName: String,
		taxCode: String,
		represent: String,
		position: String,
		name: String,
		fullName: String,
		searchName: String,
		email: String,
		phone: { type: String, index: true },
		country: String,
		ota: String,
		otaId: String,
		messages: { type: Schema.Types.ObjectId, ref: 'Messages' },
		avatar: String,
		genius: Boolean,
		lang: { type: String, enum: [..._.values(LANGUAGE), null] },
		tags: [String],
		passport: [String],
		passportNumberTime: Date,
		passportNumberAddress: String,
		getPassportType: String, // web, ....
		getPassportTime: Date, // web, ....
		passportNumber: String,
		address: String,
		gender: { type: String, enum: ['male', 'female', 'other', null] },
		dayOfBirth: Date,
		active: { type: Boolean, default: true },
		linkedId: { type: Schema.Types.ObjectId },
		normTargetId: { type: Schema.Types.ObjectId },
		isHost: { type: Boolean },
		userType: { type: String, enum: Object.values(USER_CONTACT_TYPE) },
		ottIds: _.values(OTTs).reduce((acc, cur) => ({ ...acc, [cur]: { type: String, index: true } }), {}),
		otts: [
			{
				_id: false,
				ott: String,
				ottId: String,
				account: String,
			},
		],
		pointInfo: Number,
		addressProvince: String,
		addressDistrict: String,
		addressWard: String,
		hometownProvince: String,
		hometownDistrict: String,
		hometownWard: String,
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
		blockIds: [{ type: Schema.Types.ObjectId, ref: 'Block' }],
		otaIds: [
			{
				_id: false,
				ota: String,
				otaId: String,
			},
		],
		isVip: Boolean,
		histories: [
			{
				description: String,
				images: [String],
				createdAt: Date,
				by: { type: Schema.Types.ObjectId, ref: 'User' },
				removedBy: { type: Schema.Types.ObjectId, ref: 'User' },
			},
		],
		guests: [
			{
				_id: false,
				guestId: { type: Schema.Types.ObjectId, ref: 'Guest' },
				estimate: { type: Boolean, default: false },
				rollbackBy: { type: Schema.Types.ObjectId, ref: 'User' },
			},
		],
		targetId: { type: Schema.Types.ObjectId },
		createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
		autoIndex: false,
	}
);

GuestV2Schema.index({ searchName: 'text' });
GuestV2Schema.index({ createdAt: -1 });

const GuestModelV2 = mongoose.model('GuestV2', GuestV2Schema, 'guest_v2');

module.exports = GuestModelV2;

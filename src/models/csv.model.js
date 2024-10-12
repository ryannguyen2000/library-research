const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const { md5 } = require('@utils/crypto');

const { Schema } = mongoose;

const CSV = new Schema(
	{
		url: { type: String, required: true },
		hash: { type: String },
		data: Schema.Types.Mixed,
		called: { type: Number, default: 0 },
	},
	{ timestamps: true }
);

function checkAddressCode(code) {
	return code === '-1' || code === -1 ? null : code;
}

function getDOB(data) {
	const dobOrigin = data.born || data.dob;
	if (!dobOrigin) return;

	const dob = moment(dobOrigin, 'DD/MM/YYYY');
	if (dob.isValid()) return dob.toDate();

	const dob2 = moment(dobOrigin, 'DD-MM-YYYY');
	if (dob2.isValid()) return dob2.toDate();
}

function getGender(data) {
	let gender = _.toLower(data.sex || data.gender);
	if (!gender) return;

	if (gender === 'nữ') gender = 'female';
	else if (gender === 'nam') gender = 'male';

	return gender;
}

CSV.pre('save', function (next) {
	this.hash = md5(this.url);
	next();
});

CSV.methods = {
	getData() {
		const { data } = this.toJSON();
		if (data) {
			if (data.type === 'passport' && data.data && data.data.surname) {
				data.data.name = `${data.data.surname} ${data.data.given_name}`;
			}
		}
		return data;
	},

	getGuestInfo() {
		const { data } = this;
		if (!data || !data.data) return {};

		return {
			fullName: data.data.full_name || data.data.name,
			name: data.data.given_name || data.data.name,
			passportNumber: data.data.id,
			dayOfBirth: getDOB(data.data),
			gender: getGender(data.data),
			address: data.data.address,
		};
	},

	isValid() {
		return parseInt(_.get(this, 'data.errorCode')) === 0;
	},

	detectAddress() {
		const data = _.get(this, 'data.data') || {};

		const addressProvince = checkAddressCode(data.diachi_tinh || data.address_town_code);
		const addressDistrict = checkAddressCode(data.diachi_huyen || data.address_district_code);
		const addressWard = checkAddressCode(data.diachi_phuong || data.address_ward_code);

		const hometownProvince = checkAddressCode(data.quequan_tinh || data.hometown_town_code);
		const hometownDistrict = checkAddressCode(data.quequan_huyen || data.hometown_district_code);
		const hometownWard = checkAddressCode(data.quequan_phuong || data.hometown_ward_code);

		return {
			addressProvince,
			addressDistrict,
			addressWard,
			hometownProvince,
			hometownDistrict,
			hometownWard,
		};
	},
};

CSV.statics = {
	findByPassport(number) {
		return this.findOne({
			'data.data.id': number,
		});
	},

	findByUrl(url) {
		return this.findOne({
			hash: md5(url),
		});
	},
};

module.exports = mongoose.model('CSV', CSV, 'csv');

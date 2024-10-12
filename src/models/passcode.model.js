const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema } = mongoose;

const PasscodeSchema = new Schema(
	{
		mail_id: String,
		to: { type: String, lowercase: true },
		otaName: String,
		code: String,
	},
	{
		timestamps: true,
	}
);

PasscodeSchema.statics = {
	async findOTP({ otaName, email, time = new Date() }) {
		const OTP_TIMEOUT = 120 * 1000;

		const t1 = Date.now() + OTP_TIMEOUT;

		let pin;

		const filter = {
			// to: new RegExp(_.escapeRegExp(email), 'i'),
			createdAt: { $gte: time },
		};
		if (email) {
			filter.to = new RegExp(_.escapeRegExp(email), 'i');
		}
		if (otaName) {
			filter.otaName = otaName;
		}

		while (!pin) {
			const passcode = await this.findOne(filter).sort({ $natural: -1 });

			pin = passcode && passcode.code;

			if (pin) {
				break;
			}

			if (Date.now() > t1) return Promise.reject(`Get OTP timeout ${email}`);

			await Promise.delay(500);
		}

		return pin;
	},
};

module.exports = mongoose.model('Passcode', PasscodeSchema, 'passcode');

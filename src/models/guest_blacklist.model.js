const _ = require('lodash');
const mongoose = require('mongoose');
const { normPhone } = require('@utils/phone');

const { Schema } = mongoose;

const GuestSchema = new Schema(
	{
		phone: [String],
		passport: [String],
		description: String,
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
	},
	{
		timestamps: true,
	}
);

GuestSchema.pre('save', function () {
	this.phone = _.uniq(_.map(this.phone, normPhone));
});

GuestSchema.statics = {
	getBlacklist({ phone, passportNumber, groupIds }) {
		const query = {};

		if (phone) {
			query.$or = [
				{
					phone: normPhone(phone),
				},
			];
		}
		if (passportNumber) {
			query.$or = query.$or || [];
			query.$or.push({
				passport: passportNumber,
			});
		}

		if (!_.keys(query).length) return null;

		return this.findOne({ ...query });
	},
};

module.exports = mongoose.model('GuestBlacklist', GuestSchema, 'guest_blacklist');

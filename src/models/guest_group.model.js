const mongoose = require('mongoose');
const _ = require('lodash');

const { GUEST_GROUP_KEYS, GUEST_GROUP_LAST_TIME } = require('@utils/const');

const { Schema } = mongoose;

const GuestGroupSchema = new Schema(
	{
		groupKey: { type: String, required: true },
		groupValue: { type: String, required: true },
		total: { type: Number },
		// totalMerged: { type: Number },
		// merged: { type: Boolean, default: false },
		// groupIds: [Schema.Types.ObjectId],
	},
	{
		timestamps: true,
		autoIndex: false,
	}
);

GuestGroupSchema.statics = {
	async syncGroup(key, value) {
		value = _.trim(value);
		if (!value) return;

		const total = await this.model('Guest').countDocuments({
			active: true,
			merged: false,
			[key]: value,
			createdAt: { $lt: GUEST_GROUP_LAST_TIME },
		});

		await this.updateOne(
			{
				groupKey: key,
				groupValue: value,
			},
			{
				$set: {
					total,
				},
			},
			{
				upsert: true,
			}
		);
	},

	async syncGuestIds(guestIds, merged = false) {
		const guests = await this.model('Guest')
			.find({ _id: guestIds, active: true, merged })
			.select(GUEST_GROUP_KEYS.join(' '))
			.lean();

		const bulks = [];

		GUEST_GROUP_KEYS.forEach(groupKey => {
			_.forEach(
				_.groupBy(guests, g => _.trim(g[groupKey])),
				(listGuest, groupValue) => {
					groupValue = _.trim(groupValue);
					if (!groupValue) return;

					bulks.push({
						updateOne: {
							filter: {
								groupKey,
								groupValue,
							},
							update: {
								$inc: {
									total: merged ? -listGuest.length : listGuest.length,
								},
							},
							upsert: true,
						},
					});
				}
			);
		});

		await this.bulkWrite(bulks);
	},
};

const GuestGroup = mongoose.model('GuestGroup', GuestGroupSchema, 'guest_group');

module.exports = GuestGroup;

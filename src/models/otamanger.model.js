const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema } = mongoose;

const OTAManager = new Schema(
	{
		name: String,
		active: { type: Boolean, default: true },
		username: String,
		password: String,
		cookie: String,
		token: String,
		account: String,
		refAccount: String,
		other: Schema.Types.Mixed,
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

OTAManager.statics = {
	findByName(name, account) {
		const query = { name, active: true };
		if (account) {
			query.account = account;
		}
		return this.find(query);
	},

	async findActiveOTAs({ otaName, account, groupIds } = {}) {
		const $match2 = {
			'OTAProperties.account': { $ne: null },
		};
		if (otaName) {
			$match2['OTAProperties.otaName'] = _.isArray(otaName) ? { $in: otaName } : otaName;
		}
		if (account) {
			$match2['OTAProperties.account'] = account;
		}

		const data = await this.model('Block').aggregate([
			{
				$match: {
					active: true,
					isProperty: true,
					isTest: false,
				},
			},
			{ $unwind: '$OTAProperties' },
			{
				$match: $match2,
			},
			{
				$group: {
					_id: '$OTAProperties.account',
					otas: {
						$addToSet: '$OTAProperties.otaName',
					},
				},
			},
		]);

		if (!data.length) return [];

		const filter = {
			active: true,
			$or: data.map(d => ({
				account: d._id,
				name: { $in: d.otas },
			})),
		};

		if (groupIds) {
			filter.groupIds = { $in: groupIds };
		}

		return this.model('OTAManager').find(filter);
	},
};

module.exports = mongoose.model('OTAManager', OTAManager, 'ota');

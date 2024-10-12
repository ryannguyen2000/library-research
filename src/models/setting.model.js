const mongoose = require('mongoose');
const _ = require('lodash');
const ConstSetting = require('@utils/const');
const { Settings } = require('@utils/setting');
const { logger } = require('@utils/logger');

const { Schema } = mongoose;

const SettingSchema = new Schema(
	{
		key: { type: String },
		value: Schema.Types.Mixed,
		description: { type: String },
		title: { type: String },
		conditions: Schema.Types.Mixed,
		readOnly: Boolean,
		groupSeparate: Boolean,
		groupId: { type: Schema.Types.ObjectId, ref: 'UserGroup' },
	},
	{
		versionKey: false,
		timestamps: true,
	}
);

SettingSchema.pre('save', function (next) {
	if (this.value) {
		const sValue = _.get(Settings, [this.key, 'value']);
		if (_.isNumber(sValue)) {
			this.value = Number(this.value);
		}
	}

	next();
});

SettingSchema.post('save', function (doc) {
	const constSettingPath = _.get(Settings[doc.key], 'constSettingPath');
	if (constSettingPath) {
		_.set(ConstSetting, constSettingPath, doc.value);
	}

	_.set(Settings, [doc.key, 'value'], doc.value);
	_.set(Settings, [doc.key, 'updatedAt'], doc.updatedAt);
});

SettingSchema.statics = {
	async getSetting(data) {
		const filter = { key: data.key };
		if (data.groupId) filter.groupId = data.groupId;

		const setting = (await this.findOne(filter)) || (await this.create(data));
		return setting;
	},

	currencyExchange() {
		return this.getSetting(Settings.CurrencyExchange);
	},

	isAutoResolveOverbook() {
		return Settings.AutoResolveOverbook.value;
	},

	initOnAllWorkers: true,

	async initial() {
		try {
			const groups = await this.model('UserGroup').find().select('_id');

			await Object.values(Settings).asyncMap(async setting => {
				const docs =
					setting.groupSeparate && groups.length
						? groups.map(g => ({
								...setting,
								groupId: g._id,
						  }))
						: [setting];

				await docs.asyncMap(async doc => {
					const docSetting = await this.getSetting(doc);

					if (doc.constSettingPath) {
						_.set(ConstSetting, doc.constSettingPath, docSetting.value);
					}

					_.set(Settings, [doc.key, 'value'], docSetting.value);
					_.set(Settings, [doc.key, 'updatedAt'], docSetting.updatedAt);
				});
			});
		} catch (e) {
			logger.error('Setting initial', e);
		}
	},

	async getVATPercent() {
		const vatConfig = await this.getSetting(Settings.VATFee);
		return vatConfig.value / 100;
	},

	async getReportTax(from, to) {
		const setting = await this.getSetting(Settings.TaxReport);

		const current = _.find(setting.conditions, c => (c.from ? c.from <= to : true) && (c.to ? c.to >= from : true));

		return _.get(current, 'value') || setting.value || 0;
	},

	async getZaloDefaultSelectors() {
		const setting = await this.getSetting(Settings.ZaloDefaultSelectors);
		return setting.value;
	},

	async getOwnerNotificationConfig() {
		const setting = await this.getSetting(Settings.OwnerNotificationConfig);
		return setting.value;
	},
};

const Model = mongoose.model('Setting', SettingSchema, 'setting');

module.exports = Model;

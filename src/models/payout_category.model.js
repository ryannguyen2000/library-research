const mongoose = require('mongoose');
const _ = require('lodash');

const { REPORT_GROUP, PayoutType } = require('@utils/const');

const { Schema } = mongoose;

const PayoutCategorySchema = new Schema(
	{
		name: String,
		group: String,
		order: Number,
		reportGroup: { type: String, enum: Object.values(REPORT_GROUP) },
		distribute: { type: Boolean, default: false },
		cost: { type: Boolean, default: true },
		isPayroll: { type: Boolean },
		groupReport: { type: Boolean },
		flowObject: String,
		otaName: String,
		color: String,
		payoutType: { type: String, enum: Object.values(PayoutType) },
		notifications: [
			{
				_id: false,
				conditions: [{ key: String, value: Schema.Types.Mixed }],
				msg: { type: String },
			},
		],
		defaultReportStreams: [
			{
				_id: false,
				blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
				reportStreams: [
					{
						_id: false,
						streamCategoryId: { type: Schema.Types.ObjectId, ref: 'ReportStreamCategory', required: true },
						streamProjectId: { type: Schema.Types.ObjectId, ref: 'ReportStreamCategory', required: true },
						ratio: { type: Number, min: 1, max: 100, required: true },
					},
				],
			},
		],
		departmentIds: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
	},
	{
		timestamps: true,
	}
);

PayoutCategorySchema.methods = {
	findNotificationMsg({ conditions = [] }) {
		let filteredNotifications = this.notifications;
		let currentIndex = 0;

		while (conditions[currentIndex] && filteredNotifications.length > 1) {
			const { key: ckey, value: cvalue } = conditions[currentIndex];

			const newNotifications = filteredNotifications.filter(n =>
				n.conditions.some(c => c.key === ckey && c.value === cvalue)
			);
			if (newNotifications.length) {
				filteredNotifications = newNotifications;
			}

			currentIndex++;
		}

		return _.get(filteredNotifications, [0, 'msg']);
	},
};

PayoutCategorySchema.statics = {
	nonDitrbute() {
		return this.find({ distribute: false, cost: true });
	},
	getAssetPayout() {
		return this.findOne({ reportGroup: REPORT_GROUP.REPAIR });
	},
};

module.exports = mongoose.model('PayoutCategory', PayoutCategorySchema, 'payout_category');

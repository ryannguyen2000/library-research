const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');
const { TaskAutoCreateTimeType, PayoutAutoTypes } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		createdBy: { type: ObjectId, ref: 'User' },
		name: { type: String, required: true },
		description: { type: String },
		payouts: {
			type: [
				{
					_id: false,
					amount: { type: Number },
					vat: { type: Number },
					payAccountId: { type: ObjectId, ref: 'BankAccount' },
					categoryId: { type: ObjectId, ref: 'PayoutCategory' },
					description: { type: String },
					payDescription: { type: String },
					payDebitAccountId: { type: ObjectId, ref: 'BankAccount' },
					blockId: { type: ObjectId, ref: 'Block' },
					taskCategoryId: { type: ObjectId, ref: 'TaskCategory' },
					configValue: { type: String },
				},
			],
			validate: v => Array.isArray(v) && v.length > 0,
		},
		configAccountId: { type: ObjectId, ref: 'AccountConfig' },
		isCreateReport: { type: Boolean, default: true },
		isGroupReport: { type: Boolean, default: false },
		isCreatePayRequest: { type: Boolean, default: false },
		isConfirmedPayRequest: { type: Boolean, default: false },
		autos: {
			type: [
				{
					_id: false,
					type: { type: String, enum: Object.values(TaskAutoCreateTimeType) },
					timeValue: { type: String }, // exam: daily - HH:mm, weekly - d-HH:mm, monthly - D-HH:mm
					addTimeForPeriod: Number,
					addTimeForPeriodReport: Number,
				},
			],
			validate: v => {
				const isArray = Array.isArray(v);
				if (!isArray) return false;

				if (!v.length) return true;

				return v.every(validateTime);
			},
		},
		system: { type: Boolean, default: false },
		imports: {
			url: String,
		},
		type: {
			type: String,
			default: PayoutAutoTypes.CUSTOM,
			enum: Object.values(PayoutAutoTypes),
		},
		payoutConfig: {
			isInternal: Boolean,
			ignoreReport: Boolean,
			buyType: String,
		},
		blockIds: {
			type: [{ type: ObjectId, ref: 'Block' }],
			// validate: v => Array.isArray(v) && v.length > 0,
		},
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		deleted: { type: Boolean, default: false },
		deletedBy: { type: ObjectId, ref: 'User' },
		deletedAt: { type: Date },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

function validateTime({ type, timeValue }) {
	if (!type || !timeValue) return false;

	let format;

	switch (type) {
		case TaskAutoCreateTimeType.MONTHLY:
			format = 'D-HH:mm';
			break;
		case TaskAutoCreateTimeType.WEEKLY:
			format = 'd-HH:mm';
			break;
		case TaskAutoCreateTimeType.DAILY:
			format = 'HH:mm';
			break;
		default:
			format = null;
			break;
	}

	return moment(timeValue, format, true).isValid();
}

ModelSchema.pre('save', function (next) {
	this.autos = _.uniqBy(this.autos, a => a.type + a.timeValue);

	if (this.payouts.some(p => p.blockId)) {
		this.blockIds = _.uniqBy(_.compact(_.map(this.payouts, 'blockId')), _.toString);
	}

	next();
});

ModelSchema.methods = {
	findCond(time) {
		const mtime = moment(time);

		const cond = this.autos.find(
			a =>
				(a.type === TaskAutoCreateTimeType.MONTHLY && a.timeValue === mtime.format('D-HH:mm')) ||
				(a.type === TaskAutoCreateTimeType.WEEKLY && a.timeValue === mtime.format('d-HH:mm')) ||
				(a.type === TaskAutoCreateTimeType.DAILY && a.timeValue === mtime.format('HH:mm'))
		);

		return cond;
	},
};

module.exports = mongoose.model('PayoutAuto', ModelSchema, 'payout_auto');

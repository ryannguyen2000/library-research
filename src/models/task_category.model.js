const _ = require('lodash');
const mongoose = require('mongoose');

const {
	AssetActions,
	TaskTags,
	TaskNotificationType,
	TaskReminderType,
	TaskAutoCreateTimeType,
} = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');

const { ObjectId } = mongoose.Schema.Types;

const Schema = new mongoose.Schema(
	{
		name: String,
		nameEn: String,
		tag: String,
		type: String,
		description: String,
		action: {
			type: String,
			enum: Object.values(AssetActions),
		},
		payoutCategory: {
			type: ObjectId,
			ref: 'PayoutCategory',
		},
		departmentIds: [
			{
				type: ObjectId,
				ref: 'Department',
			},
		],
		parent: { type: ObjectId, ref: 'TaskCategory' },
		order: Number,
		hasCheckList: Boolean,
		roomRequired: Boolean,
		// for notification
		notificationType: {
			type: String,
			enum: [..._.values(TaskNotificationType), null],
		},
		reminder: { type: Boolean },
		reminderType: { type: String, enum: _.values(TaskReminderType) },
		reminderTime: [String], // HH:mm
		reminderNotificationType: {
			type: String,
			enum: [..._.values(TaskNotificationType), null],
		},
		// for automatically creating tasks
		autoCreate: { type: Boolean, default: false },
		autoCreateConfigs: [
			{
				times: [
					{
						time: String,
						day: Number, // day of week
						date: Number,
						month: Number,
						type: { type: String, enum: _.values(TaskAutoCreateTimeType) },
						note: String,
					},
				],
				blockIds: [{ type: ObjectId, ref: 'Block' }],
			},
		],
		notificationMsg: { type: String },
		canCompleteByMessage: { type: Boolean },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

Schema.virtual('subCategories', {
	ref: 'TaskCategory',
	localField: '_id',
	foreignField: 'parent',
});

Schema.methods = {
	isAssetTask() {
		return this.type === 'asset';
	},
	isRefund() {
		return this.tag === TaskTags.REFUND;
	},
	isVAT() {
		return this.tag === TaskTags.VAT;
	},
};

Schema.statics = {
	async modify(_id, data) {
		delete data.tag;
		return await this.findByIdAndUpdate({ _id }, data, { new: true });
	},

	async findByTag(tag) {
		return (await this.findOne({ tag })) || (await this.create({ tag, name: tag }));
	},

	async getTagIds(tags) {
		return this.find({ tag: tags }).then(tgs => tgs.map(t => t._id));
	},

	async findByIdAndValidate(_id) {
		const category = await this.findOne({ _id });
		if (!category) throw new ThrowReturn('Task category not found!');

		return category;
	},

	getVAT() {
		return this.findByTag(TaskTags.VAT);
	},

	getRefund() {
		return this.findByTag(TaskTags.REFUND);
	},

	getCleaning() {
		return this.findByTag(TaskTags.CLEANING);
	},

	getCleaningBack() {
		return this.findByTag(TaskTags.CLEANING_BACK);
	},

	getPCCC() {
		return this.findByTag(TaskTags.PCCC);
	},
};

module.exports = mongoose.model('TaskCategory', Schema, 'task_category');

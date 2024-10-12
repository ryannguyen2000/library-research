const mongoose = require('mongoose');
const { REVENUE_STREAM_TYPES, REVENUE_STREAM_CALC_TYPES, REPORT_STREAM_SOURCES } = require('@utils/const');
const { OPERATORS } = require('@utils/operator');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const BlockConfigSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block', required: true },
		checkListCategoryConfigs: [
			{
				taskCategoryId: { type: ObjectId, ref: 'TaskCategory' },
				checkListCategories: [
					{ checkListCategoryId: { type: ObjectId, ref: 'CheckListCategory' }, order: Number },
				],
			},
		],
		revenueStreams: [
			{
				updatedBy: { type: ObjectId, ref: 'User' },
				source: { type: Number, enum: Object.values(REPORT_STREAM_SOURCES), required: true },
				type: { type: Number, enum: Object.values(REVENUE_STREAM_TYPES), required: true },
				transactions: [
					{
						otaName: [String],
						status: [String],
						streamCategoryId: {
							type: ObjectId,
							ref: 'ReportStreamCategory',
						},
						projectId: {
							type: ObjectId,
							ref: 'ReportStreamCategory',
						},
						startDate: { type: String },
						endDate: { type: String },
						ratio: Number,
						calcType: { type: Number, enum: Object.values(REVENUE_STREAM_CALC_TYPES) },
						description: { type: String },
						fixedRevenue: { type: Number }, // doanh thu mặc định áp dụng cho calcType = 3
						operation: {
							operator: { type: String, enum: Object.values(OPERATORS) },
							values: [Mixed],
						}, // doanh thu mặc định áp dụng cho calcType = 4
					},
				],
			},
		],
	},
	{
		timestamps: true,
	}
);

BlockConfigSchema.statics = {
	async getCheckListCategories(blockId, taskCategoryId) {
		const blockConfig = (await this.findOne({ blockId }).select('checkListCategoryConfigs')) || {};

		if (!blockConfig.checkListCategoryConfigs) return { blockConfig, checkListCategoryConfig: {} };

		const checkListCategoryConfig =
			blockConfig.checkListCategoryConfigs.find(config => config.taskCategoryId.equals(taskCategoryId)) || {};

		return {
			blockConfig,
			checkListCategoryConfig,
		};
	},
};

module.exports = mongoose.model('BlockConfig', BlockConfigSchema, 'block_config');

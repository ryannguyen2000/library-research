const { model, Schema, Types } = require('mongoose');

const { ASSET_ISSUE_TASK_LOGS } = require('@utils/const');

const { ObjectId } = Types;

const AssetIssueTaskSchema = new Schema(
	{
		assetIssueId: { type: ObjectId, ref: 'AssetIssue', required: true },
		taskId: { type: ObjectId, ref: 'Task', required: true },
		deleted: { type: Boolean, default: false },
		histories: [
			{
				description: String,
				action: String,
				createdBy: { type: ObjectId, ref: 'user' },
				createdAt: { type: Date, default: () => new Date() },
			},
		],
	},
	{ timestamps: true }
);

AssetIssueTaskSchema.statics = {
	async add({ assetIssueId, taskId, userId }) {
		const AITask = await this.findOne({ assetIssueId, taskId });

		if (AITask) {
			AITask.deleted = false;
			AITask.histories.push({
				description: 'Restore',
				action: ASSET_ISSUE_TASK_LOGS.RESTORE,
				createdBy: userId,
			});
			return AITask.save();
		}

		return this.create({
			assetIssueId,
			taskId,
			histories: [
				{
					description: 'Create',
					action: ASSET_ISSUE_TASK_LOGS.CREATED,
					createdBy: userId,
				},
			],
		});
	},

	async del({ assetIssueId, taskId, userId }) {
		return this.updateOne(
			{ assetIssueId, taskId },
			{
				deleted: true,
				$push: {
					histories: {
						description: 'Delete',
						action: ASSET_ISSUE_TASK_LOGS.DELETE,
						createdBy: userId,
					},
				},
			}
		);
	},
};

const Model = model('AssetIssueTask', AssetIssueTaskSchema, 'asset_issue_task');
module.exports = Model;

const { model, Schema, Types } = require('mongoose');

const { ASSET_ISSUE_HISTORY_LOGS } = require('@utils/const');

const { ObjectId } = Types;

const AssetIssueHistorySchema = new Schema(
	{
		assetIssueId: { type: ObjectId, ref: 'AssetIssue', required: true },
		historyId: { type: ObjectId, ref: 'History', required: true },
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

AssetIssueHistorySchema.statics = {
	async add({ assetIssueId, historyId, userId }) {
		const AIHistory = await this.findOne({ assetIssueId, historyId });

		if (AIHistory) {
			AIHistory.deleted = false;
			AIHistory.histories.push({
				description: 'Restore',
				action: ASSET_ISSUE_HISTORY_LOGS.RESTORE,
				createdBy: userId,
			});
			return AIHistory.save();
		}

		return this.create({
			assetIssueId,
			historyId,
			histories: [
				{
					description: 'Create',
					action: ASSET_ISSUE_HISTORY_LOGS.CREATED,
					createdBy: userId,
				},
			],
		});
	},

	async del({ assetIssueId, historyId, userId }) {
		return this.updateOne(
			{ assetIssueId, historyId },
			{
				deleted: true,
				$push: {
					histories: {
						description: 'Delete',
						action: ASSET_ISSUE_HISTORY_LOGS.DELETE,
						createdBy: userId,
					},
				},
			}
		);
	},
};

const Model = model('AssetIssueHistory', AssetIssueHistorySchema, 'asset_issue_history');

module.exports = Model;

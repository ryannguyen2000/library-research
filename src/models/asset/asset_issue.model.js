const { Schema, Types, model } = require('mongoose');
const _ = require('lodash');

const {
	ASSET_ISSUE_STATUS,
	ASSET_ISSUE_UNAVAILABLE_STATUS,
	ASSET_ISSUE_SOURCE,
	TaskStatus,
	ASSET_ISSUE_PRIORITY,
	ASSET_ISSUE_LOGS,
} = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const { eventEmitter, EVENTS } = require('@utils/events');
const { logger } = require('@utils/logger');
const { removeAccents } = require('@utils/generate');

const { ObjectId } = Types;

const assetIssueSchema = new Schema(
	{
		no: { type: Number },
		name: { type: String, required: true },
		searchName: String,
		blockId: { type: ObjectId, ref: 'Block', required: true },
		roomId: { type: ObjectId, ref: 'Room' },
		status: { type: String, enum: _.values(ASSET_ISSUE_STATUS), default: ASSET_ISSUE_STATUS.WAITING },
		mergedTo: { type: ObjectId, ref: 'AssetIssue' },
		assets: [{ type: ObjectId, ref: 'AssetActive' }],
		createdBy: { type: ObjectId, ref: 'User' },
		reporter: { type: ObjectId, ref: 'User' },
		kind: { type: ObjectId, ref: 'AssetIssueType', required: true },
		source: { type: String, enum: _.values(ASSET_ISSUE_SOURCE) },
		time: { type: Date, default: () => new Date() },
		priority: { type: Number, enum: _.values(ASSET_ISSUE_PRIORITY), default: ASSET_ISSUE_PRIORITY.NORMAL },
		reason: String,
		histories: [
			{
				description: String,
				action: String,
				createdBy: { type: ObjectId, ref: 'User' },
				createdAt: { type: Date, default: () => new Date() },
			},
		],
	},
	{ timestamps: true }
);

assetIssueSchema.index({ searchName: 'text' });

assetIssueSchema.pre('save', async function (next) {
	if (this.name) {
		this.searchName = removeAccents(this.name);
	}
	if (this.isNew) {
		const last = await Model.findOne().select('no').sort({ createdAt: -1 });
		this.no = _.get(last, 'no', 0) + 1;
	}
	next();
});

assetIssueSchema.methods = {
	async getStatusByTasks() {
		const taskIds = _.map(
			await this.model('AssetIssueTask').find({ assetIssueId: this._id, deleted: false }).select('taskId').lean(),
			'taskId'
		);
		if (!taskIds.length) return ASSET_ISSUE_STATUS.WAITING;

		const statusList = await this.model('Task').getStatusListByTaskIds(taskIds);
		if (!statusList.length) return ASSET_ISSUE_STATUS.WAITING;

		const isProcessing = statusList.some(status =>
			[TaskStatus.Checked, TaskStatus.Waiting, TaskStatus.Confirmed].includes(status)
		);

		return isProcessing ? ASSET_ISSUE_STATUS.PROCESSING : ASSET_ISSUE_STATUS.DONE;
	},

	async syncStatus(taskNo, userId) {
		const newStatus = await this.getStatusByTasks();

		if (this.status !== newStatus) {
			const description = `Status updated by task ${taskNo}: ${this.status} -> ${newStatus}`;
			this.status = newStatus;
			this.addLog({
				description,
				action: ASSET_ISSUE_LOGS.STATUS_UPDATED_BY_TASK,
				userId,
			});
		}
	},

	async addLog({ description, action, userId }) {
		return this.histories.push({ description, action, createdBy: userId });
	},
};

assetIssueSchema.statics = {
	// validate Task and History before adding
	async validate(assetIssueIds = [], data) {
		const roomIds = data.roomIds || [];
		const assetIssues = await Model.find({ _id: assetIssueIds, status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS } })
			.select('blockId roomId')
			.lean();

		let msg = '';
		const isErr = assetIssues.some(assetIssue => {
			if (!assetIssueIds.includes(assetIssue._id.toString())) {
				msg = 'assetIssue does not exist';
				return true;
			}
			if (!assetIssue.blockId.equals(data.blockId)) {
				msg = 'Asset Issue: blockId invalid';
				return true;
			}
			if (assetIssue.roomId && !roomIds.includes(assetIssue.roomId) && roomIds.length) {
				msg = 'Asset Issue: roomId invalid';
				return true;
			}
			return false;
		});

		return { isErr, msg };
	},

	async addTask({ assetIssueId, task, userId, isValidate = true }) {
		const assetIssue = await Model.findOne({
			_id: assetIssueId,
			status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
		});
		if (!assetIssue) throw new ThrowReturn('Asset issue does not exist');

		if (isValidate) {
			const { isErr, msg } = Model.validate([assetIssue], { blockId: task.blockId, roomIds: task.roomIds });
			if (isErr) throw new ThrowReturn(msg);
		}

		await this.model('AssetIssueTask').add({
			assetIssueId: assetIssue._id,
			taskId: task._id,
			userId,
		});

		assetIssue.addLog({
			description: `Add task ${task.no}`,
			action: ASSET_ISSUE_LOGS.ADD_TASK,
			userId,
		});
		await assetIssue.syncStatus(task.no, userId);
		await assetIssue.save();
	},

	async removeTask({ assetIssueId, task, userId }) {
		const assetIssue = await Model.findOne({
			_id: assetIssueId,
			status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
		});

		this.model('AssetIssueTask').del({ assetIssueId, taskId: task._id, userId });
		assetIssue.addLog({
			description: `Remove task ${task.no}`,
			action: ASSET_ISSUE_LOGS.REMOVE_TASK,
			userId,
		});
		await assetIssue.syncStatus(task.no, userId);
		await assetIssue.save();
	},

	async addHistory({ assetIssueId, history, userId, isValidate = true }) {
		const assetIssue = await Model.findOne({
			_id: assetIssueId,
			status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
		});
		if (!assetIssue) throw new ThrowReturn('Asset issue does not exist');
		if (isValidate) {
			const { isErr, msg } = Model.validate([assetIssue], { blockId: history.blockId, roomIds: history.roomIds });
			if (isErr) throw new ThrowReturn(msg);
		}

		await this.model('AssetIssueHistory').add({ assetIssueId: assetIssue._id, historyId: history._id, userId });

		assetIssue.addLog({
			description: `Add history ${history._id}`,
			action: ASSET_ISSUE_LOGS.ADD_HISTORY,
			userId,
		});
		await assetIssue.save();
	},

	async removeHistory({ assetIssueId, history, userId }) {
		this.model('AssetIssueHistory').del({ assetIssueId, historyId: history._id, userId });
		Model.addLog(assetIssueId, {
			description: `Remove history ${history._id}`,
			action: ASSET_ISSUE_LOGS.REMOVE_HISTORY,
			userId,
		});
	},

	async addLog(id, { description, action, userId }) {
		return this.updateOne({ _id: id }, { $push: { histories: { description, action, createdBy: userId } } });
	},

	async getAssetIssueByHistory(historyId) {
		const assetIssueIds = (await this.model('AssetIssueHistory').find({ historyId, deleted: false })).map(
			aih => aih.assetIssueId
		);
		const assetIssues = await Model.find({
			_id: { $in: assetIssueIds },
			status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
		})
			.select('-histories')
			.populate('blockId', 'info.name')
			.populate('roomId', 'info.name info.roomNo')
			.populate('createdBy', 'username name')
			.populate('reporter', 'username name')
			.populate('assets', 'label name')
			.populate('kind')
			.lean();
		return assetIssues;
	},

	async getAssetIssueByTask(taskId) {
		const assetIssueIds = (await this.model('AssetIssueTask').find({ taskId, deleted: false })).map(
			ait => ait.assetIssueId
		);
		const assetIssues = await Model.find({
			_id: { $in: assetIssueIds },
			status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS },
		})
			.select('-histories')
			.populate('blockId', 'info.name')
			.populate('roomId', 'info.name info.roomNo')
			.populate('createdBy', 'username name')
			.populate('reporter', 'username name')
			.populate('assets', 'label name')
			.populate('kind')
			.lean();
		return assetIssues;
	},

	async onUpdateStatus(task, user) {
		try {
			const query = { status: { $nin: ASSET_ISSUE_UNAVAILABLE_STATUS } };
			const assetIssueIds = _.map(
				await this.model('AssetIssueTask')
					.find({ taskId: task._id, deleted: false })
					.select('assetIssueId')
					.lean(),
				'assetIssueId'
			);
			query._id = { $in: assetIssueIds };

			const assetIssues = await Model.find(query);

			if (assetIssues.length) {
				await assetIssues.asyncMap(async assetIssue => {
					const newStatus = await assetIssue.getStatusByTasks();
					if (assetIssue.status !== newStatus) {
						const description = `Status updated by task ${task.no}: ${assetIssue.status} -> ${newStatus}`;
						assetIssue.status = newStatus;
						assetIssue.addLog({
							description,
							action: ASSET_ISSUE_LOGS.STATUS_UPDATED_BY_TASK,
							userId: user._id,
						});
						await assetIssue.save();
					}
				});
			}
		} catch (err) {
			logger.error(err);
		}
	},

	async isInUse(assetIssueId) {
		const assetIssueTask = await this.model('AssetIssueTask')
			.findOne({ assetIssueId, deleted: false })
			.select('_id')
			.lean();

		if (!assetIssueTask) {
			const assetIssueHistory = await this.model('AssetIssueHistory')
				.findOne({ assetIssueId, deleted: false })
				.select('_id')
				.lean();
			return assetIssueHistory ? { isInUse: true, msg: 'Asset issue was added to history' } : { isInUse: false };
		}

		return { isInUse: true, msg: 'Asset issue was added to task' };
	},
};

const Model = model('AssetIssue', assetIssueSchema, 'asset_issue');

eventEmitter.on(EVENTS.ASSET_ISSUE_STATUS_UPDATED, (task, user) => Model.onUpdateStatus(task, user));
module.exports = Model;

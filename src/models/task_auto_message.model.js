const mongoose = require('mongoose');
const { TaskNotificationType } = require('@utils/const');

const { ObjectId, Mixed } = mongoose.Schema.Types;

const Schema = new mongoose.Schema(
	{
		notificationType: {
			type: String,
			enum: Object.values(TaskNotificationType),
		},
		taskId: {
			type: ObjectId,
			ref: 'Task',
		},
		checkItemId: {
			type: ObjectId,
			ref: 'CheckItem',
		},
		blockId: {
			type: ObjectId,
			ref: 'Block',
		},
		roomIds: [
			{
				type: ObjectId,
				ref: 'Room',
			},
		],
		ottName: String,
		ottPhone: String,
		ottId: String,
		toOttId: String,
		messageId: String,
		qMsgId: String,
		messageTime: { type: Date, default: () => new Date() },
		attachment: Boolean,
		response: [Mixed],
		type: String,
		phase: String,
		isEndPhase: { type: Boolean, default: false },
	},
	{
		timestamps: {
			updatedAt: false,
		},
	}
);

Schema.statics = {};

module.exports = mongoose.model('TaskAutoMessage', Schema, 'task_auto_message');

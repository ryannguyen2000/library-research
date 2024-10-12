const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const WCSchema = new Schema(
	{
		userId: { type: ObjectId, ref: 'User', required: true },
		date: { type: String, required: true },
		note: String,
		times: [
			{
				_id: false,
				start: { type: String, required: true },
				end: { type: String, required: true },
			},
		],
		blockIds: [{ type: ObjectId, ref: 'Block' }],
	},
	{ timestamps: true }
);

module.exports = mongoose.model('WorkSchedule', WCSchema, 'work_schedule');

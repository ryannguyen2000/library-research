const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const JobSchema = new Schema(
	{
		acceleratorId: { type: ObjectId, ref: 'Accelerator' },
		from: { type: String },
		to: { type: String },
		ota: { type: String },
		done: { type: Boolean, default: false },
		numRun: { type: Number, default: 0 },
		numRetry: { type: Number, default: 0 },
	},
	{ timestamps: true }
);

JobSchema.index({ createdAt: -1 }, { expires: '14d' });

module.exports = mongoose.model('JobAccelerator', JobSchema, 'job_accelerator');

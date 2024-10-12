const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const DeSchema = new mongoose.Schema(
	{
		name: { type: String },
		createdBy: { type: ObjectId, ref: 'User' },
		leaders: [String], // role - leader this department
		roles: [String], // roles in this department
		config: {
			zalo: { generalEnable: { type: Boolean, default: false } },
		},
	},
	{ timestamps: true }
);

DeSchema.virtual('users', {
	ref: 'User',
	localField: '_id',
	foreignField: 'departmentIds',
});

module.exports = mongoose.model('Department', DeSchema, 'department');

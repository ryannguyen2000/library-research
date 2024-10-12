const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new mongoose.Schema(
	{
		name: { type: String },
		taskCategoryIds: [{ type: ObjectId, ref: 'TaskCategory' }],
		description: String,
		default: { type: Boolean, default: false },
		order: Number,
		defaultLabel: String,
	},
	{ timestamps: true }
);

const Model = mongoose.model('CheckListCategory', ModelSchema, 'check_list_category');
module.exports = Model;

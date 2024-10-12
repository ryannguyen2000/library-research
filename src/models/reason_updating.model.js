const mongoose = require('mongoose');
const { REASON_UPDATING_TYPE } = require('@utils/const');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		label: { type: String, required: true },
		description: { type: String },
		type: { type: String, enum: Object.values(REASON_UPDATING_TYPE) },
		parentId: { type: Schema.Types.ObjectId, ref: 'ReasonUpdating' },
		selectable: Boolean,
		noteRequired: Boolean,
		order: Number,
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

ModelSchema.virtual('childrens', {
	ref: 'ReasonUpdating',
	localField: '_id',
	foreignField: 'parentId',
});

module.exports = mongoose.model('ReasonUpdating', ModelSchema, 'reason_updating');

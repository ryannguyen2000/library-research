const mongoose = require('mongoose');
const { LAYOUT_VIEW_TYPE, LAYOUT_TYPE } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const BlockLayoutSchema = new Schema(
	{
		name: String,
		description: Mixed,
		order: Number,
		viewType: { type: String, enum: Object.values(LAYOUT_VIEW_TYPE) },
		layoutType: { type: String, enum: Object.values(LAYOUT_TYPE), required: true },
		blockId: { type: ObjectId, ref: 'Block' },
		parentId: { type: ObjectId, ref: 'BlockLayout' },
		roomId: { type: ObjectId, ref: 'Room' },
		refId: { type: String },
		// custom style
		background: String,
		border: String,
	},
	{
		timestamps: true,
		id: false,
		versionKey: false,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

BlockLayoutSchema.virtual('layouts', {
	ref: 'BlockLayout',
	localField: '_id',
	foreignField: 'parentId',
	justOne: false,
});

BlockLayoutSchema.statics = {
	async findOrCreate(data) {
		return (
			(await this.findOne({ blockId: data.blockId, layoutType: data.layoutType })) || (await this.create(data))
		);
	},
};

module.exports = mongoose.model('BlockLayout', BlockLayoutSchema, 'block_layout');

const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const AssetConfirmationSchema = new Schema(
	{
		name: String,
		description: String,
		blockId: {
			ref: 'Block',
			required: true,
			type: ObjectId,
		},
		createdBy: {
			ref: 'User',
			type: ObjectId,
		},
		approved: [
			{
				time: Date,
				userId: {
					ref: 'User',
					type: ObjectId,
				},
			},
		],
	},
	{ timestamps: true }
);

const AssetConfirmation = mongoose.model('AssetConfirmation', AssetConfirmationSchema, 'asset_confirmation');

module.exports = AssetConfirmation;

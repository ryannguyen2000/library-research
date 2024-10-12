const mongoose = require('mongoose');

const Asset = require('./asset.model');

const { Schema } = mongoose;

const AssetActiveSchema = Asset.Asset.clone();

AssetActiveSchema.add(
	new mongoose.Schema(
		{
			confirmationId: { ref: 'AssetConfirmation', type: Schema.Types.ObjectId },
			nameEn: String,
			labelEn: String,
		},
		{
			timestamps: true,
		}
	)
);

const AssetActive = mongoose.model('AssetActive', AssetActiveSchema, 'asset_active');

module.exports = AssetActive;

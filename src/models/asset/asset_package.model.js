const mongoose = require('mongoose');

const { Custom } = mongoose;

const AssetPackageSchema = new Custom.Schema(
	{
		name: String,
		description: String,
		assets: [
			{
				kindId: Custom.Ref({
					ref: 'AssetKind',
					required: true,
					index: true,
					virtual: 'kinds',
				}),
				label: { type: String, required: true },
			},
		],
	},
	{
		timestamps: true,
	}
);

const AssetPackage = mongoose.model('AssetPackage', AssetPackageSchema, 'asset_package');

module.exports = AssetPackage;

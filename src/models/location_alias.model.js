const mongoose = require('mongoose');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		_id: { type: Number },
		id: { type: Number },
		displayText: {
			vi: String,
			en: String,
		},
		alias: String,
		count: { type: Number, default: 0 },
		roomCount: { type: Number, default: 0 },
		type: { type: String },
		propertyType: { type: Schema.Types.Mixed },
		roomOfPropertyType: { type: Schema.Types.Mixed },
		businessService: { type: Schema.Types.Mixed },
		roomOfBusinessService: { type: Schema.Types.Mixed },
		locId: { type: Number },
		searchCount: { type: Number },
		province: { type: Number, ref: 'Province' },
		district: { type: Number, ref: 'District' },
		ward: { type: Number, ref: 'Ward' },
		street: { type: Number, ref: 'Street' },
	},
	{
		timestamps: false,
		versionKey: false,
	}
);

ModelSchema.index(
	{
		type: 1,
		locId: 1,
	},
	{
		unique: true,
	}
);

ModelSchema.index({
	'displayText.en': 'text',
	alias: 'text',
});

const LocModal = mongoose.model('LocationAlias', ModelSchema, 'location_alias');

module.exports = LocModal;

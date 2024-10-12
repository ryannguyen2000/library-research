const mongoose = require('mongoose');
const _ = require('lodash');
const { AssetDefaultAttrs } = require('@utils/const');

const { Custom } = mongoose;

const options = { discriminatorKey: 'type' };

const AssetAttributeSchema = new Custom.Schema(
	{
		name: String,
		description: String,
		isDefault: Boolean,
		type: {
			type: String,
			enum: ['String', 'Number', 'Url', 'Images', 'Date', 'Time', 'DateTime'],
		},
	},
	{
		_id: false,
		...options,
	}
);

const AssetKindSchema = new Custom.Schema(
	{
		name: String,
		nameEn: String,
		description: String,
		attributes: [AssetAttributeSchema],
	},
	{
		timestamps: true,
	}
);

AssetKindSchema.pre('save', function (next) {
	const defaultAttrs = _.cloneDeep(AssetDefaultAttrs);
	if (!this.attributes) this.attributes = defaultAttrs;
	else {
		defaultAttrs.forEach(ada => {
			const att = this.attributes.some(a => a.name === ada.name);
			if (att) {
				att.isDefault = true;
			} else {
				this.attributes.push(ada);
			}
		});
		this.attributes.sort((a, b) => {
			const f = !!b.isDefault - !!a.isDefault;
			if (f === 0)
				return defaultAttrs.findIndex(d => d.name === a.name) - defaultAttrs.findIndex(d => d.name === b.name);
			return f;
		});
	}
	next();
});

const AssetKind = mongoose.model('AssetKind', AssetKindSchema, 'asset_kind');

AssetKind.Attribute = AssetAttributeSchema;
module.exports = AssetKind;

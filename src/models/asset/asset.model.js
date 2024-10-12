const mongoose = require('mongoose');
const AssetKind = require('./asset_kind.model');

const { Custom } = mongoose;
const { ObjectId } = mongoose.Schema.Types;

const AssetSchema = new Custom.Schema(
	{
		kindId: {
			ref: 'AssetKind',
			required: true,
			virtual: 'kind',
			index: true,
			type: ObjectId,
		},
		name: String,
		nameEn: String,
		label: { type: String, required: true },
		labelEn: String,
		attributes: [{ type: AssetKind.Attribute, index: true }],
		order: Number,
		blockId: Custom.Ref({
			ref: 'Block',
			required: true,
			virtual: 'block',
			index: true,
		}),
		roomId: Custom.Ref({ ref: 'Room', virtual: 'room', index: true }),
	},
	{
		timestamps: true,
	}
);

AssetSchema.pre('save', async function (doc) {
	if (!doc.name) {
		// nếu không khai báo tên thì lấy tên của loại đồ vật
		doc.name = await AssetKind.findById(doc.kindId)
			.select('name')
			.then(k => (k && k.name) || '');
	}
});

const attrs = AssetSchema.path('attributes');

// prettier-ignore
const AttributeNumber = attrs.discriminator(
	'Number', 
	new Custom.Schema({ value: Number }, { _id: false })
);

// prettier-ignore
const AttributeString = attrs.discriminator(
	'String', 
	new Custom.Schema({ value: String }, { _id: false })
);

// prettier-ignore
const AttributeDate = attrs.discriminator(
	'Date', 
	new Custom.Schema({ value: Custom.Schema.Types.Date }, { _id: false })
);

const AttributeDateTime = attrs.discriminator(
	'DateTime',
	new Custom.Schema({ value: Custom.Schema.Types.DateTime }, { _id: false })
);

// prettier-ignore
const AttributeTime = attrs.discriminator(
	'Time', 
	new Custom.Schema({ value: Custom.Schema.Types.Time }, { _id: false })
);

// prettier-ignore
const AttributeUrl = attrs.discriminator('Url', 
	new Custom.Schema({ value: Custom.Schema.Types.Url }, { _id: false })
);

// prettier-ignore
const AttributeImages = attrs.discriminator(
	'Images', new Custom.Schema({ value: [Custom.Schema.Types.Url] }, { _id: false })
);

const Asset = mongoose.model('Asset', AssetSchema, 'asset');

Asset.Asset = AssetSchema;
Asset.Attribute = AssetKind.Attribute;
Asset.AttributeNumber = AttributeNumber;
Asset.AttributeString = AttributeString;
Asset.AttributeDate = AttributeDate;
Asset.AttributeDateTime = AttributeDateTime;
Asset.AttributeTime = AttributeTime;
Asset.AttributeUrl = AttributeUrl;
Asset.AttributeImages = AttributeImages;

module.exports = Asset;

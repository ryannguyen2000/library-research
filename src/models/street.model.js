const mongoose = require('mongoose');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		_id: { type: Number },
		districtId: { type: Number, ref: 'District', required: true, index: true },
		name: { type: String, required: true },
		slug: { type: String, unique: true, required: true },
		alias: String,
		description: String,
		// createdBy: { type: Schema.Types.ObjectId, ref: MODELS.USER.name },
	},
	{
		timestamps: false,
		versionKey: false,
		toObject: {
			virtuals: true,
		},
		toJSON: {
			virtuals: true,
		},
	}
);

module.exports = mongoose.model('Street', ModelSchema, 'street');

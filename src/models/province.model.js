// const _ = require('lodash');
const mongoose = require('mongoose');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		_id: { type: Number },
		id: { type: Number },
		countryId: { type: Number },
		name: String,
		alias: String,
		code: String,
		description: String,
		slug: { type: String, unique: true },
		location: {
			type: {
				type: String,
				enum: ['Point'],
			},
			coordinates: [Number],
		},
		boundaries: {
			type: {
				type: String,
				enum: ['Polygon'],
			},
			coordinates: [[[Number, Number]]],
		},
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

ModelSchema.virtual('districts', {
	ref: 'District',
	localField: '_id',
	foreignField: 'provinceId',
});

module.exports = mongoose.model('Province', ModelSchema, 'province');

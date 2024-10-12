const mongoose = require('mongoose');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		_id: { type: Number },
		id: { type: Number },
		provinceId: { type: Number, ref: 'Province' },
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

ModelSchema.virtual('wards', {
	ref: 'Ward',
	localField: '_id',
	foreignField: 'districtId',
});

module.exports = mongoose.model('District', ModelSchema, 'district');

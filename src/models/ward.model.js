const mongoose = require('mongoose');

const { Schema } = mongoose;

const ModelSchema = new Schema(
	{
		_id: { type: Number },
		id: { type: Number },
		districtId: { type: Number, ref: 'District' },
		name: String,
		code: String,
		alias: String,
		prefix: String,
		slug: { type: String, unique: true },
		description: String,
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

ModelSchema.virtual('fullName').get(function () {
	return `${this.prefix ? `${this.prefix} ` : ''}${this.name}`;
});

module.exports = mongoose.model('Ward', ModelSchema, 'ward');

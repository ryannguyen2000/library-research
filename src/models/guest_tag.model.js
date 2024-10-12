const mongoose = require('mongoose');
// const { GuestTag } = require('@utils/const');

const { Schema } = mongoose;

const GuestTagSchema = new Schema(
	{
		name: { type: String, required: true, unique: true },
		type: String,
	},
	{
		timestamps: true,
	}
);

const Model = mongoose.model('GuestTag', GuestTagSchema, 'guest_tag');

// Model.insertMany(Object.values(GuestTag).map(name => ({ name }))).catch(() => {});

module.exports = Model;

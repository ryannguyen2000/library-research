const mongoose = require('mongoose');

const { Schema } = mongoose;

const FormSchema = new Schema(
	{
		phone: { type: String, required: true },
		name: { type: String, required: true },
		note: String,
		sentTime: Date,
	},
	{
		timestamps: true,
	}
);

const FormCoopModel = mongoose.model('FormCoop', FormSchema, 'form_coop');

module.exports = FormCoopModel;

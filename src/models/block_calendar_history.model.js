const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block' },
		roomType: { type: String, required: true },
		date: { type: String }, // Y-MM-DD
		available: Number,
		price: Number,
		promotionPrice: Number,
		otas: [
			{
				_id: false,
				ota: String,
				price: Number,
			},
		],
		time: String, // Y-MM-DD-HH
	},
	{
		timestamps: false,
		versionKey: false,
		autoIndex: false,
	}
);

ModelSchema.index({ blockId: 1 });
ModelSchema.index({ date: 1 });

module.exports = mongoose.model('BlockCalendarHistory', ModelSchema, 'block_calendar_history');

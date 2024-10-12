const mongoose = require('mongoose');

const { Schema } = mongoose;

const EquipmentTypeSchema = new Schema(
	{
		name: String,

		unit: { type: String, required: false },
		unitPrice: { type: Number, required: false },

		childUnit: { type: String, required: true },
		childUnitPrice: { type: Number, required: true },

		childMultiply: { type: Number, required: false },
		supplier: String,

		groupId: { type: Schema.Types.ObjectId, ref: 'UserGroup' },
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('EquipmentType', EquipmentTypeSchema, 'equipment_type');

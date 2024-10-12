const mongoose = require('mongoose');
const { EquipmentInStoreTypeSchema } = require('../equipment.schema');

const { Schema } = mongoose;

// Yêu cầu (Form)
function EquipmentRequestForm(EquipmentForm) {
	const newEquipmentRequestForm = EquipmentForm.discriminator(
		'EquipmentRequestForm',
		new Schema(
			{
				// ghi đè cái equipments có thêm từng `blockId` cho từng equipment
				equipments: {
					type: [EquipmentInStoreTypeSchema],
					validate: async equipments => EquipmentInStoreTypeSchema.validateEquipments(equipments),
				},
			},
			{
				timestamps: true,
			}
		),
		'Request'
	);

	return newEquipmentRequestForm;
}

module.exports = EquipmentRequestForm;

const mongoose = require('mongoose');
const { EquipmentInStoreTypeSchema } = require('../equipment.schema');

const { Schema } = mongoose;

// Yêu cầu (Form)
function EquipmentImportForm(EquipmentForm) {
	const newEquipmentImportForm = EquipmentForm.discriminator(
		'EquipmentImportForm',
		new Schema(
			{
				// ghi đè cái equipments có thêm từng `storeId` cho từng equipment
				equipments: {
					type: [EquipmentInStoreTypeSchema],
					validate: async equipments => EquipmentInStoreTypeSchema.validateEquipments(equipments),
				},
			},
			{
				timestamps: true,
			}
		),
		'Import'
	);

	return newEquipmentImportForm;
}

module.exports = EquipmentImportForm;

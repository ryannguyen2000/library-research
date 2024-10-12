// const { Schema } = require('mongoose');

// const { Types } = Schema;

// // Kiểm đếm từng store
// module.exports = EquipmentForm =>
// 	EquipmentForm.discriminator(
// 		'EquipmentCountingForm',
// 		new Schema({
// 			storeId: { type: Types.ObjectId, ref: 'EquipmentStore' },
// 		}),
// 		'Counting'
// 	);

const mongoose = require('mongoose');
const { EquipmentInStoreTypeSchema } = require('../equipment.schema');

const { Schema } = mongoose;

function createEquipmentCountingForm(EquipmentForm) {
	const EquipmentCountingForm = EquipmentForm.discriminator(
		'EquipmentCountingForm',
		new Schema(
			{
				equipments: {
					type: [EquipmentInStoreTypeSchema],
					validate: async equipments => EquipmentInStoreTypeSchema.validateEquipments(equipments),
				},
			},
			{
				timestamps: true,
			}
		),
		'Counting'
	);

	return EquipmentCountingForm;
}

module.exports = createEquipmentCountingForm;

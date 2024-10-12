const { Schema } = require('mongoose');

const { Types } = Schema;

// Chuyển thiết bị từ nhà này qua nhà khác
module.exports = EquipmentForm =>
	EquipmentForm.discriminator(
		'EquipmentTransferForm',
		new Schema(
			{
				fromStoreId: { type: Types.ObjectId, ref: 'EquipmentStore' },
				toStoreId: { type: Types.ObjectId, ref: 'EquipmentStore' },
			},
			{
				timestamps: true,
			}
		),
		'Transfer'
	);

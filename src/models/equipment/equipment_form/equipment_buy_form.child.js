const { Schema } = require('mongoose');

const { Types } = Schema;

// Mua hàng
function EquipmentBuyForm(EquipmentForm) {
	return EquipmentForm.discriminator(
		'EquipmentBuyForm',
		new Schema(
			{
				requestIds: [{ type: Types.ObjectId, ref: 'EquipmentRequestForm' }],
				billImage: [String],
			},
			{
				timestamps: true,
			}
		),
		'Buy'
	);
}

module.exports = EquipmentBuyForm;

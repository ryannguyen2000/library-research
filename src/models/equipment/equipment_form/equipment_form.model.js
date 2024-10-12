const mongoose = require('mongoose');
const EquipmentSchema = require('../equipment.schema');

const { Schema, Custom } = mongoose;

const options = { discriminatorKey: '__t' };

const EquipmentFormSchema = new Schema(
	{
		name: String,
		description: String,
		createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
		approved: {
			date: Date,
			userId: { type: Schema.Types.ObjectId, ref: 'User' },
		},
		equipments: [EquipmentSchema],
		forMonth: {
			type: String,
			validate: {
				validator: v => /^\d{4}-\d{2}$/.test(v),
				message: props => `\`${props.value}\` is not a valid format \`YYYY-MM\``,
			},
			required: true,
		},
		actionAt: Custom.Schema.Types.Date,
		groupId: { type: Schema.Types.ObjectId, ref: 'UserGroup' },
	},
	{
		...options,
		timestamps: true,
	}
);
EquipmentFormSchema.methods = {
	async setApproveAsync(userId) {
		this.approved = { userId, date: Date.now() };
		return await this.save();
	},
	isApproved() {
		return this.approved && this.approved.userId;
	},
};

// validate `equipments` in form
EquipmentFormSchema.path('equipments').validate(async equipments => {
	return await EquipmentSchema.validateEquipments(equipments); //
});

const EquipmentForm = mongoose.model('EquipmentForm', EquipmentFormSchema, 'equipment_form');

Object.assign(EquipmentForm, {
	EquipmentRequestForm: require('./equipment_request_form.child')(EquipmentForm),
	EquipmentBuyForm: require('./equipment_buy_form.child')(EquipmentForm),
	EquipmentImportForm: require('./equipment_import_form.child')(EquipmentForm),
	EquipmentTransferForm: require('./equipment_transfer_form.child')(EquipmentForm),
	EquipmentCountingForm: require('./equipment_counting_form.child')(EquipmentForm),
});

module.exports = EquipmentForm;

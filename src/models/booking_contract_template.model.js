const { ContractType } = require('@src/utils/const');
const mongoose = require('mongoose');

const { Schema } = mongoose;

const BookingContractTemplateSchema = new Schema(
	{
		blockIds: [{ type: Schema.Types.ObjectId, ref: 'Block' }],
		path: String,
		name: String,
		contractType: { type: Number, enum: Object.values(ContractType), default: ContractType.Person },
		sheets: [
			{
				sheetName: { type: String },
				cells: [
					{
						cell: { type: String },
						value: { type: String },
					},
				],
			},
		],
	},
	{
		timestamps: true,
	}
);

module.exports = mongoose.model('BookingContractTemplate', BookingContractTemplateSchema, 'booking_contract_template');

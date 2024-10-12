const mongoose = require('mongoose');
const { INVOICE_STATUS } = require('@utils/const');

const { Schema } = mongoose;

const Invoice = new Schema(
	{
		iKey: { type: String, required: true, unique: true },
		taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
		status: { type: String, enum: Object.values(INVOICE_STATUS) },
		createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
		deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
		deletedAt: { type: Date },
		invoice: Schema.Types.Mixed,
		amount: Number,
		vatRate: Number,
	},
	{ timestamps: true }
);

module.exports = mongoose.model('Invoice', Invoice, 'invoice');

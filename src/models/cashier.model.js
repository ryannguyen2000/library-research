const mongoose = require('mongoose');
const { CASHIER_TYPE, Currency } = require('@utils/const');

const { Schema } = mongoose;

const CashierSchema = new Schema(
	{
		name: { type: String },
		blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
		type: { type: String, enum: Object.values(CASHIER_TYPE), default: CASHIER_TYPE.CASH },
		currency: [{ type: String }],
		active: { type: Boolean, default: true },
	},
	{ timestamps: true }
);

CashierSchema.statics = {
	async findOrCreate({ cashierId, blockId }) {
		if (cashierId) {
			return this.find({ _id: cashierId, active: true });
		}

		const cashiers = await this.find({ blockId });
		if (cashiers.length) return cashiers.filter(c => c.active);

		return Object.values(CASHIER_TYPE).asyncMap((type, index) =>
			this.create({
				blockId,
				type,
				name: `Cash ${index + 1}`,
				currency: type === CASHIER_TYPE.CURRENCY_EXCHANGE ? [Currency.USD] : [],
			})
		);
	},
};

module.exports = mongoose.model('Cashier', CashierSchema, 'cashier');

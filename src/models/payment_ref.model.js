const mongoose = require('mongoose');
const _ = require('lodash');
const { customAlphabet } = require('nanoid');

const { Platform, Currency, ThirdPartyPaymentStatus, ThirdPartyPayment, PAYMENT_REF_LENGTH } = require('@utils/const');

const nanoid = customAlphabet('0123456789ABCDEFabcdef', PAYMENT_REF_LENGTH);

const { Schema } = mongoose;

const PaymentRefSchema = new Schema(
	{
		ref: { type: String, unique: true },
		refOrderId: String,
		method: String,
		amount: Number,
		bankCode: String,
		currency: { type: String, default: Currency.VND },
		description: String,
		status: { default: ThirdPartyPaymentStatus.WAITING, type: String, enum: _.values(ThirdPartyPaymentStatus) }, // waiting, success, fail...
		otaBookingId: String,
		otaName: String,
		transactionNo: String,
		isRefund: { type: Boolean, default: false },
		platform: { type: String, default: Platform.Web },
		data: Schema.Types.Mixed,
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
		blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
		createdBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
		},
		qrCode: String,
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
	}
);

PaymentRefSchema.index({ createdAt: -1 });

PaymentRefSchema.virtual('booking', {
	ref: 'Booking',
	localField: 'otaBookingId',
	foreignField: 'otaBookingId',
	justOne: true,
});

PaymentRefSchema.statics = {
	async createRefID() {
		const newRef = nanoid();
		const last = await this.findOne({ ref: newRef });
		if (last) return this.createRefID();
		return newRef;
	},

	async createRef(data) {
		const ref = await this.createRefID();
		return this.create({
			ref,
			...data,
		});
	},

	async getReports(query, user) {
		let { start, limit, from, to, type, ...filter } = query;

		if (from) {
			_.set(filter, 'createdAt.$gte', new Date(from));
		}
		if (to) {
			_.set(filter, 'createdAt.$lte', new Date(to));
		}
		if (type) {
			filter.isRefund = type === 'refund';
		}
		if (user) {
			const { blockIds } = await this.model('Host').getBlocksOfUser({ user });
			filter.$or = [
				{
					groupIds: { $in: user.groupIds },
				},
				{
					blockId: { $in: blockIds },
				},
			];
		}

		// filter = _.pickBy(filter);

		const [data, total, totalAmount] = await Promise.all([
			this.find(filter)
				.select('-data')
				.sort({ createdAt: -1 })
				.skip(start)
				.limit(limit)
				.populate('booking', '_id status from to'),
			this.countDocuments(filter),
			this.aggregate()
				.match(filter)
				.group({ _id: null, amount: { $sum: '$amount' } }),
		]);

		return { data, total, totalAmount: _.get(totalAmount, [0, 'amount'], 0), methods: _.values(ThirdPartyPayment) };
	},
};

module.exports = mongoose.model('PaymentRef', PaymentRefSchema, 'payment_ref');

const mongoose = require('mongoose');
const _ = require('lodash');
// const moment = require('moment');
const {
	Currency,
	HANDOVER_STATUS,
	CASHIER_TYPE,
	PayoutCollectStatus,
	PayoutType,
	// OTAsHavePrePaid,
	// PayoutStates,
} = require('@utils/const');

const { Schema } = mongoose;

const HandoverSchema = new Schema(
	{
		userId: { type: Schema.Types.ObjectId, ref: 'User' },
		startTime: { type: Date, default: () => new Date() },
		endTime: { type: Date },
		startCash: [
			{
				_id: false,
				cashValue: {
					type: Number,
					enum: [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000],
					// required: true,
				},
				count: { type: Number, min: 0 },
				// for exchange cash
				currency: { type: String, enum: Object.values(Currency) },
				amount: { type: Number },
				note: String,
			},
		],
		endCash: [
			{
				_id: false,
				cashValue: {
					type: Number,
					enum: [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000],
					// required: true,
				},
				count: { type: Number, min: 0 },
				// for exchange cash
				currency: { type: String, enum: Object.values(Currency) },
				amount: { type: Number },
				note: String,
			},
		],
		payouts: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Payout',
			},
		],
		transactions: [
			{
				bookingId: {
					type: Schema.Types.ObjectId,
					ref: 'Booking',
				},
				payoutId: {
					type: Schema.Types.ObjectId,
					ref: 'Payout',
				},
				requiredAmount: { type: Number },
				collectedAmount: { type: Number },
			},
		],
		totalRequiredAmount: { type: Number },
		totalCollectedAmount: { type: Number },
		totalAdvAmount: { type: Number },
		hasStartProplem: { type: Boolean, default: false },
		hasEndProplem: { type: Boolean, default: false },
		startReason: { type: String },
		endReason: { type: String },
		status: { type: String, enum: Object.values(HANDOVER_STATUS), default: HANDOVER_STATUS.PROCESSING },
		blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
		cashierId: { type: Schema.Types.ObjectId, ref: 'Cashier' },
		cashierType: { type: String, enum: Object.values(CASHIER_TYPE), default: CASHIER_TYPE.CASH },
		nextId: { type: Schema.Types.ObjectId, ref: 'Handover' },
		payoutExportId: { type: Schema.Types.ObjectId, ref: 'PayoutExport' },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

HandoverSchema.virtual('startPrice').get(function () {
	return this.isExchangeCash() ? undefined : _.sumBy(this.startCash, c => c.cashValue * c.count);
});

HandoverSchema.virtual('endPrice').get(function () {
	return this.isExchangeCash() ? undefined : _.sumBy(this.endCash, c => c.cashValue * c.count);
});

HandoverSchema.virtual('currentCash').get(function () {
	if (!this.isExchangeCash()) return undefined;

	const { sumCollectedPayments } = mongoose.model('Payout');

	const totalExchanged = sumCollectedPayments(this.payouts);
	const group = _.groupBy(this.payouts, 'currencyAmount.currency');

	const data = this.startCash.map(c => {
		let { amount } = c;

		if (c.currency === Currency.VND) {
			amount -= totalExchanged;
		} else {
			const fromPayout = sumCollectedPayments(group[c.currency], 'currencyAmount.amount');
			amount += fromPayout;
		}

		return {
			currency: c.currency,
			amount,
		};
	});

	_.forEach(group, (payouts, currency) => {
		if (!data.some(c => c.currency === currency)) {
			data.push({
				currency,
				amount: sumCollectedPayments(payouts, 'currencyAmount.amount'),
			});
		}
	});

	return data;
});

function addDefaultCurrency(cash) {
	const defaultCurrency = Currency.VND;
	if (!_.find(cash, c => c.currency === defaultCurrency)) {
		cash.unshift({
			currency: defaultCurrency,
			amount: 0,
		});
	}
}

HandoverSchema.pre('save', function (next) {
	const isEx = this.cashierType === CASHIER_TYPE.CURRENCY_EXCHANGE;

	if (this.startCash) this.startCash = _.uniqBy(this.startCash, isEx ? 'currency' : 'cashValue');
	if (this.endCash) this.endCash = _.uniqBy(this.endCash, isEx ? 'currency' : 'cashValue');
	if (isEx) {
		addDefaultCurrency(this.startCash);
	}

	if (this.isModified('status') && this.status === HANDOVER_STATUS.DONE) {
		if (isEx) {
			this.hasEndProplem = this.currentCash.some(c => {
				const end = this.endCash.find(ec => ec.currency === c.currency);
				return !end || end.amount < c.amount;
			});
			addDefaultCurrency(this.endCash);
		} else {
			// this.hasEndProplem = this.endPrice < this.price;
		}
	}

	next();
});

HandoverSchema.methods = {
	checkCanEnd(user) {
		const canRequest =
			!this.endTime && (user && this.userId ? user._id.equals(this.userId._id || this.userId) : false);
		return canRequest;
	},

	checkCanStart(user) {
		const canAccept = !!user && !!this.endTime && !this.nextId;
		return canAccept;
	},

	isExchangeCash() {
		return this.cashierType === CASHIER_TYPE.CURRENCY_EXCHANGE;
	},

	async syncTransactions() {
		this.transactions = await this.getTransactions();
		this.totalCollectedAmount = this.getTotalCollected();
		this.totalRequiredAmount = this.getTotalRequired();
		this.totalAdvAmount = this.getTotalAdv();
	},

	getTotalAdv() {
		if (this.isExchangeCash() || this.endTime) return this.totalAdvAmount;

		const payouts = _.filter(this.payouts, p => p.collectSAStatus === PayoutCollectStatus.Confirmed);
		return mongoose.model('Payout').sumCollectedPayments(payouts);
	},

	getTotalCollected() {
		if (this.isExchangeCash() || this.endTime) return this.totalCollectedAmount;
		return _.sumBy(this.transactions, 'collectedAmount') || 0;
	},

	getTotalRequired() {
		if (this.isExchangeCash() || this.endTime) return this.totalRequiredAmount;
		return this.startPrice + _.sumBy(this.transactions, 'requiredAmount') || 0;
	},

	async getTransactions() {
		if (this.endTime) return this.transactions;

		// const filter = {
		// 	$or: [
		// 		{
		// 			_id: _.map(this.payouts, 'bookingId._id'),
		// 		},
		// 		{
		// 			blockId: this.blockId,
		// 			from: { $lte: moment(this.startTime).add(1, 'day').toDate().zeroHours() },
		// 			to: { $gte: moment().subtract(1, 'day').toDate().zeroHours() },
		// 			$or: [
		// 				{
		// 					checkin: { $gte: this.startTime },
		// 				},
		// 				{
		// 					checkout: { $gte: this.startTime },
		// 				},
		// 			],
		// 		},
		// 	],
		// };

		// const bookings = await this.model('Booking')
		// 	.find(filter)
		// 	.select(
		// 		'otaName otaBookingId price checkin paid rateType roomPrice currency currencyExchange relativeBookings'
		// 	);

		// const bookingIds = _.flatten([..._.map(bookings, '_id'), ..._.map(bookings, 'relativeBookings')]);

		// const otherCollects = await this.model('Payout').find({
		// 	bookingId: bookingIds,
		// 	fromOTA: false,
		// 	createdBy: { $ne: this.userId },
		// 	state: {
		// 		$ne: PayoutStates.DELETED,
		// 	},
		// });

		// const payouts = _.groupBy(this.payouts, p => p.bookingId._id);
		// const otherPayouts = _.groupBy(otherCollects, p => p.bookingId._id);

		if (!this.populated('payouts')) {
			await this.populate({
				path: 'payouts',
				select: '-logs',
			}).execPopulate();
		}

		const rs = this.payouts.map(p => {
			const amount =
				p.payoutType === PayoutType.REFUND
					? -Math.abs(p.currencyAmount.exchangedAmount)
					: p.currencyAmount.exchangedAmount;
			return {
				bookingId: p.bookingId,
				payoutId: p._id,
				requiredAmount: amount,
				collectedAmount: amount,
			};
		});

		// _.uniqBy(bookings, b => b.otaBookingId + b.otaName).forEach(booking => {
		// 	const currentPayouts = _.flatten(
		// 		_.compact([payouts[booking._id], ...booking.relativeBookings.map(r => payouts[r])])
		// 	);
		// 	const currentOtherPayouts = _.flatten(
		// 		_.compact([otherPayouts[booking._id], ...booking.relativeBookings.map(r => otherPayouts[r])])
		// 	);

		// 	const isPaidFromOTA = booking.isRatePaid() && OTAsHavePrePaid.includes(booking.otaName);

		// 	const amountCollected = _.sumBy(currentPayouts, 'currencyAmount.exchangedAmount') || 0;
		// 	const amountOtherCollected = _.sumBy(currentOtherPayouts, 'currencyAmount.exchangedAmount') || 0;

		// 	rs.push({
		// 		bookingId: booking._id,
		// 		payoutId: booking._id,
		// 		amountRequired: !booking.checkin
		// 			? amountCollected
		// 			: Math.max(
		// 					booking.exchange() -
		// 						(isPaidFromOTA ? booking.exchange(booking.roomPrice) : 0) -
		// 						amountOtherCollected,
		// 					0
		// 			  ),
		// 		amountCollected,
		// 	});
		// });

		return rs;
	},
};

HandoverSchema.statics = {};

module.exports = mongoose.model('Handover', HandoverSchema, 'handover');

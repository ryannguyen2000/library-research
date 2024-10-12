const mongoose = require('mongoose');
const { OTAs, Services } = require('@utils/const');

const { Schema } = mongoose;

const OtaRate = new Schema(
	{
		rateId: { type: String, required: true },
		account: { type: String, required: true },
	},
	{ _id: false }
);

const schema = {
	name: { type: String, required: true },
	defaultPrice: { type: Number },
	blockId: { required: true, type: Schema.Types.ObjectId, ref: 'BlockId' },
	parent: { type: Schema.Types.ObjectId, ref: 'Rate', default: null },

	// otas
	...Object.values(OTAs)
		.filter(o => !o.includes('.'))
		.reduce((a, c) => ({ ...a, [c]: [OtaRate] }), {}),

	otaName: { type: String, required: true },
	rateId: { type: String, required: true },
	account: { type: String, required: true },
	genius: { type: Boolean, default: false },
	serviceType: { type: Number, enum: Object.values(Services), default: Services.Day },

	otaRateName: String,

	discount: {
		type: { type: String },
		parentRateId: String,
		amount: Number,
	},
	meals: {
		dinner: { type: Boolean, default: false },
		breakfast: { type: Boolean, default: false },
		allInclusive: { type: Boolean, default: false },
		lunch: { type: Boolean, default: false },
	},

	restrictions: {
		minStayThrough: Number,
		earlyBookerAmount: Number,
	},
	policy: {
		name: String,
		prepayDescription: String,
		isGNR: { type: Boolean, default: false },
		cancellationDescription: String,
		cancelHour: Number,
		cancelNight: Number,
		isNonRefundable: { type: Boolean, default: false },
	},
	isOtaChildRate: { type: Boolean, default: false },
	isExpired: { type: Boolean, default: false },
	isDefault: { type: Boolean, default: false },

	bookStartDate: { type: Date, default: new Date('2000-01-01') },
	bookEndDate: { type: Date, default: new Date('2099-12-31') },
	travelStartDate: { type: Date, default: new Date('2000-01-01') },
	travelEndDate: { type: Date, default: new Date('2099-12-31') },

	maxOccupancy: Number,
	maxAdultOccupancy: Number,
	maxChildOccupancy: Number,
};

const RateSchema = new Schema(schema, {
	timestamps: true,
	toJSON: {
		virtuals: true,
	},
	toObject: {
		virtuals: true,
	},
});

RateSchema.virtual('otaRateId').get(function () {
	return this.rateId && this.rateId.split(',')[0];
});

RateSchema.methods = {
	groupByAccount(ota) {
		return !this[ota]
			? {}
			: this[ota].reduce((group, rate) => {
					if (!group[rate.account]) {
						group[rate.account] = [];
					}
					group[rate.account].push(rate.rateId);
					return group;
			  }, {});
	},

	getOTARateId() {
		return this.rateId && this.rateId.split(',')[0];
	},
};

module.exports = mongoose.model('Rate', RateSchema, 'rate');

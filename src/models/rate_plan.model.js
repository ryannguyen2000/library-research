const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const {
	RatePlanRefTypes,
	RatePlanBenefits,
	PolicyTypes,
	RatePlanPricingTypes,
	BookingStatus,
	Services,
	PolicyRuleChargeTypes,
} = require('@utils/const');
const { Ref } = require('@utils/mongoose/custom.schema');
const Types = require('@utils/mongoose/custom.types');
const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const RateSchema = new Schema(
	{
		_id: { type: Number },
		name: { type: String, required: true, default: 'Standard Rate' },
		nameEn: { type: String },
		description: { type: String },
		blockId: Ref({ required: true, type: ObjectId, ref: 'Block' }),
		pricingType: {
			required: true,
			type: Number,
			enum: Object.values(RatePlanPricingTypes),
			default: RatePlanPricingTypes.New,
		},
		ref: {
			ratePlanId: { type: Number, ref: 'RatePlan' },
			type: { type: Number, enum: Object.values(RatePlanRefTypes) },
			amount: { type: Number },
		},
		roomBasePrice: { type: Number },
		serviceType: {
			type: Number,
			default: Services.Day,
			enum: Object.values(Services),
		},
		startTime: Types.Time,
		endTime: Types.Time,
		maximumHours: { type: Number, min: 1, max: 20 },
		minimumHours: { type: Number, min: 1, max: 20 },

		// basePriceFirstHours: Number,
		basePriceAdditionalHours: Number,

		minimumDays: { type: Number, min: 1 },
		maximumDays: { type: Number, min: 1 },
		totalRevenues: Number,

		otas: [String],

		benefits: [
			{
				_id: false,
				type: { required: true, type: String, enum: Object.values(RatePlanBenefits) },
				accessValue: { type: Number, required: true },
				description: String,
				descriptionEn: String,
			},
		],
		policies: [
			{
				_id: false,
				name: String,
				type: { required: true, type: String, enum: Object.values(PolicyTypes) },
				policyId: Ref({ type: ObjectId, ref: 'Policy', required: true }),
			},
		],
		roomTypeIds: [Ref({ type: ObjectId, ref: 'RoomType' })],
		isDefault: { type: Boolean, default: false },
		active: { type: Boolean, default: true },
		createdBy: { type: ObjectId, ref: 'User' },
		updatedBy: { type: ObjectId, ref: 'User' },
	},
	{ timestamps: true }
);

RateSchema.pre('save', async function (next) {
	await this.validateRefPlan();

	if (this.isNew) {
		const exists = await Model.findOne({ blockId: this.blockId, name: this.name }).select('_id');
		if (exists) {
			throw new ThrowReturn('Rate plan đã tồn tại!');
		}

		const startRate = 1000000;
		const lastestRate = await Model.findOne().select('_id').sort({ _id: -1 });

		this._id = lastestRate ? lastestRate._id + 1 : startRate + 1;
	}

	this.$locals.isModifiedRefRate =
		this.isModified('ref.ratePlanId') ||
		this.isModified('ref.amount') ||
		this.isModified('ref.type') ||
		this.isModified('pricingType') ||
		this.isModified('active');

	next();
});

RateSchema.post('save', function () {
	if (this.$locals.isModifiedRefRate && this.active && this.pricingType === RatePlanPricingTypes.Reference) {
		mongoose.model('CozrumPrice').syncPriceRefRatePlans(this);
	}

	this.syncActiveListing();
});

RateSchema.methods = {
	async validateRefPlan() {
		if (this.pricingType === RatePlanPricingTypes.Reference) {
			if (!_.get(this.ref, 'ratePlanId')) {
				throw new ThrowReturn('Bạn chưa chọn Rate plan tham chiếu!');
			}

			if (this.ref.type === RatePlanRefTypes.Percentage) {
				if (this.ref.amount > 99 || this.ref.amount < -99) {
					throw new ThrowReturn('ref.amount must be beetween -99 and 99!');
				}
			}

			if (this.ref.ratePlanId === this._id) {
				throw new ThrowReturn('Rateplan tham chiếu không hợp lệ!');
			}

			const parent = await Model.findOne({ _id: this.ref.ratePlanId, active: true }).select(
				'pricingType serviceType'
			);
			if (!parent) {
				throw new ThrowReturn('Rateplan tham chiếu chưa được kích hoạt!');
			}

			if (parent.serviceType !== this.serviceType) {
				throw new ThrowReturn('Loại Rateplan tham chiếu không hợp lệ!');
			}

			if (parent.pricingType !== RatePlanPricingTypes.New) {
				throw new ThrowReturn('Loại của Rateplan tham chiếu không hợp lệ!');
			}
		}
	},

	async getTotalRevenues() {
		const stats = await mongoose
			.model('Booking')
			.aggregate()
			.match({
				'ratePlan.id': this._id,
				status: {
					$in: [BookingStatus.CONFIRMED, BookingStatus.CHARGED, BookingStatus.NOSHOW],
				},
			})
			.group({
				_id: null,
				amount: { $sum: '$roomPrice' },
			});

		return _.get(stats, [0, 'amount'], 0);
	},

	async getActiveOTAs({ serviceType, roomTypeId } = {}) {
		const OTAFilter = _.pickBy({
			active: true,
			serviceTypes: serviceType,
			'rates.ratePlanId': this._id,
		});
		const filter = {
			blockId: this.blockId,
			OTAs: {
				$elemMatch: OTAFilter,
			},
		};
		if (roomTypeId) {
			filter.roomTypeId = mongoose.Types.ObjectId(roomTypeId);
		}

		const listings = await mongoose
			.model('Listing')
			.aggregate()
			.match(filter)
			.unwind('$OTAs')
			.match({
				'OTAs.active': true,
				'OTAs.rates.ratePlanId': this._id,
			})
			.group({
				_id: null,
				otas: {
					$addToSet: {
						otaName: '$OTAs.otaName',
						otaListingId: '$OTAs.otaListingId',
						account: '$OTAs.account',
					},
				},
			});

		return _.get(listings, [0, 'otas']) || [];
	},

	getBasePrice() {
		if (this.pricingType === RatePlanPricingTypes.Reference) {
			return this.calcRefPrice(_.get(this.ref, 'ratePlanId.roomBasePrice'));
		}

		return this.roomBasePrice;
	},

	calcRefPrice(price) {
		if (!price) return 0;

		if (this.ref.type === RatePlanRefTypes.Percentage) {
			return Math.max(_.round(price + price * (this.ref.amount / 100)), 0);
		}

		return Math.max(_.round(price + this.ref.amount), 0);
	},

	validateHoursReservation(from, to) {
		if (from >= to) return { error: true, msg: 'Checkin time must be lesser than Checkout time' };

		if (this.startTime && this.startTime > from)
			return { error: true, msg: `Checkin time must be greater than ${this.startTime}` };
		if (this.endTime && this.endTime < to)
			return { error: true, msg: `Checkout time must be lesser than ${this.endTime}` };

		const hour = moment(to, 'HH:mm').diff(moment(from, 'HH:mm'), 'hour');

		if (this.maximumHours && this.maximumHours < hour) return { error: true, msg: 'Number of hours invalid' };
		if (this.minimumHours && this.minimumHours > hour) return { error: true, msg: 'Number of hours invalid' };

		return { error: false };
	},

	async isNonRefundable() {
		if (!this.populated('policies.policyId')) {
			await this.populate('policies.policyId', 'rules');
		}

		return this.policies.some(p =>
			p.policyId.rules.some(r => r.chargeType === PolicyRuleChargeTypes.NonRefundable)
		);
	},

	async syncActiveListing() {
		await mongoose.model('Listing').updateMany(
			{
				blockId: this.blockId,
				OTAs: {
					$elemMatch: {
						rates: {
							$elemMatch: {
								ratePlanId: this._id,
							},
						},
					},
				},
			},
			{
				$set: {
					'OTAs.$[].rates.$[rate].active': this.active,
					'OTAs.$[].rates.$[rate].serviceType': this.serviceType,
				},
			},
			{ arrayFilters: [{ 'rate.ratePlanId': this._id }] }
		);
	},
};

RateSchema.statics = {
	async syncDefaultRatePlan(blockId) {
		let defaultRate = await this.findOne({
			blockId,
			isDefault: true,
		});
		if (!defaultRate) {
			const roomTypes = await this.model('RoomType').findDefaultRoomTypes({ blockId }).select('_id');

			defaultRate = await this.create({
				blockId,
				isDefault: true,
				roomTypeIds: _.map(roomTypes, '_id'),
			});
		}

		return defaultRate;
	},

	findParentRates(filter = {}) {
		return this.find({
			...filter,
			pricingType: RatePlanPricingTypes.New,
			active: true,
		});
	},

	findChildRates(filter = {}) {
		return this.find({
			...filter,
			pricingType: RatePlanPricingTypes.Reference,
			active: true,
		});
	},

	findDefaultRatePlan(filter = {}) {
		return this.findOne({
			...filter,
			isDefault: true,
			active: true,
		});
	},
};

const Model = mongoose.model('RatePlan', RateSchema, 'rate_plan');

module.exports = Model;

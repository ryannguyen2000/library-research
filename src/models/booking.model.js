const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const {
	BookingStatus,
	CurrencyConvert,
	Errors,
	Currency,
	Services,
	RateType,
	CanceledByType,
	OTAs,
	LocalOTAs,
	PayoutStates,
	AutoTemplates,
	BookingHistoryType,
	RuleDay,
	BookingCheckinType,
	BookingAskReview,
	EXTRA_FEE,
	BookingGuideStatus,
	BookingGuideDoneStatus,
	BookingCallStatus,
	BookingContactOTAStatus,
	BookingQueueCancellation,
	BookingPaymentStatus,
	BookingPaymentSubStatus,
	BookingPaymentCollectType,
	BookingTimeInOutStatus,
	ProblemStatus,
	OTAsHavePrePaid,
	PayoutType,
	WATER_FEE_CALC_TYPE,
	RatePlanBenefits,
	PolicyRuleChargeTypes,
	PAYMENT_CARD_STATUS,
	PAYMENT_CHARGE_STATUS,
	OTAsListingConfig,
} = require('@utils/const');
const { Settings } = require('@utils/setting');
const ThrowReturn = require('@core/throwreturn');
const { eventEmitter, EVENTS, newCSEventEmitter, NEWCS_EVENTS, sysEventEmitter, SYS_EVENTS } = require('@utils/events');
const { updateDoc } = require('@utils/schema');
const { isVNPhone } = require('@utils/phone');
const { ReservationLock } = require('@utils/lock');
const { logger } = require('@utils/logger');
const { UPLOAD_CONFIG } = require('@config/setting');
const { bookingLogsMaping } = require('@controllers/booking/const');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const FilterUpdateKeys = [
	'description',
	'numberAdults',
	'numberChilden',
	'images',
	'customersupport',
	'expectCheckIn',
	'expectCheckOut',
	// 'fromHour',
	// 'toHour',
	// 'guestId',
	'askReview',
	'bookType',
	'serviceType',
	'guestOta',
	'ignorePassport',
	'ignorePrice',
	'ignoreGuide',
	'alterations',
	'rates',
	'rateDetail',
	'disabledAutoCheckin',
];
const ExtraFee = _.values(EXTRA_FEE);
const FilterUpdateKeyExtra = [
	// 'rateType',
	'amount',
	'upc',
	// 'price',
	'otaFee',
	'roomPrice',
	'otaFeePercent',
	// 'priceItems',
	// 'currency',
	...ExtraFee,
];

const History = new Schema(
	{
		description: String,
		images: [String],
		createdAt: { type: Date, default: Date.now },
		type: { type: Number, enum: Object.values(BookingHistoryType) },
		by: { type: ObjectId, ref: 'User' },
		removedBy: { type: ObjectId, ref: 'User' },
		updatedBy: { type: ObjectId, ref: 'User' },
		system: { type: Boolean, default: false },
		isWorkNote: { type: Boolean, default: false },
		specialRequest: Boolean,
		noteType: [Number],
		requestId: { type: ObjectId, ref: 'BookingUserRequest' },
		// new log
		action: String, // UPDATE, CREATE, DELETE
		prevData: String,
		data: String,
	},
	{
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

History.virtual('workNote', {
	ref: 'WorkNote',
	localField: '_id',
	foreignField: 'historyId',
	justOne: true,
});

const Booking = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block', required: true },
		listingId: { type: ObjectId, ref: 'Listing' },
		description: String,
		error: { type: Number, default: 0 },
		ignoreError: { type: Boolean, default: false },
		guestId: { type: ObjectId, ref: 'Guest' },
		guestIds: [{ type: ObjectId, ref: 'Guest' }],
		numberAdults: { type: Number, default: 1 },
		numberChilden: { type: Number, default: 0 },
		price: { type: Number, default: 0 },
		roomPrice: { type: Number },
		otaFee: { type: Number, default: 0 },
		otaFeePercent: { type: Number },

		// additionalPrice
		...ExtraFee.reduce((acc, cur) => ({ ...acc, [cur]: { type: Number, default: 0 } }), {}),

		previousElectricQuantity: { type: Number, default: 0 },
		currentElectricQuantity: { type: Number, default: 0 },
		electricPricePerKwh: { type: Number, default: 0 },
		waterFeeCalcType: { type: Number, enum: _.values(WATER_FEE_CALC_TYPE), default: WATER_FEE_CALC_TYPE.DEFAULT },
		previousWaterQuantity: { type: Number, default: 0 },
		currentWaterQuantity: { type: Number, default: 0 },
		waterPricePerM3: { type: Number, default: 0 },
		defaultWaterPrice: { type: Number, default: 0 },
		priceItems: [
			{
				title: String,
				amount: Number,
				currency: String,
				priceType: String,
			},
		],
		paid: { type: Number, default: 0 },
		currency: { type: String, default: Currency.VND },
		currencyExchange: { type: Number },
		ignoreFinance: { type: Boolean, default: false },
		from: { type: Date, required: true },
		to: { type: Date, required: true },
		fromHour: { type: String, default: RuleDay.from },
		toHour: { type: String, default: RuleDay.to },
		amount: { type: Number, required: true, min: 1, default: 1 },
		otaBookingId: { type: String, required: true },
		otaName: { type: String, required: true },
		guestOta: String,
		status: { type: String, enum: Object.values(BookingStatus), required: true },
		checkin: Date,
		checkedIn: { type: Boolean, default: false },
		checkout: Date,
		checkedOut: { type: Boolean, default: false },
		checkinType: { type: String, enum: Object.values(BookingCheckinType) },
		checkoutType: { type: String, enum: Object.values(BookingCheckinType) },
		expectCheckIn: { type: String, default: RuleDay.from },
		expectCheckOut: { type: String, default: RuleDay.to },
		histories: [History],
		images: [String],
		messages: { type: ObjectId, ref: 'Messages' },
		relativeBookings: [{ type: ObjectId, ref: 'Booking' }],
		manual: { type: Boolean, default: false },
		reservateRooms: [{ type: ObjectId, ref: 'Room' }],
		customersupport: { type: ObjectId, ref: 'User' },
		hosting: { type: ObjectId, ref: 'User' },
		rateType: { enum: Object.values(RateType), type: String, default: RateType.PAY_AT_PROPERTY },
		askReview: { type: String, default: BookingAskReview.NOT_YET, enum: Object.values(BookingAskReview) },
		serviceType: { type: Number, enum: Object.values(Services), default: Services.Day },
		doorCode: String,
		doorCodeGenerated: Boolean,
		doorCodeDisabled: Boolean,
		ignorePassport: Boolean,
		ignorePrice: { type: Boolean, default: false }, // bỏ qua check thanh toán của vận hành
		ignoreGuide: { type: Boolean, default: false }, // bỏ qua check gửi guide toán của vận hành
		isPaid: Boolean,
		sendEmailConfirmation: [Date],
		sendEmailConfirmationOTA: Date,
		alterations: [
			{
				from: Date,
				to: Date,
				numberAdults: Number,
				numberChilden: Number,
				id: String,
				status: Number,
				price: Number,
			},
		],
		rates: [
			{
				_id: false,
				name: String,
				isNonRefundable: { type: Boolean },
				date: String,
				commission: Number,
				price: Number,
				currency: String,
				discount: Number,
				promotion: String,
			},
		],
		rateDetail: {
			benefits: String,
			name: String,
			ratePlanType: String,
			breakfastIncluded: { type: Boolean },
			isNonRefundable: { type: Boolean },
		},
		ratePlan: {
			id: { type: Number, ref: 'RatePlan' },
			name: { type: String },
			description: { type: String },
			benefits: [
				{
					_id: false,
					type: { type: String, enum: Object.values(RatePlanBenefits) },
					description: { type: String },
					descriptionEn: String,
				},
			],
			policies: [
				{
					_id: false,
					id: { type: ObjectId, ref: 'Policy' },
					name: { type: String },
					type: { type: String },
					displayName: { type: String },
					displayNameEn: { type: String },
					description: { type: String },
					rules: [
						{
							_id: false,
							chargeType: { type: Number },
							conditionValue: Number,
							conditionValueMin: Number,
							conditionValueMax: Number,
							conditionType: { type: Number },
							amountType: { type: Number }, // % | cố định
							amountValue: Number,
						},
					],
				},
			],
		},
		card: Mixed,
		other: Mixed,
		paymentMethod: String,
		paymentCards: [
			{
				cardHolderName: String,
				cardNumber: String,
				cardCode: String,
				cardType: Number,
				expireDate: String,
				seriesCode: String,
			},
		],
		canceledAt: Date,
		canceledBy: {
			type: { type: String, enum: Object.values(CanceledByType) },
			by: { type: ObjectId, ref: 'User' },
			reason: String,
		},
		markOnOTA: {
			time: Date,
			by: {
				type: ObjectId,
				ref: 'User',
			},
		},
		disabledAutoCheckin: Boolean,
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		doneTemplate: [String],
		ignoreTemplate: [String],
		doneTemplateOtts: [
			{
				_id: false,
				template: String,
				otts: [String],
			},
		],
		requestToCancel: { type: Date },
		isInvoiceExported: { type: Boolean, default: false },
		invoices: [
			{
				url: String,
				by: { type: ObjectId, ref: 'user' },
				createdAt: Date,
			},
		],

		lastTimeSent: Date,
		lastTimeCalled: Date,
		countSentGuide: Number,

		guideStatus: { type: Number, enum: _.values(BookingGuideStatus) },
		guideDoneStatus: { type: Number, enum: _.values(BookingGuideDoneStatus) },
		guideDoneBy: { type: ObjectId, ref: 'User' },

		callStatus: { type: Number, enum: _.values(BookingCallStatus) },
		timeInOutStatus: { type: Number, enum: _.values(BookingTimeInOutStatus) },
		contactOTAStatus: { type: Number, enum: _.values(BookingContactOTAStatus) },
		queueCancellationStatus: { type: Number, enum: _.values(BookingQueueCancellation) },

		paymentStatus: { type: Number, enum: _.values(BookingPaymentStatus), default: BookingPaymentStatus.NoInfo },
		paymentSubStatus: { type: Number, enum: _.values(BookingPaymentSubStatus) },
		paymentCollectType: { type: Number, enum: _.values(BookingPaymentCollectType) },
		paymentDone: { type: Boolean, default: false },
		paymentDoneBy: { type: ObjectId, ref: 'User' },

		problemStatus: [{ type: String, enum: _.values(ProblemStatus) }],

		paymentCardState: {
			description: { type: String },
			status: { type: String, enum: Object.values(PAYMENT_CARD_STATUS) },
			chargedStatus: { type: String, enum: Object.values(PAYMENT_CHARGE_STATUS) },
			markedInvalid: { type: Boolean },
			markedBy: { type: ObjectId, ref: 'User' },
			markedAt: { Date },
			updatedAt: { Date },
			autoCancel: Boolean,
			gettingCount: Number,
			chargedCount: Number,
			left: {
				days: Number,
				views: Number,
			},
		},

		display: { type: Boolean, default: true },
		displayToday: Boolean,
	},
	{
		timestamps: true,
		versionKey: false,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
		autoIndex: false,
	}
);

// Booking.index({ createdAt: -1 });
// Booking.index({ from: 1 });
// Booking.index({ to: 1 });
// Booking.index({ status: 1 });
// Booking.index({ otaName: 1 });
// Booking.index({ otaBookingId: 1 });

Booking.virtual('totalCall', {
	ref: 'Stringee',
	localField: 'otaBookingId',
	foreignField: 'otaBookingId',
	count: true,
});

Booking.virtual('totalMsg', {
	ref: 'OTTMessage',
	localField: 'otaBookingId',
	foreignField: 'otaBookingId',
	count: true,
});

Booking.virtual('payouts', {
	ref: 'Payout',
	localField: '_id',
	foreignField: 'bookingId',
});

Booking.pre('save', async function (next) {
	if (!this.numberAdults) {
		this.numberAdults = 1 + _.get(this.guestIds, 'length', 0);
	}

	if (this.isNew) {
		this.roomPrice = this.roomPrice || this.price;
	}

	this.price = this.roomPrice + (_.sum(ExtraFee.map(k => _.get(this, k))) || 0);

	if (this.isRatePaid() && !this.paid) {
		this.paid = this.exchange(this.roomPrice);
		this.isPaid = this.paid >= this.exchange(this.price);
		this.paymentStatus = BookingPaymentStatus.Auto;
		this.ignorePrice = this.isPaid;
		this.paymentDone = this.isPaid;
	}
	if (!this.currencyExchange && this.currency) {
		this.currencyExchange = CurrencyConvert[this.currency] || 1;
	}
	if (this.serviceType === Services.Month) {
		this.ignorePrice = true;
		this.paymentDone = true;
	}
	if (
		this.serviceType === Services.Month ||
		this.otaName === OTAs.CozrumExtend ||
		this.otaName === OTAs.OwnerExtend
	) {
		this.ignoreGuide = true;
		this.guideStatus = BookingGuideStatus.Done;
		this.guideDoneStatus = BookingGuideStatus.Sent;
	}

	this.checkedIn = !!this.checkin;
	this.checkedOut = !!this.checkout;

	const isModifiedFrom = this.isModified('from');
	const isModifiedTo = this.isModified('to');

	if (
		!OTAsListingConfig[this.otaName] &&
		((this.isNew && !this.otaFee) ||
			this.isModified('roomPrice') ||
			this.isModified('otaName') ||
			isModifiedFrom ||
			isModifiedTo)
	) {
		const otaFee = await this.getLocalOtaFee();

		if (_.isNumber(otaFee)) {
			this.otaFee = otaFee;
		}
	}

	this.$locals.isModifiedPrice = this.isModified('price');
	this.$locals.isModifiedStatus = this.isModified('status');
	this.$locals.isModifiedInOut = this.isModified('checkin') || this.isModified('checkout');
	this.$locals.isModifiedBlock = this.isModified('blockId');
	this.$locals.isModifiedGuest = this.isModified('guestId') || this.isModified('guestIds');
	this.$locals.isModifiedIgnoreGuide = this.isModified('ignoreGuide');
	this.$locals.isModifiedIgnorePrice = this.isModified('ignorePrice');

	this.$locals.isModifiedFlow =
		isModifiedFrom ||
		isModifiedTo ||
		this.$locals.isModifiedBlock ||
		this.$locals.isModifiedPrice ||
		this.$locals.isModifiedStatus ||
		this.isModified('ignoreFinance') ||
		this.isModified('paymentStatus') ||
		this.isModified('otaFee') ||
		this.isModified('relativeBookings');

	this.$locals.isNew = this.isNew;

	if (!this.isNew) {
		this.checkUpdatedAndLogs();
	}

	next();
});

Booking.post('save', function (doc) {
	if (!doc.$locals.isNew && (doc.$locals.isModifiedPrice || doc.$locals.isModifiedStatus)) {
		eventEmitter.emit(EVENTS.RESERVATION_UPDATE_PRICE, doc);
	}

	if (doc.blockId && doc.guestId && (doc.$locals.isModifiedBlock || doc.$locals.isModifiedGuest)) {
		mongoose
			.model('Guest')
			.updateMany(
				{
					_id: { $in: [doc.guestId, ...(doc.guestIds || [])] },
				},
				{
					$addToSet: {
						blockIds: doc.blockId,
					},
				}
			)
			.catch(e => {
				logger.error(e);
			});
	}

	if (!doc.$locals.isNew && doc.$locals.isModifiedBlock) {
		mongoose
			.model('Payout')
			.updateMany({ bookingId: doc._id }, { blockIds: [doc.blockId] })
			.catch(e => {
				logger.error(e);
			});
	}

	if (!doc.$locals.isNew && doc.$locals.isModifiedGuest) {
		mongoose.model('BlockInbox').updateKeyword({ bookingId: doc._id });
	}

	if (!doc.$locals.isNew && doc.$locals.isModifiedPrice) {
		mongoose.model('Reservation').initPricing({ bookingId: doc._id });
	}

	if (!doc.$locals.isNew && (doc.$locals.isModifiedStatus || doc.$locals.isModifiedInOut)) {
		mongoose
			.model('BlockInbox')
			.updateOne({ bookingId: doc._id }, { status: doc.status, checkin: doc.checkin, checkout: doc.checkout })
			.catch(e => {
				logger.error(e);
			});
	}

	if (!doc.$locals.isNew && doc.$locals.isModifiedFlow) {
		eventEmitter.emit(EVENTS.UPDATE_CASH_FLOW, { otaName: doc.otaName, otaBookingId: doc.otaBookingId });
	}

	if (doc.$locals.isNew || doc.$locals.isModifiedFlow) {
		sysEventEmitter.emit(SYS_EVENTS.REVENUE_STREAM_UPDATE, doc);
	}

	const csStatus = {};

	if (!doc.$locals.isNew && (doc.$locals.isModifiedECI || doc.$locals.isModifiedECO)) {
		// NEWCS: Hoàn thành tác vụ hỏi giờ IN
		const isUpdateCI = RuleDay.from !== doc.expectCheckIn;
		const isUpdateCO = RuleDay.to !== doc.expectCheckOut;

		_.assign(csStatus, {
			timeInOutStatus: isUpdateCO
				? BookingTimeInOutStatus.Done
				: isUpdateCI
				? BookingTimeInOutStatus.DoneIn
				: BookingTimeInOutStatus.None,
		});
	}

	if (!doc.$locals.isNew && doc.$locals.isModifiedIgnoreGuide) {
		if (doc.ignoreGuide) {
			_.assign(csStatus, {
				display: true,
				guideStatus: BookingGuideStatus.Done,
				guideDoneStatus: BookingGuideDoneStatus.ByUser,
				guideDoneBy: _.get(doc.$locals.user, '_id'),
				callStatus: BookingCallStatus.None,
			});
		} else {
			_.assign(csStatus, {
				display: true,
				guideStatus: BookingGuideStatus.CantContact,
				callStatus: BookingCallStatus.NeedCall,
			});
		}
	}

	if (!doc.$locals.isNew && doc.$locals.isModifiedIgnorePrice) {
		_.assign(csStatus, {
			display: true,
			paymentDone: doc.paymentDone,
		});
		if (doc.ignorePrice) {
			csStatus.paymentDoneBy = _.get(doc.$locals.user, '_id');
		}
	}

	if (!_.isEmpty(csStatus)) {
		newCSEventEmitter.emit(NEWCS_EVENTS.UPDATE_STATUS, doc, csStatus);
	}
});

Booking.methods = {
	checkUpdatedAndLogs() {
		this.$locals.isModifiedECI = this.isModified('expectCheckIn');
		this.$locals.isModifiedECO = this.isModified('expectCheckOut');
		const by = this.$locals.updatedBy;

		if (this.$locals.isModifiedECI || this.$locals.isModifiedECO) {
			const history = _.find(this.histories, h => h.type === BookingHistoryType.CheckInTime);
			const isUpdateCI = RuleDay.from !== this.expectCheckIn;
			const isUpdateCO = RuleDay.to !== this.expectCheckOut;

			const description = _.compact([
				isUpdateCI && `In: ${this.expectCheckIn}`,
				isUpdateCO && `Out: ${this.expectCheckOut}`,
			]).join(' - ');

			if (history) {
				history.updatedBy = by;
				history.description = description;
			} else {
				this.addLog({
					by,
					description,
					type: BookingHistoryType.CheckInTime,
					system: false,
				});
			}
		}

		const logKeys = ['roomPrice', 'amount', 'otaFee', 'fromHour', 'toHour', 'otaName', ...ExtraFee];
		logKeys.forEach(key => {
			if (bookingLogsMaping[key] && this.isModified(key)) {
				const oldData = _.get(this.$locals, ['oldData', key]);
				if (oldData !== undefined) {
					this.addLog({
						by,
						action: bookingLogsMaping[key],
						prevData: `${oldData}`,
						data: `${this[key]}`,
					});
				}
			}
		});
	},

	isRatePaid() {
		return this.rateType === RateType.PAY_NOW;
	},

	calcElectricFee() {
		const currentElectricQuantity = this.currentElectricQuantity || 0;
		const previousElectricQuantity = this.previousElectricQuantity || 0;
		const electricPricePerKwh = this.electricPricePerKwh || 0;
		const electricityFee = (currentElectricQuantity - previousElectricQuantity) * electricPricePerKwh;
		return electricityFee;
	},

	calcWaterFee() {
		if (this.waterFeeCalcType === WATER_FEE_CALC_TYPE.DEFAULT) {
			return this.isNew ? this.defaultWaterPrice : this.waterFee;
		}

		if (this.waterFeeCalcType === WATER_FEE_CALC_TYPE.QUANTITY) {
			const previousWaterQuantity = this.previousWaterQuantity || 0;
			const currentWaterQuantity = this.currentWaterQuantity || 0;
			const waterPricePerM3 = this.waterPricePerM3 || 0;
			const waterFee = (currentWaterQuantity - previousWaterQuantity) * waterPricePerM3;

			return waterFee;
		}

		return this.waterFee;
	},

	addLog(data) {
		this.histories.push({
			createdAt: new Date(),
			system: true,
			...data,
		});
	},

	async updateBookingProperties(data, userId) {
		this.$locals.updatedBy = userId;

		_.keys(data).forEach(k => {
			_.set(this.$locals, ['oldData', k], this[k]);
		});

		await updateDoc(this, data);

		return this;
	},

	async updateInfo({ userId, data }) {
		await this.updateBookingProperties(_.pick(data, FilterUpdateKeys), userId);
	},

	async errorCode(code) {
		if (this.error !== code) {
			this.error = code || 0;
			await this.save();

			if (this.code !== 0) {
				eventEmitter.emit(EVENTS.RESERVATION_ERROR, this);
			}
		}
	},

	async listingModel() {
		const listing = await this.model('Listing').findById(this.listingId);
		if (!listing) {
			throw new ThrowReturn('Listing not found', this.listingId);
		}
		return listing;
	},

	getRelativeBookings() {
		if (this.relativeBookings && this.relativeBookings.length) {
			return BookingModel.find({
				_id: this.relativeBookings,
			});
		}
		return [];
	},

	isAlive() {
		return this.error === 0 && this.status === BookingStatus.CONFIRMED;
	},

	exchangePrice() {
		return this.exchange(this.price, this.currency);
	},

	exchange(price, currency) {
		price = price !== undefined ? price : this.price;
		currency = currency || this.currency;
		const exchange = this.currencyExchange || CurrencyConvert[currency] || 1;
		price *= exchange;
		return price || 0;
	},

	findHistory(historyId) {
		return _.find(this.histories, h => h._id.equals(historyId));
	},

	isNonRefundable() {
		return !!_.get(this.rates, [0, 'isNonRefundable']) || !!_.get(this.rateDetail, 'isNonRefundable');
	},

	async addHistory(data, returnData) {
		if (!data.description && (!data.images || !data.images.length)) {
			throw new ThrowReturn('Content must not be empty');
		}

		const newHistory = this.histories.create(data);
		this.histories.push(newHistory);
		await this.save();

		if (returnData) {
			await this.model('User').populate(newHistory, {
				path: 'by updatedBy removedBy',
				select: 'name username role',
			});
		}

		return newHistory;
	},

	async addInvoice(urls, userId) {
		if (!_.isEmpty(urls)) {
			const invoices = urls.map(url => {
				const _url = _.startsWith(url, UPLOAD_CONFIG.URI)
					? _.replace(url, UPLOAD_CONFIG.URI, UPLOAD_CONFIG.FULL_URI)
					: url;

				return {
					url: _url,
					by: userId,
					createdAt: new Date(),
				};
			});
			this.invoices = [...this.invoices, ...invoices];
			this.isInvoiceExported = true;
			await this.save();
		} else {
			throw new ThrowReturn('urls does not exist');
		}
	},

	async getLocalOtaFee() {
		const config = await this.model('Block').getPropertyConfig({
			otaName: this.otaName,
			blockId: this.blockId,
		});

		if (!config || !config.commission) return;

		let price = this.roomPrice;

		if (config.startDate || config.endDate) {
			const fromFormat = this.from.toDateMysqlFormat();
			const toFormat = this.to.toDateMysqlFormat();

			if (config.startDate && config.startDate >= toFormat) return 0;
			if (config.endDate && config.endDate < fromFormat) return 0;

			price = BookingModel.distribute(
				this.from,
				this.to,
				config.startDate ? new Date(config.startDate) : this.from,
				config.endDate ? moment(new Date(config.endDate)).add(1, 'day').toDate() : this.to
			)(price);
		}

		return _.round(price * (config.commission / 100));
	},
};

Booking.statics = {
	distribute(bfrom, bto, from, to) {
		const days = bfrom.diffDays(bto);
		const cfrom = new Date(Math.max(from, bfrom));
		const cto = new Date(Math.min(to, bto));
		const cdays = Math.max(cfrom.diffDays(cto), 0);

		return (price, rate = 1) => {
			if (!price) return 0;

			const dprice = (price / days) * cdays;
			return _.round(dprice * rate) || 0;
		};
	},

	exchangeCurrency(currencyExchange, currency) {
		const exchange = currencyExchange || CurrencyConvert[currency] || 1;
		return price => _.round(price * exchange);
	},

	getBookingRevenue(booking, revenueKeys) {
		const exchange = booking.currencyExchange || CurrencyConvert[booking.currency] || 1;
		const price = booking.roomPrice + _.sum(revenueKeys.map(k => booking[k] || 0));

		return _.round(price * exchange);
	},

	createNewBookFromOTA(newBooking, forceNew) {
		return ReservationLock.acquire(
			`${newBooking.otaBookingId}_${newBooking.otaName}_${newBooking.listingId}`,
			async () => {
				let oldBooking;

				if (newBooking.otaFee) newBooking.otaFee = _.round(newBooking.otaFee);
				if (newBooking.price && (!newBooking.currency || newBooking.currency === Currency.VND)) {
					newBooking.price = _.round(newBooking.price);
				}
				if (newBooking.roomPrice && (!newBooking.currency || newBooking.currency === Currency.VND)) {
					newBooking.roomPrice = _.round(newBooking.roomPrice);
				}

				if (!forceNew) {
					let bookings = await this.find({
						otaBookingId: newBooking.otaBookingId,
						otaName: newBooking.otaName,
						listingId: { $in: [null, newBooking.listingId] },
					});

					if (bookings.length) {
						const updateKeys = [...FilterUpdateKeys, 'rateType', 'listingId', 'currency', 'priceItems'];
						const sorterStatus = {
							[BookingStatus.CONFIRMED]: 3,
							[BookingStatus.NOSHOW]: 2,
							[BookingStatus.CHARGED]: 1,
						};

						bookings = _.orderBy(bookings, ['listingId'], ['desc']);
						bookings.sort((a, b) => (sorterStatus[b.status] || 0) - (sorterStatus[a.status] || 0));

						[oldBooking] = bookings;

						if (!oldBooking.manual) {
							updateKeys.push(...FilterUpdateKeyExtra);
						} else if (bookings.filter(b => sorterStatus[b.status]).length <= 1) {
							updateKeys.push('roomPrice', 'otaFee', 'otaFeePercent');
						}
						if (oldBooking.error === Errors.RoomNotAvailable) {
							updateKeys.push(...FilterUpdateKeyExtra, 'from', 'to', 'fromHour', 'toHour');
						}

						if (_.isNumber(oldBooking.otaFeePercent)) {
							_.unset(newBooking, 'otaFeePercent');
							_.unset(newBooking, 'otaFee');
						}

						await oldBooking.updateBookingProperties(_.pick(newBooking, updateKeys));

						// only accept new booking or confirm an old request booking
						if (
							oldBooking.error ||
							oldBooking.status !== BookingStatus.REQUEST ||
							newBooking.status !== BookingStatus.CONFIRMED
						) {
							return [oldBooking, false];
						}
					}
				}

				const booking = oldBooking || new this(newBooking);
				booking.error = 0;
				booking.from.zeroHours();
				booking.to.zeroHours();

				if (newBooking.ratePlanId && (!oldBooking || !_.get(oldBooking.ratePlan, 'id'))) {
					const ratePlan = await this.model('RatePlan')
						.findById(newBooking.ratePlanId)
						.select('name nameEn description benefits policies')
						.populate('policies.policyId', 'name displayName displayNameEn description type rules')
						.lean();

					if (ratePlan) {
						booking.ratePlan = {
							...ratePlan,
							id: ratePlan._id,
							policies: _.map(ratePlan.policies, p => ({ ...p, id: p._id, ...p.policyId })),
						};
						const isNonRefundable = booking.ratePlan.policies.some(p =>
							p.rules.some(r => r.chargeType === PolicyRuleChargeTypes.NonRefundable)
						);
						if (isNonRefundable) {
							_.set(booking, ['rateDetail', 'isNonRefundable'], isNonRefundable);
						}
					}
				}

				// ensure old booking update new status
				if (newBooking.status === BookingStatus.CONFIRMED) booking.status = newBooking.status;

				await booking.save();

				// update relative bookings
				await this.updateRelativeBookings(booking.otaName, booking.otaBookingId);

				return [booking, true];
			}
		);
	},

	async updateRelativeBookings(otaName, otaBookingId) {
		const bookings = await this.find({
			otaName,
			otaBookingId,
		});

		if (bookings.length) {
			const ids = bookings.map(b => b._id);

			await bookings.asyncMap(b => {
				const relativeBookings = ids.filter(i => i.toString() !== b._id.toString());

				b.relativeBookings = relativeBookings;
				return b.save();
				// return this.updateOne({ _id: b._id }, { relativeBookings });
			});

			await this.model('BookingContract').updateOne(
				{ otaName, otaBookingId },
				{
					$addToSet: {
						bookingIds: { $each: ids },
					},
				}
			);
		}
	},

	/**
	 * Calculate occupancy rate of rooms
	 * @param {String} blockId
	 * @param {String} listingId
	 * @param {String} ota
	 * @param {Number} roomLength
	 * @param {Date} from
	 * @param {Date} to
	 */
	async occupancyRate(blockId, listingId, otaName, roomLength, from, to, lockDates = 0) {
		const nights = roomLength * from.diffDays(to);

		const query = {
			ignoreFinance: false,
			from: { $lt: to },
			to: { $gt: from },
			error: 0,
			status: BookingStatus.CONFIRMED,
		};
		if (blockId) {
			query.blockId = blockId;
		}
		if (listingId) {
			query.listingId = listingId;
		}
		if (otaName) {
			query.otaName = otaName;
		}

		const otas = {};
		const totalDates = await this.find(query)
			.select('from to amount otaName')
			.lean()
			.then(bookings =>
				bookings.reduce((total, booking) => {
					booking.from = booking.from < from ? from : booking.from;
					booking.to = booking.to >= to ? to : booking.to;
					const days = booking.from.diffDays(booking.to) * booking.amount;
					otas[booking.otaName] = otas[booking.otaName] ? otas[booking.otaName] + days : days;
					return total + days;
				}, 0)
			);
		otas.locked = lockDates;
		Object.keys(otas).forEach(key => {
			otas[key] = (otas[key] / nights) * 100;
		});

		return {
			rate: ((totalDates + lockDates) / nights) * 100,
			otas,
			info: {
				nights,
				booked: totalDates,
				locked: lockDates,
			},
		};
	},

	async addLog({ bookingId, userId, ...data }) {
		await this.updateOne(
			{ _id: bookingId },
			{
				$push: {
					histories: {
						by: userId,
						createdAt: new Date(),
						system: true,
						...data,
					},
				},
			}
		);
	},

	async getPayment({ otaBookingId, otaName, firstNight = false }) {
		let expiration;

		const bookings = await this.find({
			otaBookingId,
			otaName,
			status: [BookingStatus.CONFIRMED, BookingStatus.REQUEST],
		}).select('-histories');

		let totalPrice = 0;
		let totalPaid = _.sumBy(bookings, 'paid');

		if (firstNight) {
			totalPrice = _.sum(
				bookings.map(b => {
					if (_.get(b.rates, [0, 'price'])) {
						return b.exchange(_.round(b.rates[0].price));
					}
					const days = b.from.diffDays(b.to);
					return _.round(b.exchangePrice() / days);
				})
			);
		} else {
			totalPrice = _.sum(bookings.map(b => b.exchangePrice()));

			const booking = _.find(bookings, b => b.isNonRefundable());

			if (booking) {
				const paymentConfig = moment(booking.createdAt).isSame(booking.from, 'day')
					? Settings.ShortPaymentExpirationTime
					: Settings.LongPaymentExpirationTime;

				expiration = moment(booking.createdAt).add(_.toInteger(paymentConfig.value), 'minutes');
			}
		}

		return {
			totalPrice,
			totalPaid,
			amount: _.max([totalPrice - totalPaid, 0]),
			bookings,
			expiration: expiration || undefined,
		};
	},

	async updateBookingPaid({ otaName, otaBookingId }) {
		await ReservationLock.acquire(`${otaName}_${otaBookingId}`, async () => {
			const bookings = await this.find({
				otaName,
				otaBookingId,
			}).select('-histories');
			if (!bookings.length) return;

			const payouts = await this.model('Payout')
				.find({
					state: { $ne: PayoutStates.DELETED },
					bookingId: _.map(bookings, '_id'),
				})
				.select('-logs')
				.lean();

			payouts.forEach(payout => {
				if (payout.payoutType === PayoutType.REFUND) {
					payout.currencyAmount.exchangedAmount = -Math.abs(payout.currencyAmount.exchangedAmount);
				}
			});

			const bulks = [];
			const resPayouts = payouts.filter(
				p => (p.payoutType !== PayoutType.DEPOSIT || p.isCalcDeposit) && (!p.otaId || !p.fromOTA)
			);

			let paymentLeft = _.sumBy(resPayouts, 'currencyAmount.exchangedAmount') || 0;
			let otaFeePerDay;
			const confirmedStatus = [BookingStatus.CONFIRMED, BookingStatus.CHARGED, BookingStatus.NOSHOW];
			const confirmedBookings = bookings.filter(b => confirmedStatus.includes(b.status));

			if (otaName === OTAs.Agoda) {
				const negativePayouts = _.uniqBy(
					payouts.filter(p => p.currencyAmount.exchangedAmount < 0 && p.fromOTA),
					'currencyAmount.exchangedAmount'
				);
				if (negativePayouts.length) {
					const totalOTAFee = Math.abs(_.sumBy(negativePayouts, 'currencyAmount.exchangedAmount'));
					otaFeePerDay =
						totalOTAFee /
						_.sumBy(confirmedBookings.length ? confirmedBookings : bookings, b => b.from.diffDays(b.to));
				}
			}

			const hasConfirmed = bookings.some(b => b.status === BookingStatus.CONFIRMED);

			bookings.forEach((booking, index) => {
				let price = booking.exchangePrice();
				let paymentRequired = price;
				let isPaidFromOTA = booking.isRatePaid() && OTAsHavePrePaid.includes(booking.otaName);
				let update = { paid: 0 };

				if (isPaidFromOTA) {
					update.paid = booking.exchange(booking.roomPrice);
					paymentRequired -= update.paid;
				}
				if (
					!hasConfirmed ||
					(booking.status !== BookingStatus.CANCELED && booking.status !== BookingStatus.DECLINED)
				) {
					if (paymentLeft > paymentRequired) {
						paymentLeft -= paymentRequired;
						update.paid += paymentRequired;
					} else {
						update.paid += paymentLeft;
						paymentLeft = 0;
					}
				}
				if (paymentLeft && index === bookings.length - 1) {
					update.paid += paymentLeft;
				}
				if (
					otaFeePerDay &&
					!isPaidFromOTA &&
					(!confirmedBookings.length || confirmedStatus.includes(booking.status))
				) {
					// update otaFee while otaName is Agoda
					update.otaFee = _.round(otaFeePerDay * booking.from.diffDays(booking.to));
				}

				update.isPaid = !!price && update.paid >= price;

				bulks.push({
					updateOne: {
						filter: {
							_id: booking._id,
						},
						update,
					},
				});
			});

			const prevStatus = bookings
				.filter(b => b.status !== BookingStatus.CANCELED && b.status !== BookingStatus.DECLINED)
				.every(b => b.isPaid);

			const currentStatus = bulks
				.filter(
					(b, i) =>
						bookings[i].status !== BookingStatus.CANCELED && bookings[i].status !== BookingStatus.DECLINED
				)
				.every(b => b.updateOne.update.isPaid);

			await this.bulkWrite(bulks);

			if (currentStatus !== prevStatus) {
				eventEmitter.emit(EVENTS.UPDATE_PAYMENT_STATUS, bookings, currentStatus, payouts);
			}

			eventEmitter.emit(EVENTS.UPDATE_CASH_FLOW, { otaName, otaBookingId });
		}).catch(e => {
			logger.error(e);
		});
	},

	async onUpdatePayout(payout) {
		if (!payout.bookingId) return;
		const booking = await this.findById(payout.bookingId).select('otaName otaBookingId').lean();
		if (!booking) return;

		if (payout.currencyAmount.exchange > 1 && payout.state !== PayoutStates.DELETED) {
			await this.updateMany(
				{
					otaName: booking.otaName,
					otaBookingId: booking.otaBookingId,
					currency: payout.currencyAmount.currency,
				},
				{
					$set: {
						currencyExchange: payout.currencyAmount.exchange,
					},
				}
			);
		}

		await this.updateBookingPaid(booking);
	},

	findBestMatchBookings({ match, project, limit, date }) {
		date = (date || new Date()).zeroHours();

		const chain = this.aggregate()
			.match(match)
			.addFields({
				point: {
					$cond: [
						{ $lte: ['$from', date] },
						{
							$cond: [
								{
									$cond: [
										{ $eq: ['$checkout', null] },
										{ $gte: ['$to', date] },
										{ $gt: ['$to', date] },
									],
								},
								1,
								3,
							],
						},
						2,
					],
				},
				pointStatus: {
					$cond: [
						{ $eq: ['$status', BookingStatus.CONFIRMED] },
						2,
						{
							$cond: [{ $eq: ['$status', BookingStatus.REQUEST] }, 1, 0],
						},
					],
				},
				diffFrom: { $abs: { $subtract: ['$from', date] } },
				diffTo: { $abs: { $subtract: ['$to', date] } },
			})
			.sort({
				point: 1,
				diffFrom: 1,
				diffTo: 1,
				checkin: -1,
				pointStatus: -1,
				isPaid: -1,
				createdAt: -1,
			});

		if (limit) {
			chain.limit(limit);
		}
		if (project) {
			chain.project(project);
		}

		return chain;
	},

	async setIgnoreTemplate(booking, autos, add = true) {
		if (!_.isArray(autos)) {
			autos = [autos];
		}

		await this.updateMany(
			{ otaName: booking.otaName, otaBookingId: booking.otaBookingId },
			add ? { $addToSet: { ignoreTemplate: { $each: autos } } } : { $pull: { ignoreTemplate: { $in: autos } } }
		);
	},

	async setDoneTemplate(booking, guest, auto, sentOtts) {
		const templates = auto.preTemplates ? [auto.template, ...auto.preTemplates] : [auto.template];
		const update = {};
		const csStatus = {};

		if (sentOtts.length) {
			// Gửi tin nhắn tự động thành công
			_.set(update, ['$addToSet', 'doneTemplate'], { $each: templates });
			_.set(update, ['$addToSet', 'doneTemplateOtts'], { template: templates[0], otts: sentOtts });

			if (templates.includes(AutoTemplates.Guide)) {
				_.set(update, ['$set', 'ignoreGuide'], true);
				_.set(update, ['$push', 'histories'], {
					description: 'bsent',
					createdAt: new Date(),
					system: false,
				});
				// hoàn thành tác vụ gửi thành công
				csStatus.guideStatus = BookingGuideStatus.Done;
				csStatus.guideDoneStatus = BookingGuideDoneStatus.Sent;
				csStatus.displayToday = true;
				csStatus.display = true;
			}
			if (templates.includes(AutoTemplates.Reservation) && !booking.isPaid) {
				// Đẩy sang danh sách chờ nhận phản hồi
				csStatus.guideStatus = BookingGuideStatus.WaitingForResponse;
				csStatus.displayToday = true;
				csStatus.display = true;
			}
			if (templates.includes(AutoTemplates.Review)) {
				_.set(update, ['$set', 'askReview'], BookingAskReview.ASKED);
			}
		} else {
			// Gửi thất bại
			// eslint-disable-next-line no-lonely-if
			if (!booking.guideStatus && templates.includes(AutoTemplates.Reservation)) {
				csStatus.guideStatus = BookingGuideStatus.CantContact;
				csStatus.displayToday = true;
				csStatus.display = true;

				if (isVNPhone(guest.phone)) {
					csStatus.callStatus = BookingCallStatus.NeedCall;
				} else if (
					LocalOTAs.Cozrum === booking.otaName ||
					LocalOTAs.CozrumExtend === booking.otaName ||
					OTAs.OwnerExtend === booking.otaName
				) {
					csStatus.guideStatus = BookingGuideStatus.Done;
					csStatus.guideDoneStatus = BookingGuideDoneStatus.GuestVIP;
				} else {
					// Đẩy sang danh sách cần liên hệ lại kênh bán
					csStatus.contactOTAStatus = BookingContactOTAStatus.CantContactGuest;
				}
			}
		}

		_.set(update, ['$set', 'lastTimeSent'], new Date());
		if (templates.includes(AutoTemplates.Reservation)) {
			_.set(update, ['$inc', 'countSentGuide'], 1);
		}

		if (!_.isEmpty(update)) {
			await this.updateMany({ otaBookingId: booking.otaBookingId, otaName: booking.otaName }, update);
		}
		// NEWCS
		if (!_.isEmpty(csStatus)) {
			newCSEventEmitter.emit(NEWCS_EVENTS.UPDATE_STATUS, booking, csStatus);
		}
	},
};

const BookingModel = mongoose.model('Booking', Booking, 'booking');

eventEmitter.on(EVENTS.CREATE_PAYOUT, payout => BookingModel.onUpdatePayout(payout));
eventEmitter.on(EVENTS.UPDATE_PAYOUT, payout => BookingModel.onUpdatePayout(payout));
eventEmitter.on(EVENTS.RESERVATION_UPDATE_PRICE, booking => BookingModel.updateBookingPaid(booking));
eventEmitter.on(EVENTS.RESERVATION_CANCEL, booking => BookingModel.updateBookingPaid(booking));
eventEmitter.on(EVENTS.RESERVATION, booking => BookingModel.updateBookingPaid(booking));

module.exports = BookingModel;

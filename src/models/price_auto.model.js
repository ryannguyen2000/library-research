const mongoose = require('mongoose');
const moment = require('moment');

const {
	DaysOfWeek,
	PromotionComparisonKey,
	PromotionComparisonType,
	PromotionChangeType,
	PromotionAutoTimeType,
	PromotionAutoOperation,
	PromotionExecType,
} = require('@utils/const');
const CustomTypes = require('@utils/mongoose/custom.types');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const PriceAutoSchema = new Schema(
	{
		name: { type: String, required: true },
		active: { type: Boolean, default: true },
		startDate: CustomTypes.Date,
		endDate: CustomTypes.Date,
		// autoType: Number, // 0 inday, 1 in a period,
		daysOfWeek: [{ type: String, enum: Object.values(DaysOfWeek) }], // 1,2,3,4,5,6,7 => cn,2,3,4,5,6,7
		activeOTAs: [String],
		blockId: { require: true, type: ObjectId, ref: 'Block' },
		ratePlanIds: [{ type: Number, ref: 'RatePlan' }],
		roomTypeIds: [{ type: ObjectId, ref: 'RoomTypeId' }],

		// priceState: [
		// 	{
		// 		_id: false,
		// 		date: String,
		// 		prevPrice: Number,
		// 		/* Giá ban đầu trước khi chạy auto lần đầu, dùng để set auto cho configs sau.
		// 		vd: config period 3 chạy thì config period 2 sẽ dùng giá này chạy giống như period 3 */
		// 		roomType: String,
		// 	},
		// ],

		// for dynamic type
		hours: { type: Number, min: 1 },
		timeType: {
			type: Number,
			enum: Object.values(PromotionAutoTimeType),
			default: PromotionAutoTimeType.Ahead,
		},
		comparisonTime: Date,
		operation: { type: String, enum: Object.values(PromotionAutoOperation) },

		comparisons: [
			{
				comparisonKey: { type: String, required: true, enum: Object.values(PromotionComparisonKey) },
				comparisonType: { type: Number, enum: Object.values(PromotionComparisonType) },
				// comparisonValue: { type: Number, required: true },
				thresholdOne: { type: String },
				thresholdTwo: { type: String },
				// priceChange: { type: Number, required: true },
				// priceChangeType: { type: String, enum: Object.values(PromotionChangeType) },
			},
		],

		execType: { type: Number, enum: Object.values(PromotionExecType) },
		execValue: { type: Number },
		valueChangeType: { type: String, enum: Object.values(PromotionChangeType) },

		minPrice: { type: Number, min: 0 },
		maxPrice: { type: Number, min: 0 },

		autoStates: [
			{
				_id: false,
				roomTypeId: { type: ObjectId, ref: 'RoomTypeId' },
				active: { type: Boolean },
			},
		],
		// autoState: { type: Number, enum: Object.values(PromotionExecType) },

		// minPrice: { type: Number, required: true, min: 0 },
		// maxPrice: { type: Number, required: true, min: 0 },

		hoursFreq: { type: Number, min: 0.1, default: 1 },

		lastTimeExecuted: Date,
		runTime: String, // YYYY-MM-DD HH-mm

		createdBy: { type: ObjectId, ref: 'User' },

		deleted: { type: Boolean, default: false },
		deletedBy: { type: ObjectId, ref: 'User' },

		// configs: [
		// 	{
		// 		_id: false,
		// 		timeStart: { type: String, require: true }, // thời gian chạy auto vd: 15:00
		// 		period: { type: Number, min: 0 }, // vd: set period: 1. hôm nay 2020-11-20, chạy auto set giá ngày 2020-11-21
		// 		expertPercentSelling: Number, // tỷ lệ kỳ vọng bán thêm vd: 5 (%)
		// 		minPercentIncrease: Number,
		// 		maxPercentIncrease: Number,
		// 		minPercentDecrease: Number,
		// 		maxPercentDecrease: Number,
		// 		bookingWindow: { type: Number, min: 0 }, // số ngày tính của booking window
		// 		bookingWindowDayCalc: { type: Number, min: 0 }, // số ngày cách ngày set giá để tính booking window
		// 		e: Number,
		// 		steps: [
		// 			{
		// 				minOcc: { type: Number, min: 0, max: 100 },
		// 				maxOcc: { type: Number, min: 0, max: 100 },
		// 				priceChange: Number,
		// 				_id: false,
		// 			},
		// 		],
		// 	},
		// ],
	},
	{ timestamps: true }
);

PriceAutoSchema.pre('save', function (next) {
	if (!this.daysOfWeek || !this.daysOfWeek.length) {
		this.daysOfWeek = Object.values(DaysOfWeek);
	}

	if (this.isModified('hours') || this.isModified('hoursFreq')) {
		this.runTime = null;
	}

	next();
});

PriceAutoSchema.methods = {
	async setNextRunTime() {
		const format = 'YYYY-MM-DD HH-mm';

		let mtime = moment(this.runTime, format);

		if (!mtime.isValid()) {
			mtime = moment();
		}

		this.runTime = mtime.add(this.hoursFreq || 1, 'hour').format(format);

		this.lastTimeExecuted = new Date();

		await this.save();
	},
};

module.exports = mongoose.model('PriceAuto', PriceAutoSchema, 'price_auto');

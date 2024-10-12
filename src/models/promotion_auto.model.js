const mongoose = require('mongoose');
const moment = require('moment');

const {
	PromotionRuleSetType,
	PromotionRuleSetBlockType,
	PromotionComparisonKey,
	PromotionComparisonType,
	DaysOfWeek,
	PromotionAutoOperation,
	PromotionAutoTimeType,
	PromotionExecType,
} = require('@utils/const');
const CustomTypes = require('@utils/mongoose/custom.types');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const PromotionAutoSchema = new Schema(
	{
		name: { type: String, required: true },
		active: { type: Boolean, default: true },
		type: {
			type: Number,
			enum: [PromotionRuleSetBlockType.Timer, PromotionRuleSetBlockType.Dynamic],
			default: PromotionRuleSetBlockType.Timer,
		},
		startDate: CustomTypes.Date,
		endDate: CustomTypes.Date,
		daysOfWeek: [{ type: String, enum: Object.values(DaysOfWeek) }], // 1,2,3,4,5,6,7 => cn,2,3,4,5,6,7
		promotionRulesetBlockId: { type: ObjectId, ref: 'PromotionRuleSetBlocks', required: true },
		promotionRuleTypes: [
			{
				_id: false,
				rule_type: { type: String, enum: Object.values(PromotionRuleSetType) },
				threshold_one: Number,
			},
		],

		// for timer type
		onTime: CustomTypes.Time,
		offTime: CustomTypes.Time,

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
				// minDiscount: { type: Number, min: 0 },
				// maxDiscount: { type: Number, min: 0 },

				thresholdOne: { type: String },
				thresholdTwo: { type: String },
				// threshold: { type: Number, required: true },
			},
		],

		execType: { type: Number, enum: Object.values(PromotionExecType) },
		execValue: { type: Number },
		minValue: { type: Number, min: 0 },
		maxValue: { type: Number, min: 0 },
		hoursFreq: { type: Number, min: 0.1 },

		lastTimeExecuted: Date,
		runTime: String, // YYYY-MM-DD HH-mm

		createdBy: { type: ObjectId, ref: 'User' },
		deleted: { type: Boolean, default: false },
		deletedAt: Date,
		deletedBy: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
	}
);

PromotionAutoSchema.pre('save', async function (next) {
	if (!this.daysOfWeek || !this.daysOfWeek.length) {
		this.daysOfWeek = Object.values(DaysOfWeek);
	}

	if (this.isModified('promotionRulesetBlockId')) {
		const promotionRulesetBlock = await mongoose
			.model('PromotionRuleSetBlocks')
			.findById(this.promotionRulesetBlockId)
			.select('ruleBlockType');

		this.type = promotionRulesetBlock.ruleBlockType;
	}

	if (this.isModified('hours') || this.isModified('hoursFreq')) {
		this.runTime = null;
	}

	next();
});

PromotionAutoSchema.methods = {
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

PromotionAutoSchema.statics = {
	//
};

module.exports = mongoose.model('PromotionAuto', PromotionAutoSchema, 'promotion_auto');

const mongoose = require('mongoose');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const {
	PolicyRuleDiscountTypes,
	PolicyTypes,
	PolicyRuleConditionTypes,
	PolicyRuleChargeTypes,
	// PolicyRuleChargeValueTypes,
} = require('@utils/const');

const { Schema } = mongoose;

const schema = {
	name: { type: String, required: true },
	displayName: { type: String },
	displayNameEn: { type: String },
	description: { type: String },
	type: { type: String, required: true, enum: Object.values(PolicyTypes) },
	rules: [
		{
			chargeType: { type: Number, enum: Object.values(PolicyRuleChargeTypes) },
			// chargeValueType: { type: Number, enum: Object.values(PolicyRuleChargeValueTypes) },
			conditionValue: Number,
			conditionValueMin: Number,
			conditionValueMax: Number,
			conditionType: { type: Number, enum: Object.values(PolicyRuleConditionTypes) },
			amountType: { type: Number, enum: Object.values(PolicyRuleDiscountTypes) }, // % | cố định
			amountValue: { type: Number, min: 0 },
		},
	],
	createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
	updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
	groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],

	deleted: { type: Boolean, default: false },
	deletedBy: {
		type: Schema.Types.ObjectId,
		ref: 'User',
	},
};

const PolicySchema = new Schema(schema, { timestamps: true });

PolicySchema.pre('save', function (next) {
	this.validateCancellationRules();
	this.validateExtraFeeRules();
	this.validateExtraHourRules();

	next();
});

PolicySchema.methods = {
	validateRuleAmount(rule) {
		if (!rule || !rule.amountType) {
			throw new ThrowReturn('rules.amountType is required!');
		}

		if (!_.isNumber(rule.amountValue)) {
			throw new ThrowReturn('rules.amountValue must be a numeric!');
		}

		if (rule.amountValue < 0) {
			throw new ThrowReturn('rules.amountValue must be higher than 0!');
		}

		if (rule.amountType === PolicyRuleDiscountTypes.Percentage) {
			if (rule.amountValue > 100 || rule.amountValue < 0) {
				throw new ThrowReturn('rules.amountValue must be beetween 0 and 100!');
			}
		}
	},

	validateCancellationRules() {
		if (this.type !== PolicyTypes.Cancellation) {
			return;
		}

		for (const rule of this.rules) {
			if (!rule || !rule.chargeType) {
				throw new ThrowReturn('rules.chargeType is required!');
			}

			if (rule.chargeType === PolicyRuleChargeTypes.NonRefundable) {
				continue;
			}

			this.validateRuleAmount(rule);

			if (rule.chargeType === PolicyRuleChargeTypes.Flexible) {
				rule.conditionType = PolicyRuleConditionTypes.Checkin;
				if (!_.isNumber(rule.conditionValue)) {
					throw new ThrowReturn('rules.conditionValue must be a numeric!');
				}
			}
		}
	},

	validateExtraFeeRules() {
		if (this.type !== PolicyTypes.ExtraFee) {
			return;
		}

		for (const rule of this.rules) {
			rule.conditionType = PolicyRuleConditionTypes.Age;

			this.validateRuleAmount(rule);

			if (!_.isNumber(rule.conditionValueMin)) {
				throw new ThrowReturn('rules.conditionValueMin is required!');
			}
			if (!_.isNumber(rule.conditionValueMax)) {
				throw new ThrowReturn('rules.conditionValueMax is required!');
			}
		}
	},

	validateExtraHourRules() {
		if (this.type !== PolicyTypes.ExtraHour) {
			return;
		}

		const allowTypes = [PolicyRuleConditionTypes.Checkin, PolicyRuleConditionTypes.Checkout];

		for (const rule of this.rules) {
			if (!allowTypes.includes(rule.conditionType)) {
				throw new ThrowReturn(`rules.conditionType must be 1 or 2!`);
			}

			this.validateRuleAmount(rule);

			// if (!_.isNumber(rule.conditionValueMin)) {
			// 	throw new ThrowReturn('rules.conditionValueMin is required!');
			// }
			// if (!_.isNumber(rule.conditionValueMax)) {
			// 	throw new ThrowReturn('rules.conditionValueMax is required!');
			// }
		}
	},
};

module.exports = mongoose.model('Policy', PolicySchema, 'policy');

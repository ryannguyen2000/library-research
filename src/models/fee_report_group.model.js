const { Schema, model } = require('mongoose');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { HOST_REPORT_FEE_GROUP_DEFAULT } = require('@utils/report');
const { logger } = require('@utils/logger');

const { ObjectId } = Schema.Types;

const FeeReportGroupSchema = new Schema(
	{
		blockIds: [{ type: ObjectId, ref: 'Block' }],
		isSplitDistribute: { type: Boolean, default: false },
		groups: [
			{
				key: String,
				name: {
					vi: String,
					en: String,
				},
				costRate: Number, // tính vào tỉ lệ chi phí của Cozrum
				categories: [{ type: ObjectId, ref: 'PayoutCategory' }],
				hiddenOnNull: { type: Boolean, default: false },
				isOther: Boolean,
				calcDistribute: Boolean,
			},
		],
	},
	{
		timestamps: true,
	}
);

FeeReportGroupSchema.statics = {
	async getFeeReportGroup(blockId) {
		const feeReportGroup = _.first(
			await this.find({
				blockIds: blockId ? { $in: [blockId, null] } : null,
			})
				.sort({ blockIds: -1 })
				.limit(1)
				.lean()
		);

		if (!feeReportGroup) throw new ThrowReturn('BlockId invalid');
		const groupPayoutCategorys = _.flatten(_.map(feeReportGroup.groups, 'categories'));
		const other = _.find(feeReportGroup.groups, { isOther: true });

		if (other) {
			const payoutCategorys = _.map(
				await this.model('PayoutCategory')
					.find({
						_id: { $nin: groupPayoutCategorys },
						// cost: true,
					})
					.select('_id')
					.lean(),
				'_id'
			);
			other.categories = payoutCategorys;
			feeReportGroup.groups.push(other);
		}

		return feeReportGroup;
	},

	async initial() {
		try {
			const defaultFeeGroup = await this.findOne({ blockIds: null });
			if (!defaultFeeGroup) {
				const payoutCategorys = await this.model('PayoutCategory').find();

				const groups = _.map(_.entries(HOST_REPORT_FEE_GROUP_DEFAULT), item => {
					const [key, value] = item;
					const categories = _.filter(payoutCategorys, i => i.reportGroup === key);
					return {
						categories: categories || [],
						...value,
					};
				});

				await this.create({ groups });
			}
		} catch (e) {
			logger.error('FeeReportGroup initial', e);
		}
	},
};

const Model = model('FeeReportGroup', FeeReportGroupSchema, 'fee_report_group');

module.exports = Model;

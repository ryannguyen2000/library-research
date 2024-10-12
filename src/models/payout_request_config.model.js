const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');
const { TransactionStatus } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;

const PayoutConfigSchema = new Schema(
	{
		role: { type: String, required: true },
		categoryIds: [{ type: Schema.Types.ObjectId, ref: 'PayoutCategory' }],
		maxAmountPerDay: { type: Number },
		maxAmountPerTime: { type: Number },
		// reachMaxAmountMsg: { type: String },
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
		userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
		// reachLimitAmountMsg: { type: String },
		approveIndex: { type: Number },
		upLevelMsgRequest: { type: String },
		allowApproveByMsg: { type: Boolean },
		allowCreateRequestOnReachLimit: { type: Boolean },
	},
	{
		timestamps: true,
	}
);

PayoutConfigSchema.statics = {
	async checkPermission({ user, amount, categoryId, decline }) {
		const categoryIds = _.isArray(categoryId) ? categoryId : [categoryId];

		const config = await this.findOne({
			$and: [
				{
					$or: [
						{
							categoryIds: { $all: categoryIds },
						},
						{
							categoryIds: { $eq: [] },
						},
					],
				},
				{
					$or: [
						{
							role: user.role,
							groupIds: { $in: user.groupIds },
						},
						{
							userIds: user._id,
						},
					],
				},
			],
		}).sort({ userIds: -1 });

		if (!config) {
			throw new ThrowReturn('Bạn không có quyền thực hiện tác vụ này!');
		}

		if (decline) {
			return {
				...config.toJSON(),
				code: 0,
			};
		}

		if (config.maxAmountPerTime !== -1 && amount > config.maxAmountPerTime) {
			return {
				...config.toJSON(),
				code: 1,
				msg: 'Khoản chi vượt quá giới hạn cho phép trong 1 lần duyệt của bạn!',
			};
		}

		if (config.maxAmountPerDay !== -1) {
			const userFilter = {
				enable: true,
				groupIds: { $in: user.groupIds },
			};
			if (config.userIds && config.userIds.length) {
				userFilter._id = { $in: config.userIds };
			} else {
				userFilter.role = user.role;
			}

			const users = await this.model('User').find(userFilter).select('_id');

			const payoutFilter = {
				paidAt: { $gte: moment().startOf('day').toDate(), $lte: moment().endOf('day').toDate() },
				payStatus: TransactionStatus.SUCCESS,
				payConfirmedBy: { $in: _.map(users, '_id') },
			};
			if (config.categoryIds && config.categoryIds.length) {
				payoutFilter.categoryId = { $in: config.categoryIds };
			}

			const todayPayments = await this.model('Payout')
				.find(payoutFilter)
				.select('currencyAmount.exchangedAmount');

			const paidToday = _.sumBy(todayPayments, p => Math.abs(p.currencyAmount.exchangedAmount)) || 0;

			if (paidToday > config.maxAmountPerDay) {
				return {
					...config.toJSON(),
					code: 2,
					msg: 'Khoản chi đã vượt quá giới hạn cho phép trong 1 ngày của bạn!',
				};
			}
		}

		return {
			...config.toJSON(),
			code: 0,
		};
	},
};

module.exports = mongoose.model('PayoutRequestConfig', PayoutConfigSchema, 'payout_request_config');

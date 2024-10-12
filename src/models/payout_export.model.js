const mongoose = require('mongoose');
const _ = require('lodash');
const AsyncLock = require('async-lock');

const ThrowReturn = require('@core/throwreturn');
const {
	PayoutType,
	PayoutTypeCode,
	PayoutStates,
	OTA_PAYMENT_METHODS,
	TransactionStatus,
	RolePermissons,
} = require('@utils/const');
const { getIdsByQuery } = require('@utils/mongo');
const { eventEmitter, EVENTS } = require('@utils/events');
const SMSmodel = require('./sms.model');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const PayoutExportSchema = new Schema(
	{
		noId: String,
		payoutType: {
			type: String,
			default: PayoutType.RESERVATION,
			enum: Object.values(PayoutType),
		},
		source: String,
		sourceValue: String,
		name: String,
		confirmedBy: { type: ObjectId, ref: 'User' },
		confirmedDate: Date,
		createdBy: { type: ObjectId, ref: 'User' },
		payouts: [{ type: ObjectId, ref: 'Payout' }],
		payoutFees: [{ type: ObjectId, ref: 'Payout' }],
		currencyAmount: {
			USD: Number,
			VND: { type: Number, default: 0 },
		},
		totalTransactionFee: Number,
		state: { type: String, enum: Object.values(PayoutStates) },
		approved: [
			{
				_id: false,
				user: { type: ObjectId, ref: 'User' },
				state: String,
				date: Date,
			},
		],
		paymentMethod: { type: Number, enum: Object.values(OTA_PAYMENT_METHODS) },
		paymentMethodName: { type: String },
		collectionIds: [{ type: ObjectId, ref: 'PaymentCollection' }],
		cardIds: [{ type: ObjectId, ref: 'PaymentCard' }],
		attachments: [String],
		confirmationAttachments: [String],
		handoverId: { type: ObjectId, ref: 'Handover' },
		transactionIds: [{ type: String, ref: 'BankTransaction' }],
		description: String,
		paidInfo: String,
		printBill: { type: Boolean, default: false },
		billNo: String,
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		blockIds: [{ type: ObjectId, ref: 'Block' }],
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

PayoutExportSchema.pre('save', async function (next) {
	this.$locals.isModifiedPayout = this.isModified('payouts');
	this.$locals.isModifiedState = this.isModified('state');
	this.$locals.isModifiedConfirmed = this.isModified('confirmedDate');
	this.$locals.isNew = this.isNew;

	if (this.isNew && this.payouts.length) {
		const payout = await mongoose
			.model('Payout')
			.findOne({ _id: this.payouts, inReport: true, multipleReport: { $ne: true } })
			.select('_id');
		if (payout) {
			throw new ThrowReturn('Có thanh toán đã được tạo báo cáo!');
		}
	}

	if (this.$locals.isModifiedPayout) {
		await this.syncAmount();
	}

	next();
});

PayoutExportSchema.post('save', async function () {
	if (this.$locals.isModifiedPayout && this.$locals.oldPayouts) {
		const payouts = _.differenceBy(this.$locals.oldPayouts, this.payouts, _.toString);
		await PayoutExport.setInReport(payouts, false);
	}

	if (this.$locals.isModifiedPayout || (this.$locals.isModifiedState && this.state === PayoutStates.DELETED)) {
		const payouts = _.differenceBy(this.payouts, this.$locals.oldPayouts, _.toString);
		await PayoutExport.setInReport(payouts, this.state !== PayoutStates.DELETED);
	}

	if (!this.$locals.isNew && this.$locals.isModifiedConfirmed) {
		await mongoose
			.model('Payout')
			.confirmPayout(
				this.confirmedBy,
				this.payouts,
				this.confirmedDate
					? PayoutStates.CONFIRMED
					: this.payoutType === PayoutType.PAY
					? PayoutStates.PROCESSING
					: PayoutStates.TRANSFERRED
			);
	}
});

PayoutExportSchema.methods = {
	isApproved() {
		return this.approved.length > 0;
	},

	async syncAmount(runSave) {
		if (this.payouts && this.payouts.length) {
			await PayoutExport.AsyncLock.acquire(_.map(this.payouts, _.toString), async () => {
				const stats = await PayoutExport.calcPayouts(this.payouts);

				this.blockIds = stats.blockIds || [];
				this.currencyAmount.VND = stats.totalAmount || 0;
				this.totalTransactionFee =
					(this.payoutFees && this.payoutFees.length
						? _.get(await PayoutExport.calcPayouts(this.payoutFees), 'totalFee', 0)
						: stats.totalFee) || 0;
			});
		} else {
			this.blockIds = [];
			if (this.payoutType !== PayoutType.PREPAID) {
				this.currencyAmount.VND = 0;
				this.totalTransactionFee = 0;
			}
		}

		if (runSave) {
			await this.save();
		}
	},

	async validateUpdate(user) {
		if (this.state === PayoutStates.DELETED) {
			throw new ThrowReturn('Already deleted!');
		}
		if (this.handoverId) {
			throw new ThrowReturn('Bàn giao ca tự động không thể sửa!');
		}

		if (
			await user.hasPermission(
				this.payoutType === PayoutType.RESERVATION
					? RolePermissons.FINANCE_APPROVE_REPORT
					: RolePermissons.FINANCE_APPROVE_PAYOUT
			)
		) {
			return;
		}

		if (this.confirmedBy || this.approved.length) {
			throw new ThrowReturn('Payout already confirmed!');
		}
		if ((this.createdBy && this.createdBy.equals(user._id)) || (await user.isHigherRole(this.createdBy))) {
			return;
		}
		throw new ThrowReturn().status(403);
	},

	async confirm({ userId } = {}) {
		this.confirmedBy = userId;
		this.confirmedDate = new Date();
		await this.save();
	},
};

PayoutExportSchema.statics = {
	AsyncLock: new AsyncLock(),

	async syncPayState(payoutIds, request) {
		if (!payoutIds || !payoutIds.length) return;

		const reports = await this.find({
			payoutType: PayoutType.PAY,
			payouts: { $in: payoutIds },
			state: { $ne: PayoutStates.DELETED },
		});
		if (!reports.length) return;

		const Payout = this.model('Payout');

		await reports.asyncMap(async report => {
			if (!report || report.state === PayoutStates.PAID) return;

			const notSuccessPayout = await Payout.findOne({
				_id: report.payouts,
				payStatus: { $ne: TransactionStatus.SUCCESS },
			}).select('_id');

			if (!notSuccessPayout) {
				const approved = [];

				_.range(4).forEach(i => {
					approved[i] = report.approved[i] || { user: null };
				});
				const date = _.get(request, 'approvedAt') || new Date();

				if (!approved[3].date) {
					approved[3] = { date, state: PayoutStates.PAID };
				}

				report.approved = approved;
				report.state = PayoutStates.PAID;
				report.confirmedDate = report.confirmedDate || date;
				report.confirmedBy = report.confirmedBy || _.get(request, 'approvedBy');

				await report.save();
			}
		});
	},

	async calcPayouts(payoutIds) {
		if (!payoutIds || !payoutIds.length) return null;

		const group = await this.model('Payout')
			.aggregate()
			.match({
				_id: { $in: payoutIds },
				state: { $ne: PayoutStates.DELETED },
			})
			.project({
				blockIds: 1,
				'currencyAmount.exchangedAmount':
					this.payoutType === PayoutType.RESERVATION
						? {
								$cond: [
									{ $eq: ['$payoutType', PayoutType.REFUND] },
									{ $subtract: [0, { $abs: '$currencyAmount.exchangedAmount' }] },
									'$currencyAmount.exchangedAmount',
								],
						  }
						: 1,
				transactionFee: 1,
			})
			.unwind('$blockIds')
			.group({
				_id: null,
				blockIds: { $addToSet: '$blockIds' },
				totalAmount: { $sum: '$currencyAmount.exchangedAmount' },
				totalFee: { $sum: '$transactionFee' },
			});

		return _.get(group, [0]) || {};
	},

	async list(
		{ start, limit, name, sms, confirmed, confirmedBy, from, to, payoutType, createdBy, dateKey, confirmPaid },
		user
	) {
		const query = {};
		dateKey = dateKey || 'createdAt';
		name = _.trim(name);
		sms = _.trim(sms);
		const isPay = payoutType === PayoutType.PAY || payoutType === PayoutType.PREPAID;

		if (payoutType) {
			query.payoutType = payoutType;
		}
		if (from) {
			_.set(query, [dateKey, '$gte'], from);
		}
		if (to) {
			_.set(query, [dateKey, '$lte'], to);
		}
		if (createdBy) {
			query.createdBy = createdBy;
		}
		if (user) {
			const { blockIds } = await this.model('Host').getBlocksOfUser({ user });
			query.$and = query.$and || [];
			query.$and.push({
				$or: [
					{
						createdBy: user._id,
					},
					{
						blockIds: { $in: blockIds },
					},
					{
						groupIds: { $in: user.groupIds },
					},
				],
			});
		}

		if (name) {
			query.$and = query.$and || [];
			const regExp = new RegExp(_.escapeRegExp(name), 'i');

			if (isPay) {
				query.$and.push({
					$or: [{ name: regExp }, { noId: regExp }],
				});
			} else {
				const bookingIds = await getIdsByQuery(this.model('Booking'), { otaBookingId: name });
				const payoutIds = await getIdsByQuery(this.model('Payout'), { bookingId: { $in: bookingIds } });
				query.$and.push({
					$or: [{ name: regExp }, { description: regExp }, { payouts: { $in: payoutIds } }],
				});
			}
		}
		if (sms) {
			const smsIds = await getIdsByQuery(SMSmodel.getModel(), {
				payoutId: { $ne: null },
				'data.body': new RegExp(_.escapeRegExp(sms), 'i'),
			});
			const payoutIds = await getIdsByQuery(this.model('Payout'), { smsId: { $in: smsIds } });
			query.payouts = {
				$in: payoutIds,
			};
		}
		if (confirmed !== undefined) {
			confirmed = confirmed === 'true';
			if (isPay) {
				query.$and = query.$and || [];
				if (confirmed) {
					query.$and.push({
						$or: [
							{
								'approved.0.date': { $exists: true },
							},
							{
								'approved.1.date': { $exists: true },
							},
							{
								'approved.2.date': { $exists: true },
							},
						],
					});
				} else {
					query['approved.0.date'] = { $exists: false };
					query['approved.1.date'] = { $exists: false };
					query['approved.2.date'] = { $exists: false };
				}
			} else {
				query.confirmedDate = { $exists: confirmed };
			}
		}
		if (confirmPaid !== undefined) {
			query['approved.3.date'] = { $exists: confirmPaid === 'true' };
			// query.state = confirmPaid === 'true' ? PayoutStates.PAID : { $ne: PayoutStates.PAID };
		}
		if (confirmedBy) {
			query.confirmedBy = confirmedBy;
		}

		const exports = await this.find(query)
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip(start)
			.select('-payouts')
			.populate('confirmedBy', 'username name')
			.populate('createdBy', 'username name')
			.populate('approved.user', 'username name');
		const total = await this.countDocuments(query);

		return { exports, total };
	},

	async setInReport(payoutIds, inReport = true) {
		if (!payoutIds || !payoutIds.length) return;

		await this.model('Payout').updateMany({ _id: payoutIds }, { $set: { inReport } });

		payoutIds.forEach(id => {
			eventEmitter.emit(EVENTS.UPDATE_CASH_FLOW, { payoutId: id });
		});
	},

	createExport(data) {
		return this.AsyncLock.acquire(_.toString(data.payoutType), async () => {
			const newest = await this.findOne({ payoutType: data.payoutType }).sort({ createdAt: -1 }).select('noId');

			const id = Number(newest.noId.replace(/[^\d]/g, '')) + 1;
			data.noId = `${PayoutTypeCode[data.payoutType] || ''}${id}`;

			const payout = await this.create(data);
			return payout;
		});
	},

	async deleteExport(id, user) {
		const data = await this.findById(id);
		if (!data) {
			throw new ThrowReturn(`Export not found`);
		}

		await data.validateUpdate(user);

		data.state = PayoutStates.DELETED;
		await data.save();

		return data;
	},

	async printBill(id, billNo) {
		const data = await this.findById(id);
		if (!data.confirmedBy) {
			throw new ThrowReturn('Not yet confirmed');
		}
		data.printBill = true;
		data.billNo = billNo || data.billNo;
		await data.save();
		return data;
	},

	async syncAmountByPayout(payoutId) {
		const data = await this.findOne({ payouts: payoutId });
		if (data) {
			await data.syncAmount(true);
		}
	},
};

const PayoutExport = mongoose.model('PayoutExport', PayoutExportSchema, 'payout_export');

module.exports = PayoutExport;

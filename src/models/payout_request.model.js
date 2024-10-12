const mongoose = require('mongoose');
const _ = require('lodash');
const AsyncLock = require('async-lock');

const { Currency, TransactionStatus, TaskPriority, PayoutPayMethods, PayoutPaySources } = require('@utils/const');
const { removeSpecChars } = require('@utils/generate');
// const { logger } = require('@utils/logger');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const syncLock = new AsyncLock();

const PayoutRequestSchema = new Schema(
	{
		no: { type: Number },
		createdBy: { type: ObjectId, ref: 'User' },
		amount: { type: Number },
		currency: { type: String, default: Currency.VND },
		status: { type: String, enum: Object.values(TransactionStatus), default: TransactionStatus.WAIT_FOR_APPROVE },
		approvedBy: { type: ObjectId, ref: 'User' },
		approvedAt: { type: Date },
		approvedFrom: { type: String, enum: Object.values(PayoutPaySources) },
		debitAccountId: { type: ObjectId, ref: 'BankAccount', required: true },
		payouts: [
			{
				amount: { type: Number },
				payoutId: { type: ObjectId, ref: 'Payout' },
				categoryId: { type: ObjectId, ref: 'PayoutCategory' },
				creditAccountId: { type: ObjectId, ref: 'BankAccount' },
				transactionId: { type: String, ref: 'BankTransaction' },
				status: {
					type: String,
					enum: Object.values(TransactionStatus),
				},
				reported: Boolean,
				reportedBy: { type: ObjectId, ref: 'User' },
				reportedAt: { type: Date },
			},
		],
		payMethod: { type: String, enum: Object.values(PayoutPayMethods) },
		dataAPI: { type: Mixed },
		dataAPIStatus: { type: String, enum: Object.values(TransactionStatus) },
		priority: { type: Number, enum: Object.values(TaskPriority), default: TaskPriority.Normal },
		description: String,
		payDescription: String,
		mergeTransaction: { type: Boolean, default: false },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		blockIds: [{ type: ObjectId, ref: 'Block' }],
		roomIds: [{ type: ObjectId, ref: 'Room' }],
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

PayoutRequestSchema.pre('save', async function (next) {
	if (this.isNew) {
		const last = await Model.findOne().sort({ no: -1 }).select('no');
		this.no = last ? last.no + 1 : 1000000;
	}
	if (this.isModified('payDescription')) {
		this.payDescription = this.payDescription ? removeSpecChars(this.payDescription) : undefined;
	}

	if (this.blockIds) {
		this.blockIds = _.uniqBy(this.blockIds, _.toString);
	}

	this.amount = _.sumBy(this.payouts, 'amount') || this.amount;

	next();
});

PayoutRequestSchema.methods = {
	setStatus(status) {
		this.status = status;
		this.payouts.forEach(payout => {
			payout.status = status;
		});
	},

	unprocessedPayouts() {
		return _.filter(
			this.payouts,
			p => p.status === TransactionStatus.PROCESSING || p.status === TransactionStatus.WAIT_FOR_APPROVE
		);
	},
};

PayoutRequestSchema.statics = {
	async syncPayoutLock(requestId, payoutId) {
		const payout = await this.model('Payout')
			.findById(payoutId)
			.select('payStatus currencyAmount categoryId payConfirmedBy');

		const currentTransaction = await this.model('BankTransaction')
			.findOne({
				status: payout.payStatus,
				$or: [
					{
						payoutId: payout._id,
					},
					{
						requestId,
						payoutId: null,
					},
				],
			})
			.sort({ createdAt: -1 });

		const set = {
			'payouts.$.status': payout.payStatus,
			'payouts.$.categoryId': payout.categoryId,
			'payouts.$.amount': payout.currencyAmount.exchangedAmount,
		};
		if (currentTransaction) {
			set['payouts.$.transactionId'] = currentTransaction._id;
		}

		const request = await this.findOneAndUpdate(
			{ _id: requestId, 'payouts.payoutId': payout._id },
			{
				$set: set,
			},
			{
				new: true,
			}
		);

		if (!request || request.status === TransactionStatus.SUCCESS) return;

		if (!request.approvedAt && payout.payStatus === TransactionStatus.SUCCESS) {
			request.approvedAt = currentTransaction ? currentTransaction.createdAt : new Date();

			if (!request.approvedFrom) {
				request.approvedFrom = PayoutPaySources.BankApp;
			}
		}
		if (!request.approvedBy && payout.payConfirmedBy) {
			request.approvedBy = payout.payConfirmedBy;
		}

		const isDone = request.payouts.every(
			p => p.status === TransactionStatus.SUCCESS || p.status === TransactionStatus.ERROR
		);
		if (isDone) {
			const isError = request.payouts.some(p => p.status === TransactionStatus.ERROR);
			request.status = isError ? TransactionStatus.ERROR : TransactionStatus.SUCCESS;
		}

		await request.save();

		if (isDone) {
			await this.model('PayoutExport').syncPayState(_.map(request.payouts, 'payoutId'), request);
		}
	},

	async syncPayout(requestId, payoutId) {
		if (!requestId || !payoutId) return;

		return await syncLock.acquire(_.toString(requestId || payoutId), async () => {
			return await this.syncPayoutLock(requestId, payoutId);
		});
	},
};

const Model = mongoose.model('PayoutRequest', PayoutRequestSchema, 'payout_request');

module.exports = Model;

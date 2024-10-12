const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const BankServices = require('@services/bank');
const { TransactionTypes, TransactionStatus, PayoutType, PayoutStates } = require('@utils/const');
const { logger } = require('@utils/logger');
const SMSmodel = require('./sms.model');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		_id: String,
		accountId: { type: ObjectId, ref: 'BankAccount' },
		accountNo: String,
		bankName: String,
		bankCode: String,
		data: Mixed,
		reqData: Mixed,
		meta: {
			amount: Number,
			balance: Number,
			cardNumber: String,
			accountNo: String,
			accountName: String,
			transactionType: String,
			transactionId: String,
			clientMessageId: String,
			transferType: String,
			date: String,
			transactionFee: Number,
		},
		transType: { type: String, enum: _.values(TransactionTypes) },
		status: { type: String, enum: _.values(TransactionStatus) },
		statusDescription: { type: String },
		statusText: { type: Mixed },
		docNo: String, // field group - Purchase and Mercht fee mush have same docNo
		isFee: Boolean,
		tranTime: Date,
		hasRetried: Boolean,
		smsId: { type: ObjectId, ref: () => SMSmodel.getModel() },
		payoutId: { type: ObjectId, ref: 'Payout' },
		payoutIds: [{ type: ObjectId, ref: 'Payout' }],
		requestId: { type: ObjectId, ref: 'PayoutRequest' },
		hasPayout: { type: Boolean, default: false },
		attachmentCreated: { type: Boolean, default: false },
		attachment: { type: String },
		fromAPI: Boolean,
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

ModelSchema.pre('save', async function (next) {
	if (!this.tranTime && !this.payoutId) {
		const getFields = _.get(BankServices, [this.bankName, 'getFields']);
		if (getFields) {
			_.assign(this, getFields(this.data));
		}
	}

	if (!this.meta || _.isEmpty(this.meta.toJSON())) {
		const getMeta = _.get(BankServices, [this.bankName, 'getMeta']);
		if (getMeta) {
			this.meta = getMeta(this.data);
		}
	}

	this.isFee = !!this.meta && this.meta.amount < 0;

	await this.getPayRequestData();

	this.hasPayout = !!(this.payoutId || this.requestId);

	this.$locals.isNew = this.isNew;
	this.$locals.isModifiedStatus = this.isModified('status');
	this.$locals.isModifiedPayout = this.isModified('payoutId');

	next();
});

ModelSchema.post('save', async function (doc) {
	if (!doc.smsId && doc.meta && !doc.isFee) {
		doc.syncSMSId().catch(e => {
			logger.error('syncSMSId', e);
		});
	}
	if (!doc.hasRetried && doc.payoutId && (doc.$locals.isModifiedStatus || doc.$locals.isModifiedPayout)) {
		await doc.syncPayoutStatus().catch(e => {
			logger.error('syncPayoutStatus', e);
		});
	}
	if (!doc.hasRetried && doc.$locals.requestPayouts) {
		await doc.syncPayoutsStatus().catch(e => {
			logger.error('syncPayoutsStatus', e);
		});
	}
});

ModelSchema.methods = {
	async getPayRequestData() {
		if (this.payoutId) return;

		const isDone = this.status === TransactionStatus.SUCCESS && this.accountNo;
		if (!isDone) return;

		if (this.requestId) {
			const request = await mongoose
				.model('PayoutRequest')
				.findOne({
					_id: this.requestId,
					status: { $in: [TransactionStatus.PROCESSING, TransactionStatus.WAIT_FOR_APPROVE] },
				})
				.select('payouts');

			if (request) {
				this.$locals.requestPayouts = request.unprocessedPayouts().map(p => p.payoutId);
			}
			return;
		}

		const BankAccount = mongoose.model('BankAccount');

		const bankAccounts = await BankAccount.find({ active: true, accountNos: this.accountNo }).select('_id');
		if (!bankAccounts.length) return;

		const accountIds = _.map(bankAccounts, '_id');

		const payoutFilter = {
			payoutType: PayoutType.PAY,
			state: { $ne: PayoutStates.DELETED },
			payStatus: { $in: [TransactionStatus.PROCESSING, TransactionStatus.WAIT_FOR_APPROVE] },
			'currencyAmount.exchangedAmount': Math.abs(this.meta.amount),
			updatedAt: {
				$gte: moment(this.tranTime).subtract(1, 'day').toDate(),
			},
			createdAt: {
				$lte: this.tranTime,
			},
		};
		if (this.isFee) {
			payoutFilter.payDebitAccountId = { $in: accountIds };
		} else {
			payoutFilter.payAccountId = { $in: accountIds };
		}

		const reciprocalAccount =
			this.data && this.data.reciprocalAccount && this.data.reciprocalAccount.replace(/\D/g, '');

		if (reciprocalAccount) {
			const creditAccounts = await BankAccount.find({ active: true, accountNos: reciprocalAccount }).select(
				'_id'
			);
			if (creditAccounts.length) {
				if (this.isFee) {
					payoutFilter.payAccountId = { $in: _.map(creditAccounts, '_id') };
				} else {
					payoutFilter.payDebitAccountId = { $in: _.map(creditAccounts, '_id') };
				}
			}
		}

		const PayoutModel = mongoose.model('Payout');

		const payouts = await PayoutModel.find(payoutFilter).select('_id payRequestId').populate('export', 'noId');

		if (payouts.length) {
			const { content } = this.data || {};
			let payout;

			if (content && payouts.length > 1) {
				payout = payouts.find(p => p.export && content.includes(p.export.noId));
			}
			if (!payout) {
				[payout] = payouts;
			}

			this.payoutId = payout._id;
			if (payout.payRequestId && !this.requestId) {
				this.requestId = payout.payRequestId;
			}
		}
		if (this.requestId) return;

		const PRModel = mongoose.model('PayoutRequest');

		const requests = await PRModel.find({
			debitAccountId: { $in: accountIds },
			status: { $in: [TransactionStatus.PROCESSING, TransactionStatus.WAIT_FOR_APPROVE] },
		});

		if (!requests.length) return;

		const totalAmount = Math.abs(this.meta.amount);
		const request = requests.find(r => r.amount === totalAmount);

		if (request) {
			this.requestId = request._id;
			this.$locals.requestPayouts = _.map(request.payouts, 'payoutId');
		} else {
			await PRModel.populate(requests, {
				path: 'debitAccountId payouts.creditAccountId',
				select: 'bankId',
			});

			for (const req of requests) {
				const unprocessedPayouts = req.unprocessedPayouts();

				const sameBankPayouts = unprocessedPayouts.filter(p =>
					p.creditAccountId.bankId.equals(req.debitAccountId.bankId)
				);
				if (totalAmount === _.sumBy(sameBankPayouts, 'amount')) {
					this.requestId = req._id;
					this.payoutIds = _.map(sameBankPayouts, 'payoutId');
					this.$locals.requestPayouts = this.payoutIds;

					return;
				}

				const notSameBankPayouts = unprocessedPayouts.filter(
					p => !p.creditAccountId.bankId.equals(req.debitAccountId.bankId)
				);
				if (totalAmount === _.sumBy(notSameBankPayouts, 'amount')) {
					this.requestId = req._id;
					this.payoutIds = _.map(notSameBankPayouts, 'payoutId');
					this.$locals.requestPayouts = this.payoutIds;

					return;
				}
			}
		}
	},

	async syncSMSId() {
		const smsRef = await this.createSMS();
		await Model.updateOne({ _id: this._id }, { smsId: smsRef._id });
	},

	async syncPayoutStatus() {
		const payout = await mongoose.model('Payout').findById(this.payoutId);
		if (payout) {
			payout.payStatus = this.status;
			await payout.save();
		}
	},

	async syncPayoutsStatus() {
		const payouts = await mongoose.model('Payout').find({ _id: this.$locals.requestPayouts });
		await payouts.asyncMap(payout => {
			payout.payStatus = this.status;
			if (this.attachment && !payout.historyAttachments.includes(this.attachment)) {
				payout.historyAttachments.push(this.attachment);
			}
			return payout.save();
		});
	},

	async createSMS() {
		const getSMSText = _.get(BankServices, [this.bankName, 'getSMSText']);

		const SModel = SMSmodel.getModel();

		const sms = await SModel.findOne({ phone: this.bankName, meta: this.meta });
		if (sms) {
			await SModel.updateOne(
				{ _id: sms._id },
				{
					$set: {
						'data.body': getSMSText ? getSMSText(this) : '',
						transId: this._id,
					},
				}
			);
			return sms;
		}

		return SModel.create({
			account: this.accountNo,
			phone: this.bankName,
			data: {
				_id: this._id,
				date: this.tranTime.valueOf(),
				body: getSMSText ? getSMSText(this) : '',
				amount: this.meta.amount,
			},
			transId: this._id,
		});
	},
};

ModelSchema.statics = {
	findTransactonsFromCollector({ collector, startTime, endTime, amount }) {
		if (!collector || !collector.bankingSearchRegex) return;

		const regex = new RegExp(collector.bankingSearchRegex);
		startTime = startTime || moment().subtract(7, 'day').startOf('day').toDate();

		const tranTime = { $gte: startTime };
		if (endTime) {
			tranTime.$lte = endTime;
		}

		const { roundedValue } = collector;

		return this.aggregate()
			.match({
				tranTime,
				$or: [
					{
						'data.content': regex,
					},
					{
						'data.description': regex,
					},
				],
			})
			.group({
				_id: {
					time: { $dateToString: { format: '%d-%m-%Y-%H', date: '$tranTime', timezone: '+07:00' } },
					accountNo: '$accountNo',
				},
				amount: { $sum: '$meta.amount' },
				transactionIds: { $push: '$_id' },
				smsIds: { $push: '$smsId' },
			})
			.match({
				amount: roundedValue
					? {
							$gte: amount - roundedValue,
							$lte: amount + roundedValue,
					  }
					: amount,
			});
	},
};

const Model = mongoose.model('BankTransaction', ModelSchema, 'bank_transaction');

module.exports = Model;

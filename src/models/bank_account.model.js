const _ = require('lodash');
const mongoose = require('mongoose');

const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { removeAccents } = require('@utils/generate');
const {
	BANK_ACCOUNT_TYPE,
	BANK_ACCOUNT,
	TransactionTypes,
	SYS_BANK_ACCOUNT_TYPE,
	BANK_ACCOUNT_SOURCE_TYPE,
} = require('@utils/const');
const { decryptData } = require('@utils/crypto');
const BankServices = require('@services/bank');

const { Schema } = mongoose;
const { Mixed, ObjectId } = Schema.Types;

const ModelSchema = new Schema(
	{
		no: { type: String },
		name: { type: String, required: true },
		fullName: String,
		shortName: String,
		bankCode: String,
		displayOnWeb: Boolean,
		displayContent: String,
		displayNote: String,
		username: { type: String },
		password: { type: String },
		accountNos: [{ type: String }],
		accountName: { type: String },
		nationalId: String,
		taxCode: String,
		phoneNumber: String,
		address: String,
		branch: String,
		sourceType: {
			type: String,
			enum: _.values(BANK_ACCOUNT_SOURCE_TYPE),
			default: BANK_ACCOUNT_SOURCE_TYPE.BANKING,
		},
		description: String,
		accountType: { type: String, enum: _.values(BANK_ACCOUNT_TYPE), default: BANK_ACCOUNT_TYPE.PERSONAL },
		type: [{ type: String, enum: _.values(BANK_ACCOUNT), default: BANK_ACCOUNT.PARTER }],
		transType: [{ type: String, enum: _.values(TransactionTypes) }],
		validated: { type: Boolean, default: false },
		serviceAccountId: { type: ObjectId, ref: 'BankServiceAccount' },
		configs: { type: Mixed },
		credentials: { type: Mixed, default: {} },
		active: { type: Boolean, default: true },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		blockIds: [{ type: ObjectId, ref: 'Block' }],
		payoutCategoryIds: [{ type: ObjectId, ref: 'PayoutCategory' }],
		createdBy: { type: ObjectId, ref: 'User' },
		bankId: { type: ObjectId, ref: 'Bank' },
		contacts: [
			{
				name: String,
				value: String,
			},
		],
		subscribedNotification: { type: Boolean, default: false },
		userId: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

ModelSchema.pre('save', async function (next) {
	const isModifiedAccountNo = this.isModified('accountNos');

	if (isModifiedAccountNo) {
		this.accountNos = this.accountNos.map(no => _.trim(no));
	}

	if (this.accountName && (isModifiedAccountNo || !this.validated)) {
		this.accountName = removeAccents(_.trim(this.accountName), false);
	}

	if (this.sourceType === BANK_ACCOUNT_SOURCE_TYPE.BANKING && this.isModified('bankId')) {
		const bank = this.bankId && (await mongoose.model('Bank').findById(this.bankId));
		if (!bank) {
			throw new ThrowReturn('Ngân hàng không hợp lệ!');
		}

		this.bankCode = bank.bankCode;
		this.shortName = bank.shortName;
		this.validated = !!bank.ignoreValidation;
	}

	if (this.sourceType === BANK_ACCOUNT_SOURCE_TYPE.BANKING && (this.isNew || isModifiedAccountNo)) {
		const exists = await Model.findOne({
			active: true,
			accountNos: this.accountNos,
			groupIds: { $in: this.groupIds },
		}).select('_id');
		if (exists) {
			throw new ThrowReturn('Số tài khoản đã tồn tại!');
		}
	}

	if (this.isNew) {
		const last = await Model.findOne().sort({ no: -1 }).select('no');
		this.no = last && last.no ? `BA${Number(last.no.replace('BA', '')) + 1}` : 'BA100001';

		if (!this.validated) {
			await this.validateAccount();
		}
	}

	next();
});

ModelSchema.virtual('decryptedPassword').get(function () {
	if (!this.password) return undefined;

	try {
		const decryptedPassword = decryptData(this.password);
		return decryptedPassword;
	} catch (err) {
		return null;
	}
});

ModelSchema.methods = {
	async validateAccount(serviceAccount, forceSave) {
		if (this.sourceType === BANK_ACCOUNT_SOURCE_TYPE.BANKING && !global.isDev) {
			const bank = this.populated('bankId') ? this.bankId : await mongoose.model('Bank').findById(this.bankId);

			if (!serviceAccount) {
				serviceAccount = await await mongoose.model('BankServiceAccount').findOne({
					active: true,
					accountType: SYS_BANK_ACCOUNT_TYPE.OUTBOUND_PAY,
				});
				if (!serviceAccount) {
					this.validated = true;
					return this;
					// throw new ThrowReturn('Không tìm thấy tài khoản kết nối API!');
				}
			}

			const creditAccountInfo = await BankServices.MBBank.getAccountInfo({
				serviceAccount,
				accountNumber: this.accountNos[0],
				bin: bank.bin,
				bankCode: bank.bankCode,
			}).catch(e => {
				return Promise.reject(new ThrowReturn(e));
			});

			if (creditAccountInfo) {
				this.validated = !!creditAccountInfo.accountName;
				this.accountName = creditAccountInfo.accountName;
				if (forceSave) {
					await this.save();
				}
			}
		}

		return this;
	},
};

ModelSchema.statics = {
	async getTransactions(bankName, query) {
		const accounts = await this.find(
			_.pickBy({
				active: true,
				shortName: bankName,
				type: BANK_ACCOUNT.PRIVATE,
				$or: [
					{
						username: { $ne: null },
					},
					{
						serviceAccountId: { $ne: null },
					},
					{
						subscribedNotification: true,
					},
				],
			})
		);

		const serviceAccounts = await this.model('BankServiceAccount').find({
			bankCode: _.map(accounts, 'bankCode'),
			active: true,
			accountType: SYS_BANK_ACCOUNT_TYPE.OUTBOUND,
		});

		const BankTransaction = this.model('BankTransaction');

		const groups = _.groupBy(accounts, c => (c.shortName && c.username ? `${c.shortName}${c.username}` : c._id));

		await _.values(groups)
			.filter(gAccounts => _.has(BankServices[gAccounts[0].shortName], 'getTransactions'))
			.asyncMap(async gAccounts => {
				try {
					const service = BankServices[gAccounts[0].shortName];

					const serviceAccount = serviceAccounts.find(s => s.bankCode === gAccounts[0].bankCode);

					const transactions = await service.getTransactions(gAccounts, query, serviceAccount);
					const transactionDocs = [];

					await transactions.asyncForEach(async transaction => {
						const transactionDoc = await BankTransaction.create(
							service.getTransactionDoc ? service.getTransactionDoc(gAccounts, transaction) : transaction
						).catch(e => {
							if (e.code !== 11000) {
								logger.error('create transaction error', gAccounts, transaction, e);
							}
						});
						if (transactionDoc) {
							transactionDocs.push(transactionDoc);
						}
					});

					await this.updatePayouts(_.map(transactionDocs, '_id'));
				} catch (e) {
					logger.error('getTransactions', gAccounts, e);
				}
			});
	},

	async updatePayouts(transactionIds) {
		if (!transactionIds.length) return;

		const BankTransaction = this.model('BankTransaction');
		const Payout = this.model('Payout');

		const transHaveSms = await BankTransaction.find({ _id: transactionIds, smsId: { $ne: null } });
		if (!transHaveSms.length) return;

		const payouts = await Payout.find({
			smsId: _.compact(_.map(transHaveSms, 'smsId')),
			transactionFee: { $in: [null, 0] },
		});
		if (!payouts.length) return;

		await payouts.asyncMap(async payout => {
			await payout.updateTransactionFee();
			return payout.save();
		});
	},

	async createOrUpdate(data, user) {
		let account = await this.findOne({
			accountNos: data.accountNos,
			active: true,
			groupIds: { $in: user.groupIds },
		});

		if (!account) {
			account = new this({
				...data,
				createdBy: user._id,
				groupIds: user.groupIds,
				transType: [TransactionTypes.CREDIT],
				accountType: BANK_ACCOUNT_TYPE.CUSTOMER,
				type: [BANK_ACCOUNT.USER],
				validated: false,
			});
		} else {
			const updatedData = _.pick(data, [
				'name',
				'nationalId',
				'phoneNumber',
				'address',
				'accountType',
				'contacts',
				'bankId',
				'accountName',
				'accountNos',
				'blockIds',
				'payoutCategoryIds',
				'description',
			]);
			if (account.validated) {
				delete updatedData.accountName;
			}

			_.assign(account, updatedData);
		}

		await account.save();

		return account;
	},
};

const Model = mongoose.model('BankAccount', ModelSchema, 'bank_account');

module.exports = Model;

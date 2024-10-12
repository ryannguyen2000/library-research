const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');
const dot = require('dot-object');

const { logger } = require('@utils/logger');
const { eventEmitter, EVENTS } = require('@utils/events');
const {
	PayoutType,
	PayoutStates,
	PayoutSources,
	CurrencyConvert,
	UserRoles,
	Currency,
	PayoutCard,
	PayoutCardType,
	PayoutBuyType,
	HANDOVER_STATUS,
	CASHIER_TYPE,
	PayoutCollectStatus,
	PayoutReason,
	TransactionStatus,
	BANK_ACCOUNT_TYPE,
	TaskPriority,
	TaskStatus,
	BANK_ACCOUNT_SOURCE_TYPE,
	RolePermissons,
	PayoutDistributeType,
	GUARANTEE_REV_TYPE,
} = require('@utils/const');
const { removeSpecChars } = require('@utils/generate');
const ThrowReturn = require('@core/throwreturn');
const { LOG_FIELDS } = require('@controllers/finance/const');
const SMSmodel = require('./sms.model');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const PERIOD_FORMAT = 'YYYY-MM';

const PayoutSchema = new Schema(
	{
		payoutType: {
			type: String,
			default: PayoutType.RESERVATION,
			enum: Object.values(PayoutType),
		},
		distribute: { type: Boolean, default: false },
		distributeType: { type: Number, enum: Object.values(PayoutDistributeType) },
		distributeMonths: { type: Number, min: 1 },
		distributes: [
			{
				_id: false,
				period: String, // YYYY-MM
				amount: { type: Number },
			},
		],
		startPeriod: String, // YYYY-MM
		endPeriod: String, // YYYY-MM
		currencyAmount: {
			cashReceived: { type: Number },
			amount: { type: Number, default: 0, required: true },
			currency: { type: String, default: Currency.VND },
			exchange: { type: Number, default: 1 },
			feePercent: { type: Number, default: 0 },
			exchangedAmount: { type: Number, default: 0 },
			quantity: { type: Number, default: 1 },
			unitPrice: Number,
			vat: { type: Number, default: 0 },
		},
		createdBy: { type: ObjectId, ref: 'User' },
		collector: { type: ObjectId, ref: 'User' },
		collectStatus: { type: String, enum: [...Object.values(PayoutCollectStatus), null] },
		collectSAStatus: { type: String, enum: [...Object.values(PayoutCollectStatus), null] },
		voucher: { type: String }, // voucher code
		collectorCustomName: { type: String },
		source: {
			type: String,
			default: PayoutSources.CASH,
			enum: Object.values(PayoutSources),
		},
		cardName: {
			type: String,
			enum: Object.values(PayoutCard),
		},
		cardType: {
			type: String,
			enum: Object.values(PayoutCardType),
		},
		assetId: { type: ObjectId, ref: 'AssetActive' },
		statusReason: { type: String, enum: Object.values(PayoutReason) },
		statusReasonOther: { type: String },
		description: { type: String },
		categoryId: { type: ObjectId, ref: 'PayoutCategory' },
		images: [String],
		historyAttachments: [String],
		state: {
			type: String,
			default: PayoutStates.PROCESSING,
			enum: Object.values(PayoutStates),
		},
		payStatus: {
			type: String,
			enum: [...Object.values(TransactionStatus), null],
		},
		payConfirmedBy: { type: ObjectId, ref: 'User' },
		payConfirmedDate: { type: Date },
		deletedBy: { type: ObjectId, ref: 'User' },
		confirmedBy: { type: ObjectId, ref: 'User' },
		confirmedDate: { type: Date },
		blockIds: [{ type: ObjectId, ref: 'Block' }],
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		bookingId: { type: ObjectId, ref: 'Booking' },
		otaId: { type: String },
		otaName: { type: String },
		transactionFee: { type: Number, default: 0 },
		feePaidBy: { type: Number, enum: Object.values(GUARANTEE_REV_TYPE) },
		productId: { type: String },
		bookingBackupData: Mixed,
		smsId: { type: ObjectId, ref: () => SMSmodel.getModel() },
		isInternal: { type: Boolean },
		hasInvoice: { type: Boolean },
		ignoreReport: { type: Boolean },
		inReport: { type: Boolean, default: false },
		multipleReport: { type: Boolean },
		paidAt: { type: Date, default: () => new Date() },
		buyType: { type: String, enum: _.values(PayoutBuyType) },
		isOwnerCollect: { type: Boolean, default: false },
		isCalcDeposit: Boolean, // add deposit to revenue
		isAvoidTransactionFee: { type: Boolean, default: false },
		isFinalIncome: { type: Boolean, default: false },
		handoverId: { type: ObjectId, ref: 'Handover' },
		fromOTA: Boolean,
		payDebitAccountId: { type: ObjectId, ref: 'BankAccount', default: null },
		payAccountId: { type: ObjectId, ref: 'BankAccount', default: null },
		payDescription: { type: String },
		payRequestId: { type: ObjectId, ref: 'PayoutRequest' },
		priority: { type: Number, enum: _.values(TaskPriority), default: TaskPriority.Normal },
		autoId: { type: ObjectId, ref: 'PayoutAuto' },
		taskId: { type: ObjectId, ref: 'Task' },
		reportStreams: [
			{
				_id: false,
				streamCategoryId: { type: ObjectId, ref: 'ReportStreamCategory', required: true },
				streamProjectId: { type: ObjectId, ref: 'ReportStreamCategory' },
				ratio: { type: Number, min: 0, max: 100 },
			},
		],
		logs: [
			{
				createdAt: { type: Date, default: Date.now },
				by: { type: ObjectId, ref: 'User' },
				field: String,
				oldData: Mixed,
				newData: Mixed,
				parsedText: String,
			},
		],
	},
	{
		timestamps: true,
		toObject: {
			virtuals: true,
		},
		toJSON: {
			virtuals: true,
		},
		autoIndex: false,
	}
);

PayoutSchema.index({ bookingId: 1 });
PayoutSchema.index({ state: 1 });
PayoutSchema.index({ payoutType: 1 });
PayoutSchema.index({ createdAt: -1 });
PayoutSchema.index({ paidAt: -1 });

PayoutSchema.virtual('export', {
	ref: 'PayoutExport',
	localField: '_id',
	foreignField: 'payouts',
	justOne: true,
});

PayoutSchema.virtual('task', {
	ref: 'Task',
	localField: '_id',
	foreignField: 'payoutId',
	justOne: true,
});

PayoutSchema.pre('save', async function (next) {
	const isFee = this.isFee();

	if (isFee && this.currencyAmount.unitPrice) {
		const { quantity = 1, unitPrice = 1, vat = 0 } = this.currencyAmount;
		this.currencyAmount.amount = _.round(quantity * unitPrice + vat);
	}
	if (!this.currencyAmount.currency) {
		this.currencyAmount.currency = Currency.VND;
	}
	if (!this.currencyAmount.exchange) {
		this.currencyAmount.exchange = CurrencyConvert[this.currencyAmount.currency] || 1;
	}

	this.currencyAmount.exchangedAmount = _.round(this.currencyAmount.exchange * this.currencyAmount.amount);
	this.$locals.isModifiedAmount = this.isModified('currencyAmount.exchangedAmount');

	if (this.isDeleted()) {
		this.inReport = false;
	}
	if (this.$locals.isModifiedAmount) {
		this.transactionFee = await this.getTransactionFee();
	}

	if (
		this.payoutType !== PayoutType.PAY &&
		this.payoutType !== PayoutType.PREPAID &&
		this.payoutType !== PayoutType.REFUND &&
		this.createdBy &&
		this.collector &&
		this.source === PayoutSources.CASH
	) {
		if (!this.collectStatus) {
			this.collectStatus = this.createdBy.equals(this.collector)
				? PayoutCollectStatus.Confirmed
				: PayoutCollectStatus.Pending;
		}
	} else if (this.collectStatus) {
		this.collectStatus = null;
	}

	if (isFee) {
		if (this.currencyAmount.amount < 0) {
			throw new ThrowReturn('Số tiền không được nhỏ hơn 0');
		}

		this.currencyAmount.unitPrice = this.currencyAmount.unitPrice || this.currencyAmount.amount;

		if (!this.categoryId) {
			const ctg = await mongoose.model('PayoutCategory').findOne({ payoutType: this.payoutType });
			if (ctg) {
				this.categoryId = ctg._id;
				this.$locals.category = ctg;
			}
		}

		if (!this.startPeriod || !moment(this.startPeriod).isValid()) {
			const block = await mongoose.model('Block').findOne({ _id: this.blockIds });
			this.startPeriod = block.findPeriodByDate(this.paidAt);
		} else {
			this.startPeriod = moment(this.startPeriod).format(PERIOD_FORMAT);
		}

		if (this.distribute) {
			this.validateDistributes();
		} else {
			this.endPeriod = this.startPeriod;
		}

		await this.validateReportStreams();
	}

	if (this.isCalcDeposit && this.payoutType !== PayoutType.DEPOSIT) {
		this.isCalcDeposit = false;
	}

	if (this.payStatus === TransactionStatus.SUCCESS && !this.payConfirmedDate) {
		this.payConfirmedDate = new Date();
	}
	if (this.isModified('payDescription')) {
		this.payDescription = this.payDescription ? removeSpecChars(this.payDescription) : undefined;
	}
	if (this.payDebitAccountId && this.isModified('payDebitAccountId')) {
		const account = await mongoose.model('BankAccount').findById(this.payDebitAccountId);
		if (account) {
			this.source = Model.getSourceByBankAccount(account);
		}
	} else if (this.payAccountId && this.isModified('payAccountId')) {
		const account = await mongoose.model('BankAccount').findById(this.payAccountId);
		if (account) {
			this.source = Model.getSourceByBankAccount(account);
		}
	}

	this.$locals.isModifiedTransactionFee = this.isModified('transactionFee');
	this.$locals.isModifiedPayStatus = this.isModified('payStatus');
	this.$locals.isModifiedCategoryId = this.isModified('categoryId');
	this.$locals.isNew = this.isNew;

	if (!this.isNew) {
		this.addLogs();
	}

	next();
});

PayoutSchema.post('save', function (doc) {
	eventEmitter.emit(doc.$locals.isNew ? EVENTS.CREATE_PAYOUT : EVENTS.UPDATE_PAYOUT, doc);

	if (doc.isDeleted()) {
		// sync payout export amount that has this payout
		mongoose
			.model('PayoutExport')
			.updateOne(
				{ payouts: doc._id },
				{
					$pull: { payouts: doc._id },
					$inc: {
						'currencyAmount.VND': -doc.currencyAmount.exchangedAmount,
						transactionFee: -doc.transactionFee,
					},
				}
			)
			.catch(e => {
				logger.error('PayoutExport sync report deleted payout', doc._id, e);
			});
	} else {
		if (doc.$locals.isModifiedAmount || doc.$locals.isModifiedTransactionFee) {
			// sync payout export amount that has this payout
			mongoose
				.model('PayoutExport')
				.syncAmountByPayout(doc._id)
				.catch(e => {
					logger.error('PayoutExport.syncAmountByPayout', doc._id, e);
				});
		}

		if (
			doc.payRequestId &&
			(doc.$locals.isModifiedCategoryId || doc.$locals.isModifiedPayStatus || doc.$locals.isModifiedAmount)
		) {
			// update payout request status
			mongoose
				.model('PayoutRequest')
				.syncPayout(doc.payRequestId, doc._id)
				.catch(e => {
					logger.error('PayoutRequest.syncPayout', doc, e);
				});
		}

		if (doc.taskId && doc.$locals.isModifiedPayStatus && doc.payStatus === TransactionStatus.SUCCESS) {
			// update task status
			mongoose
				.model('Task')
				.findById(doc.taskId)
				.then(task => task.changeStatus({ status: TaskStatus.Done }))
				.catch(e => {
					logger.error('payout taskId changeStatus', doc, e);
				});
		}
	}
});

PayoutSchema.methods = {
	async validateReportStreams() {
		if (!this.reportStreams || !this.reportStreams.length) {
			const ctg = this.$locals.category || (await mongoose.model('PayoutCategory').findById(this.categoryId));
			if (!ctg) {
				throw new ThrowReturn('Loại chi phí không tồn tại!');
			}

			if (ctg && ctg.defaultReportStreams.length) {
				const reportStream =
					ctg.defaultReportStreams.find(r => r.blockId && r.blockId.equals(this.blockIds[0])) ||
					ctg.defaultReportStreams[0];

				if (reportStream) {
					this.reportStreams = reportStream.reportStreams;
				}
			}
		}

		if (this.reportStreams.length && _.sumBy(this.reportStreams, 'ratio') > 100) {
			throw new ThrowReturn('Tỷ lệ chi phí cost stream không hợp lệ!');
		}
	},

	validateDistributes() {
		if (this.distributeType === PayoutDistributeType.Value) {
			this.distributes = _.uniqBy(this.distributes, 'period');

			if (_.sumBy(this.distributes, 'amount') !== this.currencyAmount.exchangedAmount) {
				throw new ThrowReturn('Tổng số tiền phân bổ phải bằng tổng chi phí!');
			}
			if (this.distributes.some(d => !moment(d.period, PERIOD_FORMAT, true).isValid())) {
				throw new ThrowReturn('Đinh dạng kỳ chi không hợp lệ!');
			}

			this.distributes = _.sortBy(this.distributes, 'period');
			this.distributeMonths = this.distributes.length;
		} else {
			this.distributeMonths = this.distributeMonths || 1;
			const distributedAmount = _.round(this.currencyAmount.exchangedAmount / this.distributeMonths);
			let total = 0;

			this.distributes = _.range(this.distributeMonths).map((i, ii, arr) => {
				const amount = arr.length - 1 === i ? this.currencyAmount.exchangedAmount - total : distributedAmount;

				total += amount;

				return {
					period: moment(this.startPeriod, PERIOD_FORMAT).add(i, 'month').format(PERIOD_FORMAT),
					amount,
				};
			});
		}

		if (this.distributes && this.distributes.length) {
			this.startPeriod = _.head(this.distributes).period;
			this.endPeriod = _.last(this.distributes).period;
		}
	},

	async getTransactionFee() {
		const amount = this.currencyAmount.exchangedAmount;
		if (!amount) return 0;

		if (this.source !== PayoutSources.ONLINE_WALLET && this.source !== PayoutSources.THIRD_PARTY) {
			return this.transactionFee;
		}

		const collector = await mongoose
			.model('PaymentCollector')
			.findOne({ tag: _.toLower(this.collectorCustomName) });
		if (!collector) return 0;

		const PaymentRef = mongoose.model('PaymentRef');

		const transaction = await PaymentRef.findOne({ ref: this.otaId });
		if (!transaction) return 0;

		let bankCode = _.toUpper(transaction.bankCode);
		let transDate = new Date(transaction.createdAt).toDateMysqlFormat();
		let checkTransaction = transaction;
		let refTransaction = null;

		if (transaction.refOrderId) {
			refTransaction = await PaymentRef.findOne({ ref: transaction.refOrderId });

			bankCode = _.toUpper(refTransaction.bankCode);
			checkTransaction = refTransaction;
		}

		const cond = collector.conds.find(
			c =>
				(c.fromDate ? c.fromDate <= transDate : true) &&
				(c.toDate ? c.toDate >= transDate : true) &&
				(c.key === 'bankCode' ? _.includes(c.value, bankCode) : true) &&
				(c.additionals && c.additionals.length
					? c.additionals.every(add => _.get(checkTransaction, add.key) === add.value)
					: true)
		);
		if (!cond) return 0;

		let fixedFee = cond.fixedFee || 0;

		// is refund transaction
		if (fixedFee && refTransaction && refTransaction.amount > Math.abs(transaction.amount)) {
			fixedFee = 0;
		}

		const rRate = cond.fee || 0;
		const fee = _.round(fixedFee + rRate * Math.abs(amount));
		const finalFee = cond.minFee ? _.max([cond.minFee, fee]) : fee;

		return amount < 0 ? -finalFee : finalFee;
	},

	isApproved() {
		return !!this.confirmedDate;
	},

	isDeleted() {
		return this.state === PayoutStates.DELETED;
	},

	isModifiedReport() {
		const keys = ['currencyAmount.amount', 'currencyAmount.exchangedAmount', 'payAccountId', 'payDebitAccountId'];
		return keys.some(k => this.isModified(k));
	},

	isFee() {
		return isFeeType(this.payoutType);
	},

	async validateUpdatePayout(user, isDeleted) {
		const isModifiedReport = this.isModifiedReport();

		if (
			(isModifiedReport || isDeleted) &&
			[TransactionStatus.WAIT_FOR_APPROVE, TransactionStatus.PROCESSING, TransactionStatus.SUCCESS].includes(
				this.payStatus
			)
		) {
			throw new ThrowReturn('Lệnh chi đang xử lí không thể cập nhật!');
		}
		if (this.taskId && this.payoutType === PayoutType.REFUND && isModifiedReport) {
			throw new ThrowReturn('Chi phí được liên kết với nhiệm vụ không thể cập nhật!');
		}
		if (this.isDeleted()) {
			throw new ThrowReturn().status(404);
		}
		if (!user || user.role === UserRoles.ADMIN) {
			return;
		}
		if (
			await user.hasPermission(
				this.isFee() ? RolePermissons.FINANCE_APPROVE_PAYOUT : RolePermissons.FINANCE_APPROVE_REPORT
			)
		) {
			return;
		}
		if (this.confirmedBy && (isModifiedReport || isDeleted)) {
			throw new ThrowReturn('Thanh toán đã được duyệt!');
		}
		if (this.otaId || !this.createdBy) {
			throw new ThrowReturn().status(403);
		}
		if (this.handoverId && (isModifiedReport || isDeleted)) {
			const handover = await mongoose.model('Handover').findById(this.handoverId);
			if (handover && handover.status !== HANDOVER_STATUS.PROCESSING) {
				throw new ThrowReturn('Ca đã bàn giao không thể sửa!');
			}
		}
		if (this.createdBy.equals(user._id)) {
			return;
		}
		if (
			isModifiedReport &&
			!isDeleted &&
			this.collectStatus === PayoutCollectStatus.Confirmed &&
			!this.handoverId
		) {
			throw new ThrowReturn('Thanh toán đã được người thu xác nhận!');
		}
		if (await user.isHigherRole(this.createdBy, true)) {
			return;
		}

		throw new ThrowReturn().status(403);
	},

	async updateTransactionFee() {
		if (!this.smsId) {
			this.transactionFee = 0;
			return;
		}

		const BankTransaction = mongoose.model('BankTransaction');
		const transaction = await BankTransaction.findOne({ smsId: this.smsId })
			.select('docNo accountId meta')
			.populate({
				path: 'accountId',
				select: 'accountType groupIds',
				populate: {
					path: 'groupIds',
				},
			});

		if (transaction) {
			const { docNo, accountId, meta } = transaction;

			const transactionDocFee = docNo && (await BankTransaction.findOne({ docNo, isFee: true }));
			const totalTransactionFee = Math.abs(_.get(transactionDocFee, 'meta.amount') || 0);

			this.transactionFee = _.round(
				totalTransactionFee * Math.max(this.currencyAmount.exchangedAmount / meta.amount, 1)
			);

			if (accountId) {
				this.isOwnerCollect = !_.get(accountId.groupIds, [0, 'primary']);
				this.source = Model.getSourceByBankAccount(accountId);
			}
		}
	},

	addLogs() {
		if (!this.$locals.oldData) return;

		const by = this.$locals.updatedBy;
		this.logs = this.logs || [];

		LOG_FIELDS.forEach(field => {
			if (this.isModified(field)) {
				const newData = _.get(this, field);
				if (newData === undefined) return;

				const oldData = _.get(this.$locals, `oldData.${field}`);
				this.logs.push({
					by,
					field,
					oldData,
					newData,
				});
			}
		});
	},

	getPeriods() {
		const periods = [];

		if (!this.startPeriod || !this.startPeriod) return periods;

		const startPeriod = moment(this.startPeriod, 'Y-MM');
		const endPeriod = moment(this.endPeriod, 'Y-MM');

		while (startPeriod.isSameOrBefore(endPeriod, 'month')) {
			periods.push(startPeriod.format('Y-MM'));
			startPeriod.add(1, 'month');
		}

		return periods;
	},
};

PayoutSchema.statics = {
	getSourceByBankAccount(account) {
		if (account.sourceType === BANK_ACCOUNT_SOURCE_TYPE.CASH) {
			return PayoutSources.CASH;
		}

		return account.accountType === BANK_ACCOUNT_TYPE.COMPANY
			? PayoutSources.BANKING
			: PayoutSources.PERSONAL_BANKING;
	},

	async findFullDataById(id) {
		let data = await this.findById(id)
			.populate('blockIds', 'info.name')
			.populate('createdBy collector confirmedBy', 'username name')
			.populate('categoryId')
			.populate({
				path: 'bookingId',
				select: 'from to price otaName otaBookingId currency guestId blockId fee otaFee',
				populate: [
					{
						path: 'guestId',
						select: 'avatar displayName name fullName',
					},
					{
						path: 'blockId',
						select: 'info.name',
					},
				],
			});

		return data;
	},

	async createPayout(data) {
		if (data.state === PayoutStates.CONFIRMED) {
			data.state = PayoutStates.PROCESSING;
		}
		delete data.confirmedBy;
		const payout = new this(data);

		if (payout.smsId) {
			const sms = await SMSmodel.getModel().findById(payout.smsId);
			if (!sms) throw new ThrowReturn('Không tìm thấy SMS!');
			// if (sms.payoutId) throw new ThrowReturn('SMS này đã được tạo thanh toán trước đó!');
			await payout.updateTransactionFee();
		}
		await payout.save();

		if (payout.smsId) {
			await SMSmodel.getModel().updateOne(
				{ _id: payout.smsId },
				{ $set: { read: true, hasPayout: true }, $addToSet: { payoutId: payout._id } }
			);
		}
		if (payout.voucher) {
			await this.model('Voucher').updateOne(
				{ code: payout.voucher },
				{ $set: { otaBookingId: data.otaBookingId } }
			);
		}

		return this.findFullDataById(payout._id, payout.createdBy);
	},

	async findHandover(collector, payoutData, isUpdate) {
		if (isUpdate && !payoutData.isModified('currencyAmount.exchangedAmount') && !payoutData.isModified('source')) {
			return payoutData.handoverId;
		}
		if (
			payoutData.source === PayoutSources.CASH &&
			payoutData.payoutType !== PayoutType.PAY &&
			payoutData.payoutType !== PayoutType.PREPAID
		) {
			const cashier = await this.model('Cashier').findOne({
				blockId: _.get(payoutData, 'blockIds[0]') || this.blockIds[0],
				type: CASHIER_TYPE.CASH,
				active: true,
			});
			if (cashier) {
				const user = await this.model('User').findById(collector);

				const handover = await this.model('Handover').findOne({
					cashierId: cashier._id,
					status: HANDOVER_STATUS.PROCESSING,
					startTime: { $lt: payoutData.createdAt || new Date() },
					blockId: payoutData.blockIds[0],
					userId: user._id,
				});
				if (!handover && !(await user.hasPermission(RolePermissons.FINANCE_APPROVE_PAYOUT))) {
					throw new ThrowReturn('Hãy nhận ca trước khi bắt đầu thao tác này!');
				}

				return handover && handover._id;
			}
		}
	},

	async createBookingPayout(user, data) {
		if (data.voucher) {
			const { discount, currency } = await this.model('Voucher').getDiscount(
				user,
				data.voucher,
				data.otaBookingId
			);
			data.currencyAmount.amount = discount;
			data.currencyAmount.currency = currency;
			data.collectorCustomName = `tb's Voucher`;
			data.source = PayoutSources.VOUCHER;
			delete data.collector;
		}

		data.payoutType = data.payoutType || PayoutType.RESERVATION;
		data.state = PayoutStates.TRANSFERRED;

		if (user) {
			data.createdBy = user._id;

			const handoverId = await this.findHandover(data.collector, data);

			if (handoverId) {
				data.handoverId = handoverId;
			}

			if (data.isOwnerCollect === undefined) {
				const group = await this.model('UserGroup').findOne({ _id: user.groupIds });
				if (!group.primary && _.get(group.configs, 'defaultIsOwnerCollect') !== false) {
					data.isOwnerCollect = true;
				}
			}
		}

		const payout = await this.createPayout(data);

		if (payout.handoverId) {
			await this.model('Handover').updateOne(
				{ _id: payout.handoverId },
				{
					$addToSet: {
						payouts: payout._id,
					},
				}
			);
		}

		return payout;
	},

	async createOTAPayout(data, isUniqOtaId = false) {
		const { otaName, otaId, bookingId, bookingBackupData, productId } = data;
		const query = {
			otaName,
			otaId,
		};
		if (bookingId) {
			if (!isUniqOtaId) {
				query.bookingId = bookingId;
			}
		} else if (bookingBackupData) {
			query['bookingBackupData.otaBookingId'] = bookingBackupData.otaBookingId;
		}
		if (productId) {
			query.productId = productId;
		}

		let payout = await this.findOne(query);
		if (payout) {
			Object.assign(payout, {
				...data,
				state: data.currencyAmount.amount === 0 ? PayoutStates.DELETED : payout.state,
			});
			if (data.currencyAmount.amount !== 0 && payout.state === PayoutStates.DELETED) {
				payout.state = PayoutStates.PROCESSING;
			}
			await payout.save();
			return payout;
		}

		if (data.currencyAmount.amount === 0) return;

		data.state = PayoutStates.PROCESSING;
		data.payoutType = PayoutType.RESERVATION;
		data.source = data.source || PayoutSources.BANKING;

		if (data.fromOTA && !_.isBoolean(data.isOwnerCollect)) {
			const properyConfig = await this.model('Block').getPropertyConfig({
				blockId: data.blockIds,
				otaName: data.otaName,
			});
			if (properyConfig && _.isBoolean(properyConfig.isOwnerCollect)) {
				data.isOwnerCollect = properyConfig.isOwnerCollect;
			}
			if (properyConfig && properyConfig.payoutSource) {
				data.source = properyConfig.payoutSource;
			}
		}

		payout = await this.create(data);
		return payout;
	},

	async updatePayout(payout, data, user, validate = true) {
		data = _.omit(data, ['createdBy', 'confirmedBy', 'confirmedDate', 'inReport', 'state', 'handoverId', 'logs']);

		if (data.voucher) {
			_.unset(data, 'currencyAmount');
		}

		if (data.smsId) {
			_.unset(data, 'source');
		}

		if (
			_.isBoolean(data.isOwnerCollect) &&
			user &&
			!(await user.hasPermission(RolePermissons.FINANCE_APPROVE_PAYOUT))
		) {
			_.unset(data, 'isOwnerCollect');
		}

		const prevSmsId = payout.smsId;
		const dotData = { ...data, ...dot.dot(_.pickBy(data, o => !mongoose.Types.ObjectId.isValid(o))) };

		if (user) {
			payout.$locals.updatedBy = user._id;
		}

		_.keys(dotData).forEach(k => {
			_.set(payout.$locals, `oldData.${k}`, _.clone(_.get(payout, k)));
		});

		payout.set(dotData);

		if (validate && user) {
			await payout.validateUpdatePayout(user);
		}

		if (_.toString(prevSmsId) !== _.toString(payout.smsId)) {
			if (payout.smsId) {
				const sms = await SMSmodel.getModel().findById(payout.smsId);
				if (!sms) throw new ThrowReturn('Không tìm thấy SMS!');
			}
			await payout.updateTransactionFee();
		}

		const oldHandoverId = payout.handoverId;

		if (payout.collector && (!oldHandoverId || payout.isModified('source'))) {
			payout.handoverId = await this.findHandover(payout.collector, payout, true);
			// payout.handoverId = handover ? handover._id : null;
		}

		await payout.save();

		const isUpdateHO = _.toString(oldHandoverId) !== _.toString(payout.handoverId);

		if (oldHandoverId && isUpdateHO) {
			await this.model('Handover').updateOne(
				{ _id: oldHandoverId },
				{
					$pull: {
						payouts: payout._id,
					},
				}
			);
		}
		if (payout.handoverId && isUpdateHO) {
			await this.model('Handover').updateOne(
				{ _id: payout.handoverId },
				{
					$addToSet: {
						payouts: payout._id,
					},
				}
			);
		}

		if (_.toString(prevSmsId) !== _.toString(payout.smsId)) {
			if (prevSmsId) {
				await SMSmodel.getModel().updateOne(
					{ _id: prevSmsId },
					{ $pull: { payoutId: payout._id }, $set: { read: false } }
				);
			}
			if (payout.smsId) {
				await SMSmodel.getModel().updateOne(
					{ _id: payout.smsId },
					{
						$addToSet: { payoutId: payout._id },
						$set: { read: true, hasPayout: true },
					}
				);
			}
		}

		return payout;
	},

	async deletePayout(payout, user, validate = true) {
		if (validate && user) {
			await payout.validateUpdatePayout(user, true);
		}

		payout.state = PayoutStates.DELETED;
		if (user) payout.deletedBy = user._id;

		await payout.save();

		if (payout.voucher) {
			await this.model('Voucher').updateOne({ code: payout.voucher }, { $unset: { otaBookingId: 1 } });
		}
		if (payout.smsId) {
			await SMSmodel.getModel().updateOne({ _id: payout.smsId }, { $pull: { payoutId: payout._id } });
		}
		if (validate) {
			await this.model('Task').updateOne({ payoutId: payout._id }, { $unset: { payoutId: 1 } });
		}
		if (payout.handoverId) {
			await this.model('Handover').updateOne(
				{ _id: payout.handoverId },
				{
					$pull: {
						payouts: payout._id,
					},
				}
			);
		}

		return payout;
	},

	async confirmPayout(userId, ids, state = PayoutStates.CONFIRMED) {
		const isConfirmed = state === PayoutStates.CONFIRMED;

		await this.updateMany(
			{ _id: ids, state: { $ne: PayoutStates.DELETED } },
			isConfirmed
				? {
					$set: {
						confirmedBy: userId,
						confirmedDate: new Date(),
						state,
					},
					$push: {
						logs: {
							by: userId,
							field: 'confirmedBy',
							createdAt: new Date(),
							newData: _.toString(userId),
						},
					},
				}
				: {
					$set: {
						state,
					},
					$unset: {
						confirmedBy: 1,
						confirmedDate: 1,
					},
				}
		);

		ids.forEach(id => {
			eventEmitter.emit(EVENTS.UPDATE_CASH_FLOW, { payoutId: id });
		});
	},

	async getBookingPayouts(bookingId, populate = true, ignoreDeleted = false, minimize) {
		const filter = {};

		if (_.isArray(bookingId)) {
			filter.bookingId = { $in: bookingId.map(mongoose.Types.ObjectId) };
		} else {
			filter.bookingId = { $eq: mongoose.Types.ObjectId(bookingId) };
		}
		if (ignoreDeleted) {
			filter.state = { $ne: PayoutStates.DELETED };
		}

		const pineline = this.find(filter);

		if (minimize) {
			pineline.select({
				bookingId: 1,
				currencyAmount: 1,
				source: 1,
				payoutType: 1,
				state: 1,
				createdBy: 1,
				transactionFee: 1,
				otaId: 1,
				collectorCustomName: 1,
				otaName: 1,
				isOwnerCollect: 1,
				isAvoidTransactionFee: 1,
			});
		}

		if (populate) {
			pineline.populate({
				path: 'createdBy collector confirmedBy',
				select: 'username name',
				options: {
					lean: true,
				},
			});
		}

		const payouts = await pineline.lean();
		payouts.forEach(payout => {
			if (payout.isAvoidTransactionFee) {
				payout.transactionFee = 0;
			}
		});

		return payouts;
	},

	async paymentsToReport(pays) {
		const categories = await this.model('PayoutCategory').find().sort({ group: 1, order: 1 });
		const categoryGroups = _.groupBy(categories, 'group');

		// flatmap
		return _.flatMap(pays, p => p.blockIds.map(b => ({ ...p, blockId: b.toString() }))).reduce((pre, cur) => {
			if (!pre[cur.blockId]) {
				pre[cur.blockId] = { paid: 0, categories: {} };
			}
			if (!pre[cur.blockId].categories[cur.categoryId.group]) {
				pre[cur.blockId].categories[cur.categoryId.group] = _.reduce(
					categoryGroups[cur.categoryId.group],
					(data, c) => {
						data[c.name] = 0;
						return data;
					},
					{}
				);
			}
			pre[cur.blockId].categories[cur.categoryId.group][cur.categoryId.name] +=
				cur.currencyAmount.exchangedAmount || cur.currencyAmount.amount;
			pre[cur.blockId].paid += cur.currencyAmount.exchangedAmount || cur.currencyAmount.amount;
			return pre;
		}, {});
	},

	async report(payoutType, distribute, from, to, states = [PayoutStates.CONFIRMED]) {
		const query = { payoutType, distribute };

		const period = moment(from).format('YYYY-MM');

		if (payoutType !== PayoutType.PREPAID) {
			const categories = await this.model('PayoutCategory').nonDitrbute();
			query.categoryId = { $in: categories.map(cate => cate._id) };
		}
		if (distribute) {
			query.distribute = true;
			query.startPeriod = { $gte: period };
			query.endPeriod = { $lte: period };
		} else {
			query.paidAt = { $gte: from, $lte: to };
		}

		let pays = await this.aggregate([
			{ $match: query },
			{
				$lookup: {
					from: 'payout_export',
					let: { payoutId: '$_id' },
					pipeline: [
						{
							$match: {
								$expr: { $in: ['$$payoutId', '$payouts'] },
								state: { $in: states },
							},
						},
						{ $project: { state: 1 } },
					],
					as: 'state',
				},
			},
			{ $unwind: '$state' },
			{
				$lookup: {
					from: this.model('PayoutCategory').collection.name,
					let: { id: '$categoryId' },
					pipeline: [
						{ $match: { $expr: { $eq: ['$_id', '$$id'] } } }, //
						{ $project: { name: 1, group: 1 } },
					],
					as: 'categoryId',
				},
			},
			{
				$unwind: {
					path: '$categoryId',
					preserveNullAndEmptyArrays: true,
				},
			},
		]);

		this.calcDistributes(pays, period);

		return this.paymentsToReport(pays);
	},

	getDistributedAmount(payment, period, includeVAT = true) {
		const vat = payment.currencyAmount.vat || 0;
		const totalAmount = payment.currencyAmount.exchangedAmount;
		const amount = includeVAT ? totalAmount : totalAmount - vat;

		if (!payment.distribute) return amount;

		if (
			payment.distributeType === PayoutDistributeType.Value &&
			payment.distributes &&
			payment.distributes.length
		) {
			const currentDistribute = _.find(payment.distributes, d => d.period === period);
			if (!currentDistribute) return;

			return includeVAT
				? currentDistribute.amount
				: _.round(currentDistribute.amount - vat * (currentDistribute.amount / totalAmount));
		}

		const totalMonths = payment.distributeMonths;
		const dtAmount = _.round(amount / totalMonths);

		if (payment.endPeriod === period) {
			return amount - dtAmount * (Math.ceil(totalMonths) - 1);
		}

		return dtAmount;
	},

	calcDistributes(payments, period) {
		payments.forEach(payment => {
			const amount = this.getDistributedAmount(payment, period);

			if (amount) {
				payment.currencyAmount.amount = amount;
				payment.currencyAmount.exchangedAmount = amount;
			}
		});

		return payments;
	},

	async repaidReport(from, to, states = [PayoutStates.CONFIRMED, PayoutStates.CONFIRMED_2]) {
		let pays = await this.aggregate([
			{
				$match: {
					payoutType: PayoutType.PREPAID,
					paidAt: { $gte: from, $lte: to },
				},
			},
			{
				$lookup: {
					from: 'payout_export',
					let: { payoutId: '$_id' },
					pipeline: [
						{
							$match: {
								$expr: { $in: ['$$payoutId', '$payouts'] },
								state: { $in: states },
							},
						},
						{ $project: { state: 1 } },
					],
					as: 'state',
				},
			},
			{ $unwind: '$state' },
			{
				$project: {
					blockIds: 1,
					categoryId: 1,
					currencyAmount: 1,
				},
			},
		]);

		pays = pays.filter(p => p.categoryId && p.blockIds && p.blockIds.length > 0);
		pays = await this.model('PayoutCategory').populate(pays, { path: 'categoryId', select: 'name group' });

		return this.paymentsToReport(pays);
	},

	sumCollectedPayments(payouts, key = 'currencyAmount.exchangedAmount') {
		return _.sumBy(payouts, p => (isFeeType(p.payoutType) ? -Math.abs(_.get(p, key)) : _.get(p, key))) || 0;
	},
};

function isFeeType(payoutType) {
	return payoutType === PayoutType.PAY || payoutType === PayoutType.REFUND;
}

const Model = mongoose.model('Payout', PayoutSchema, 'payout');

module.exports = Model;

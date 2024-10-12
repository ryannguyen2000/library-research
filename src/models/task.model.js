const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const dot = require('dot-object');

const ThrowReturn = require('@core/throwreturn');
const {
	TaskStatus,
	TaskChecking,
	TaskWorkingType,
	InboxType,
	RolePermissons,
	BookingStatus,
	Currency,
	TaskReason,
	TaskSource,
	TaskPriority,
	TaskNotificationType,
	TaskTags,
	PayoutBuyType,
	PayoutType,
	PayoutSources,
	CHECK_ITEM_STATUS,
	BOOKING_PRICE_VAT_TYPES,
	OTAs,
} = require('@utils/const');
const { eventEmitter, EVENTS } = require('@utils/events');
const notification = require('@services/notification');
const { LOG_FIELDS } = require('@controllers/task/const/task.const');

const { ObjectId, Mixed } = mongoose.Schema.Types;

const TaskSchema = new mongoose.Schema(
	{
		no: { type: Number },
		category: { type: ObjectId, required: true, ref: 'TaskCategory' },
		subCategory: { type: ObjectId, ref: 'TaskCategory' },
		createdBy: { type: ObjectId, ref: 'User' },
		assigned: [{ type: ObjectId, ref: 'User' }],
		blockId: { type: ObjectId, ref: 'Block', required: true },
		bookingId: [{ type: ObjectId, ref: 'Booking' }],
		roomIds: [{ type: ObjectId, ref: 'Room' }],
		assetActionId: { type: ObjectId, ref: 'AssetAction' },
		payoutId: { type: ObjectId, ref: 'Payout' },
		payoutIds: [{ type: ObjectId, ref: 'Payout' }],
		formId: { type: ObjectId, ref: 'FormInvoice' },
		expired: Date,
		linked: {
			taskId: { type: ObjectId, ref: 'Task' },
			checkItemId: { type: ObjectId, ref: 'CheckItem' },
		},
		formRefundId: { type: ObjectId, ref: 'FormRefund' },
		reasonId: { type: ObjectId, ref: 'ReasonUpdating' },
		reasonTxt: { type: String },
		fee: {
			amount: { type: Number },
			currency: { type: String, default: Currency.VND },
			quantity: { type: Number, default: 1, min: 0 },
			unitPrice: { type: Number },
			createdBy: { type: ObjectId, ref: 'User' },
		},
		description: { type: String },
		note: { type: String },
		time: {
			type: Date,
			default: () => new Date(`${moment().format('Y-MM-DD')}T${moment().format('HH:MM:ss')}.000Z`),
		},
		startedAt: { type: Date },
		doneAt: { type: Date },
		doneBy: { type: ObjectId, ref: 'User' },
		other: {
			company: String,
			address: String,
			email: String,
			taxNumber: String,
			price: Number,
			bookPrice: Number,
			bankId: { type: ObjectId, ref: 'Bank' },
			bankAccountNo: { type: String, trim: true },
			bankAccountName: { type: String, trim: true, uppercase: true },
			phone: { type: String },
		},
		status: {
			type: String,
			default: TaskStatus.Waiting,
			enum: _.values(TaskStatus),
		},
		checking: { type: String, enum: _.values(TaskChecking) },
		workingType: {
			type: Number,
			enum: _.values(TaskWorkingType),
			default: TaskWorkingType.Normal,
		},
		workingPoint: {
			type: Number,
		},
		isAuto: {
			type: Boolean,
			default: false,
		},
		paymentSource: {
			type: String,
			enum: [PayoutSources.BANKING, PayoutSources.CASH, PayoutSources.THIRD_PARTY],
		},
		isFollow: { type: Boolean },
		notes: [
			{
				note: String,
				description: String,
				createdBy: { type: ObjectId, ref: 'User' },
				createdAt: { type: Date, default: () => new Date() },
				images: [String],
				autoGen: Boolean,
				time: { type: Date },
				source: { type: String, enum: _.values(TaskSource) },
				status: String,
				oldData: Mixed,
				newData: Mixed,
				field: String,
			},
		],
		attachments: [String],
		checkList: [{ type: ObjectId, ref: 'CheckItem' }],
		reason: { type: String, enum: _.values(TaskReason) },
		source: { type: String, enum: _.values(TaskSource), default: TaskSource.Auto },
		priority: { type: Number, enum: _.values(TaskPriority), default: TaskPriority.Normal },
		notificationType: {
			type: String,
			enum: [..._.values(TaskNotificationType), null],
		},
		reminder: { type: Boolean },
		reminderNotificationType: {
			type: String,
			enum: [..._.values(TaskNotificationType), null],
		},
		notifyOnCreate: { type: Boolean },
		deadline: { type: Date },
		departmentId: { type: ObjectId, ref: 'Department' },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		messageId: { type: ObjectId, ref: 'Messages' },
		buyType: { type: String, enum: _.values(PayoutBuyType) },
	},
	{ timestamps: true, versionKey: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

TaskSchema.virtual('isExpired').get(function () {
	if (!this.expired) return false;
	return this.expired.toISOString() <= new Date().toISOString();
});

TaskSchema.virtual('invoice', {
	ref: 'Invoice',
	localField: '_id',
	foreignField: 'taskId',
	justOne: true,
});

TaskSchema.pre('save', async function (next) {
	const isUpdateProperty = ['blockId', 'roomIds', 'assetActionId'].some(key => this.isModified(key));
	if (isUpdateProperty) {
		const assetIssueTask = await this.model('AssetIssueTask')
			.findOne({ taskId: this._id, deleted: false })
			.select('_id')
			.lean();
		const isContainAssetIssue = !!assetIssueTask;
		if (isContainAssetIssue) throw new ThrowReturn('Task contain asset issue, can not update property');
	}

	if ((this.notificationType || this.notificationType === undefined) && this.reminder === undefined) {
		const ctg = await this.model('TaskCategory').findById(this.category);

		this.reminder = ctg.reminder;

		if (this.notificationType === undefined) {
			this.notificationType = ctg.notificationType;
		}
		if (this.notifyOnCreate === undefined) {
			this.notifyOnCreate = true;
		}
		if (this.reminderNotificationType === undefined) {
			this.reminderNotificationType = ctg.reminderNotificationType;
		}
	}

	if (this.fee) {
		this.fee.unitPrice = this.fee.unitPrice || 0;
		this.fee.amount = this.fee.quantity * this.fee.unitPrice;
	}

	if (this.roomIds && this.roomIds.length) {
		this.roomIds = _.uniqBy(this.roomIds, _.toString);
	}

	if (this.isNew) {
		const last = await TaskModel.findOne().select('no').sort({ createdAt: -1 });
		this.no = (last.no || 0) + 1;
	}

	if (this.startedAt && this.doneAt && (this.isModified('doneAt') || this.isModified('startedAt'))) {
		this.workingPoint = Math.max(_.round(moment(this.doneAt).diff(this.startedAt, 'hour', true), 1), 0);
	}

	this.$locals.isModifiedBookingId = this.isModified('bookingId');
	this.$locals.isModifiedDepartmentId = this.isModified('departmentId');
	this.$locals.isModifiedAssigned = this.isModified('assigned');
	this.$locals.isModifiedNoti = this.isModified('notificationType');
	this.$locals.isModifiedWP = this.isModified('workingPoint');
	this.$locals.isNew = this.isNew;

	if (!this.isNew) {
		this.addLogs();
	}

	next();
});

TaskSchema.post('save', function () {
	if (this.$locals.isNew) {
		notification.pushToHostsOfBlock({
			blockId: this.blockId,
			title: 'New Task',
			data: {
				inboxType: InboxType.TASK,
				taskId: this._id,
			},
			permissions: [RolePermissons.TASK],
		});
	}

	if (this.$locals.isModifiedDepartmentId || this.$locals.isModifiedAssigned || this.$locals.isModifiedNoti) {
		eventEmitter.emit(EVENTS.TASK_UPDATE_ASSIGNED, this);
	}

	if (this.$locals.isModifiedWP) {
		eventEmitter.emit(EVENTS.TASK_UPDATE_POINT, this);
	}

	if (this.$locals.isModifiedBookingId) {
		this.updatePriceVAT();
	}
});

TaskSchema.methods = {
	addLogs() {
		if (!this.$locals.oldData) return;

		const createdBy = this.$locals.updatedBy;
		this.notes = this.notes || [];

		LOG_FIELDS.forEach(field => {
			if (this.isModified(field)) {
				const newData = _.get(this, field);
				if (newData === undefined) return;

				const oldData = _.get(this.$locals, `oldData.${field}`);
				const log = {
					createdBy,
					field,
					oldData,
					newData,
					autoGen: true,
				};

				this.notes.push(log);
			}
		});
	},

	async updatePriceVAT() {
		if (!this.bookingId || !this.bookingId.length) return;

		const bookings = await this.model('Booking')
			.find({
				_id: this.bookingId,
				status: { $in: [BookingStatus.CONFIRMED, BookingStatus.NOSHOW, BookingStatus.CHARGED] },
			})
			.select('roomPrice price currencyExchange currency groupIds priceItems otaName');

		if (!bookings.length) return;

		let bookPrice;

		if (bookings[0].otaName === OTAs.Go2joy) {
			const group = await this.model('UserGroup').findOne({
				_id: bookings[0].groupIds[0],
				'configs.autoVATTask': true,
			});

			if (_.get(group, 'configs.bookingPriceInVAT') === BOOKING_PRICE_VAT_TYPES.ORIGIN_PRICE) {
				bookPrice = _.sumBy(bookings, b => {
					if (_.get(b.priceItems, [0, 'amount'])) {
						return (
							b.price -
							b.roomPrice +
							b.priceItems[0].amount +
							_.get(
								b.priceItems.find(p => p.priceType === 'promotionHotel'),
								'amount',
								0
							)
						);
					}

					return b.price;
				});
			}
		}

		if (!bookPrice) {
			bookPrice = _.sumBy(bookings, b => b.exchangePrice());
		}

		await TaskModel.updateOne(
			{
				_id: this._id,
			},
			{
				$set: {
					'other.bookPrice': bookPrice,
				},
			}
		);
	},

	async changeStatus(data, user) {
		const prevStatus = this.status;
		this.status = data.status;

		if (prevStatus !== this.status) {
			const note = {
				createdBy: user && user._id,
				autoGen: true,
				status: this.status,
				field: 'status',
				oldData: prevStatus,
				newData: this.status,
			};
			if (this.status === TaskStatus.Doing) {
				_.assign(note, data);
				this.startedAt = data.time || new Date();
				if (user && (!this.assigned || !this.assigned.length)) {
					this.assigned = this.assigned || [];
					this.assigned.push(user._id);
				}
			}
			if (this.status === TaskStatus.Done) {
				_.assign(note, data);
				this.doneAt = data.time || new Date();
				this.doneBy = user && user._id;
				if (user && (!this.assigned || !this.assigned.length)) {
					this.assigned = this.assigned || [];
					this.assigned.push(user._id);
				}
			} else {
				this.doneAt = null;
				this.doneBy = null;
			}

			this.notes.push(note);

			await this.save();

			eventEmitter.emit(EVENTS.ASSET_ISSUE_STATUS_UPDATED, this, user);
			eventEmitter.emit(EVENTS.TASK_UPDATE_STATUS, this, user);
		}

		return this;
	},

	async changeCheckStatus(newData, user) {
		const oldData = this.checking;
		this.checking = newData;

		if (oldData !== newData) {
			this.notes.push({
				createdBy: user._id,
				autoGen: true,
				field: 'checking',
				oldData,
				newData,
			});

			await this.save();
		}

		return this;
	},

	async isCleaningTask() {
		const category = this.category && (await mongoose.model('TaskCategory').findById(this.category));
		return !!category && (category.tag === TaskTags.CLEANING || category.tag === TaskTags.CLEANING_BACK);
	},

	async createTaskPayout(user, data = null) {
		if (!this.payoutId && (!this.fee || this.status === TaskStatus.Deleted || !_.isNumber(this.fee.unitPrice))) {
			return;
		}

		this.fee.quantity = this.fee.quantity || 1;
		this.fee.amount = this.fee.quantity * this.fee.unitPrice || 0;
		this.fee.createdBy = this.fee.createdBy || user._id;

		const newData = {
			blockIds: [this.blockId],
			roomIds: this.roomIds,
			paidAt: this.time || new Date(),
			currencyAmount: {
				currency: this.fee.currency,
				amount: this.fee.amount,
				unitPrice: this.fee.unitPrice,
				quantity: this.fee.quantity,
			},
			description: this.description,
			buyType: this.buyType,
			taskId: this._id,
			...data,
		};

		if (newData.payoutType === PayoutType.REFUND) {
			// if (!this.payoutId && (!this.bookingId.length || this.status === TaskStatus.Waiting)) return;
			newData.bookingId = _.head(this.bookingId);

			const booking =
				newData.bookingId &&
				(await mongoose.model('Booking').findById(newData.bookingId).select('otaBookingId'));
			if (!booking) {
				throw new ThrowReturn('Mã đặt phòng không tồn tại!');
			}

			if (!newData.payDescription) {
				newData.payDescription = `tb HOAN TIEN CHO MA DAT PHONG ${booking.otaBookingId}`;
			}
			if (!data || !data.description) {
				const reasonTxt = await this.getReasonTxt();
				newData.description = _.compact([`Hoàn tiền mã đặt phòng ${booking.otaBookingId}`, reasonTxt]).join(
					'\n'
				);
			}
		}

		if (this.other && this.other.bankAccountNo && this.other.bankAccountName && this.other.bankId) {
			const bankAccount = await mongoose.model('BankAccount').createOrUpdate(
				{
					name: this.other.bankAccountName,
					accountName: this.other.bankAccountName,
					accountNos: this.other.bankAccountNo,
					bankId: this.other.bankId,
				},
				user
			);

			newData.payAccountId = bankAccount._id;
		}

		const Payout = mongoose.model('Payout');

		if (this.payoutId) {
			const payout = await Payout.findById(this.payoutId);

			if (payout) {
				if (this.fee.amount !== payout.currencyAmount.amount && payout.isApproved()) {
					throw new ThrowReturn('Chi phí đã duyệt không thể sửa!');
				}

				if (this.status !== TaskStatus.Deleted && this.fee.amount) {
					await Payout.updatePayout(payout, newData, user, false);
					return payout;
				}

				await Payout.deletePayout(payout, user, false);
			}

			this.payoutId = null;
		}

		if (!this.fee.amount || this.status === TaskStatus.Deleted) return;

		if (newData.payoutType === PayoutType.REFUND && !newData.collector) {
			newData.collector = user._id;
		}

		if (newData.isOwnerCollect === undefined) {
			const group = await mongoose.model('UserGroup').findOne({ _id: user.groupIds });
			if (!group.primary && _.get(group.configs, 'defaultIsOwnerCollect') !== false) {
				newData.isOwnerCollect = true;
			}
		}

		const payout = await Payout.create({
			payoutType: PayoutType.PAY,
			...newData,
			createdBy: this.doneBy || user._id,
		});
		this.payoutId = payout._id;

		return payout;
	},

	async isContainCheckItem() {
		if (!this.checkList.length) return false;

		const checkItem = await this.model('CheckItem')
			.findOne({ _id: { $in: this.checkList }, status: { $ne: CHECK_ITEM_STATUS.DELETED } })
			.select('_id')
			.lean();

		return !!checkItem;
	},

	async getReasonTxt() {
		const reason =
			this.reasonId && (await mongoose.model('ReasonUpdating').findById(this.reasonId).populate('parentId'));

		if (reason) {
			if (reason.noteRequired) {
				return this.reasonTxt || this.description;
			}

			return reason.parentId ? `${reason.parentId.label} - ${reason.label}` : reason.label;
		}

		return this.description;
	},

	async updateData(data, user) {
		// const task = await this.findById(taskId).populate('linked.taskId', 'blockId');

		if (this.linked && this.linked.taskId && !this.populated('linked.taskId')) {
			await this.populate('linked.taskId', 'blockId');
		}

		// Validate for task creating from check item
		const linkedBlockId = _.get(this.linked, 'taskId.blockId');
		if (linkedBlockId && _.toString(linkedBlockId) !== _.toString(data.blockId)) {
			throw new ThrowReturn('Block does not match with block of linked task');
		}

		// Validate for change category or block
		const isChangedCategoryId = data.category && _.toString(this.category) !== _.toString(data.category);
		const isChangedBlockId = data.blockId && _.toString(this.blockId) !== _.toString(data.blockId);

		if (isChangedCategoryId || isChangedBlockId) {
			const isContainCheckItem = await this.isContainCheckItem();
			if (isContainCheckItem) throw new ThrowReturn('Check list exist, can not update block or category');
		}

		data = _.omit(data, ['status', 'checking', 'createdBy', 'assetActionId', 'payoutId', 'checkList']);

		const dotData = { ...data, ...dot.dot(_.pickBy(data, o => !mongoose.Types.ObjectId.isValid(o))) };

		this.$locals.updatedBy = _.get(user, '_id');

		_.keys(dotData).forEach(k => {
			_.set(this.$locals, `oldData.${k}`, _.clone(_.get(this, k)));
		});

		this.set(dotData);
		await this.save();
	},
};

TaskSchema.statics = {
	async getTaskById(taskId) {
		const task = await this.findById(taskId);
		if (!task) throw new ThrowReturn().status(404);
		return task;
	},

	async updateTask(taskId, data, user) {
		const task = await this.findById(taskId).populate('linked.taskId', 'blockId');

		await task.updateData(data, user);

		return task;
	},

	async getStats({ from, to, ...filter }) {
		const now = new Date();
		const dateStart = moment(from || now).startOf('date');
		const dateEnd = moment(to || now).endOf('date');

		const timeMinus = 60 * 1000 * now.getTimezoneOffset();
		const start = new Date(dateStart.valueOf() - timeMinus);
		const end = new Date(dateEnd.valueOf() - timeMinus);

		const query = _.pickBy({
			...filter,
			time: {
				$gte: start,
				$lte: end,
			},
		});

		const tasks = await this.find(query).select('roomIds time bookingId').populate('roomIds', 'workPoint').lean();

		const stats = {};
		let totalPoint = 0;
		let totalRoom = 0;
		const bookingIds = new Set();

		while (start <= end) {
			stats[start.toDateMysqlFormat()] = {
				rooms: 0,
				point: 0,
			};
			start.setDate(start.getDate() + 1);
		}

		tasks.forEach(task => {
			const totalTaskPoint = _.sumBy(task.roomIds, 'workPoint') || 1;
			const totalTaskRoom = _.get(task.roomIds, 'length') || 1;

			totalPoint += totalTaskPoint;
			totalRoom += totalTaskRoom;
			const time = moment(task.time).utcOffset(0).format('Y-MM-DD');
			if (task.bookingId) task.bookingId.forEach(b => bookingIds.add(b.toString()));
			if (!stats[time])
				stats[time] = {
					rooms: 0,
					point: 0,
				};
			stats[time].point += totalTaskPoint;
			stats[time].rooms += totalTaskRoom;
		});

		const totalDay = _.keys(stats).length;
		const point = _.round(totalPoint / totalDay);
		const rooms = _.round(totalRoom / totalDay);

		return { stats, point, rooms, bookingIds: [...bookingIds] };
	},

	async getStatusListByTaskIds(taskIds) {
		const tasks = await this.aggregate([
			{
				$match: {
					_id: { $in: taskIds.toMongoObjectIds() },
					status: { $ne: TaskStatus.Deleted },
				},
			},
			{ $project: { status: 1 } },
			{ $group: { _id: null, status: { $addToSet: '$status' } } },
		]);

		return _.get(tasks, '0.status', []);
	},

	async validateRefundTask(data) {
		if (!data.paymentSource) {
			throw new ThrowReturn('Hãy chọn hình thức hoàn tiền!');
		}

		const reason = data.reasonId && (await this.model('ReasonUpdating').findById(data.reasonId));
		if (!reason) {
			throw new ThrowReturn('Hãy chọn lí do hoàn tiền!');
		}

		if (reason.noteRequired && !data.reasonTxt) {
			throw new ThrowReturn('Hãy nhập lí do hoàn tiền!');
		}
	},
};

const TaskModel = mongoose.model('Task', TaskSchema, 'task');

module.exports = TaskModel;

const mongoose = require('mongoose');
const _ = require('lodash');

const { SERVICE_FEE_TYPES, ServiceFeeLogs } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const SERVICE_TYPES = _.values(SERVICE_FEE_TYPES);
const FilterUpdateKeys = ['note', 'unitPrice', 'quantity', 'unit', 'amount'];

const serviceFeeSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block' },
		deleted: { type: Boolean, default: false },
		bookingId: { type: ObjectId, ref: 'Booking' },
		roomId: { type: ObjectId, ref: 'Room' },
		guestId: { type: ObjectId, ref: 'Guest' },
		serviceType: { type: String, default: SERVICE_TYPES[0], enum: SERVICE_TYPES },
		unitPrice: Number,
		quantity: { type: Number, default: 0 },
		amount: { type: Number, default: 0 },
		unit: String,
		isSendMsg: { type: Boolean, default: false },
		messages: [
			{
				message: String,
				images: [String],
				createdAt: Date,
				messageId: String,
				ottName: String,
				sender: String,
			},
		],
		histories: [
			{
				description: String,
				createdAt: Date,
				by: { type: ObjectId, ref: 'User' },
				removedBy: { type: ObjectId, ref: 'User' },
				system: { type: Boolean, default: false },
				isWorkNote: { type: Boolean, default: false },
				specialRequest: Boolean,
				noteType: [Number],
				// new log
				action: String, // UPDATE, CREATE, DELETE
				prevData: String,
				data: String,
			},
		],
		note: String,
		createdBy: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
	}
);

serviceFeeSchema.statics = {
	async amount({ bookingId, roomId, serviceType }) {
		const query = { bookingId, deleted: false, serviceType };
		if (roomId) query.roomId = roomId;

		const serviceFees = await this.find(query).select('amount');
		const amount = _.sumBy(serviceFees, 'amount');
		return amount;
	},

	getUnitByServiceType(serviceType) {
		const UNIT = {
			laundryFee: 'kg',
			carFee: 'night',
			compensation: '',
			motobikeFee: 'night',
		};
		return _.get(UNIT, serviceType) || '';
	},

	async getOverview(bookingId) {
		const rs = {};
		const serviceFees = await this.find({ bookingId, deleted: false })
			.select('amount quantity serviceType unitPrice')
			.lean();
		const serviceTypes = _.map(serviceFees, 'serviceType');

		if (!_.isEmpty(serviceTypes)) {
			serviceTypes.forEach(st => {
				const quantity = _.sumBy(serviceFees, 'quantity');
				const amount = _.sumBy(serviceFees, 'amount');
				const unitPrice = _.sumBy(serviceFees, 'unitPrice') / serviceFees.length;

				_.set(rs, st, {
					quantity,
					amount,
					unitPrice,
					unit: this.getUnitByServiceType(st),
				});
			});
		}
		return rs;
	},

	async getServiceFeesByBookingId(bookingId, includeDeleted) {
		const query = { bookingId };
		if (!includeDeleted) query.deleted = false;

		const serviceFees = await this.find(query)
			.select('-bookingId -blockId')
			.populate('createdBy', 'name username')
			.populate('roomId', 'info.roomNo')
			.lean();

		let grByTypeServiceFees;

		if (!_.isEmpty(serviceFees)) {
			grByTypeServiceFees = _.groupBy(serviceFees, 'serviceType');
			const serviceTypes = _.map(serviceFees, 'serviceType');

			_.forEach(serviceTypes, serviceType => {
				const _serviceFees = grByTypeServiceFees[serviceType];
				const amount = _.sumBy(_serviceFees, 'amount');
				const quantity = _.sumBy(_serviceFees, 'quantity');
				const unitPrice = _.sumBy(_serviceFees, 'unitPrice') / _serviceFees.length;

				_.set(grByTypeServiceFees, `${serviceType}Amount`, amount);
				_.set(grByTypeServiceFees, `${serviceType}Quantity`, quantity);
				_.set(grByTypeServiceFees, `${serviceType}UnitPrice`, unitPrice);
			});
		}
		return grByTypeServiceFees;
	},

	async addLog({ serviceFeeId, userId, ...data }) {
		await this.updateOne(
			{ _id: serviceFeeId },
			{
				$push: {
					histories: {
						by: userId,
						createdAt: new Date(),
						system: true,
						...data,
					},
				},
			}
		);
	},

	async getHistory(serviceFeeId) {
		return this.findById(serviceFeeId)
			.select('histories')
			.populate('histories.by histories.removedBy', 'username name role');
	},
};

serviceFeeSchema.pre('save', function (next) {
	if (!this.isNew) {
		FilterUpdateKeys.forEach(key => {
			if (this.isModified(key)) {
				this.$locals[`is${key}Modified`] = true;
				this.$locals[`${key}Data`] = this[key];
			}
		});
	}
	next();
});

serviceFeeSchema.post('save', function (doc) {
	if (this.$locals.action === ServiceFeeLogs.DELETE) {
		model.addLog({
			serviceFeeId: doc._id,
			userId: this.$locals.userId,
			action: this.$locals.action,
		});
		return;
	}

	FilterUpdateKeys.asyncForEach(key => {
		if (this.$locals[`is${key}Modified`]) {
			model.addLog({
				serviceFeeId: doc._id,
				userId: this.$locals.userId,
				action: _.toUpper(`${this.$locals.action}_${key}`),
				prevData: this.$locals[`pre${key}Data`],
				data: this.$locals[`${key}Data`],
			});
		}
	});
});

serviceFeeSchema.methods = {
	async updateProperties(data, userId) {
		const _data = _.pick(data, FilterUpdateKeys);
		this.$locals.userId = userId;
		this.$locals.action = ServiceFeeLogs.UPDATE;

		FilterUpdateKeys.forEach(key => {
			this.$locals[`pre${key}Data`] = this[key];
		});

		Object.assign(this, _data);
		await this.save();
		return this;
	},
};

const model = mongoose.model('ServiceFee', serviceFeeSchema, 'service_fee');
module.exports = model;

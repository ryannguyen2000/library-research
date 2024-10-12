const { ContractStatus, ContractType } = require('@src/utils/const');
const mongoose = require('mongoose');
const _ = require('lodash');

const { CONTRACT_CALC_TYPE, WATER_FEE_CALC_TYPE } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const UpdatingKeys = [
	'price',
	'deposit',
	'discount',
	'defaultWaterPrice',
	'oldElectricValue',
	'newElectricValue',
	'electricPricePerKwh',
	'note',
	'cleaningPerWeek',
	'cleaningFee',
	'sale',
	'endDate',
	'startDate',
	'status',
];

const ContractUpdate = {
	electricPricePerKwh: 'CONTRACT_UPDATE_ELECTRIC_PRICE_PER_KWH',
	oldElectricValue: 'CONTRACT_UPDATE_OLD_ELECTRIC_VALUE',
	newElectricValue: 'CONTRACT_UPDATE_NEW_ELECTRIC_VALUE',
	cleaningFee: 'CONTRACT_UPDATE_CLEANING_FEE',
	deposit: 'CONTRACT_UPDATE_DEPOSIT',
	discount: 'CONTRACT_UPDATE_DISCOUNT',
	defaultWaterPrice: 'CONTRACT_UPDATE_DEFAULT_WATER_PRICE',
	price: 'CONTRACT_UPDATE_PRICE_UPDATING',
	startDate: 'CONTRACT_UPDATE_START_DATE',
	endDate: 'CONTRACT_UPDATE_END_DATE',
	changeRoom: 'CONTRACT_UPDATE_CHANGE_ROOM',
	note: 'CONTRACT_UPDATE_NOTE',
	cleaningPerWeek: 'CONTRACT_UPDATE_CLEANING_PER_WEEK',
	sale: 'CONTRACT_UPDATE_SALE',
	// status
	canceled: 'CONTRACT_CANCELED',
	confirmed: 'CONTRACT_CREATED',
};

const ContractSchema = new Schema(
	{
		bookingIds: [{ type: Schema.Types.ObjectId, ref: 'Booking' }],
		contractType: { type: Number, enum: Object.values(ContractType), default: ContractType.Person },
		groupIds: [{ type: Schema.Types.ObjectId, ref: 'UserGroup' }],
		images: [String],
		otaBookingId: { type: String },
		otaName: { type: String },
		startDate: Date,
		endDate: Date,
		originPrice: { type: Number, default: 0 },
		discount: { type: Number, default: 0 },
		price: { type: Number, default: 0 },
		deposit: { type: Number, default: 0 },
		oldElectricValue: { type: Number, default: 0 },
		newElectricValue: { type: Number, default: 0 },
		electricPricePerKwh: { type: Number, default: 0 },
		electricFee: { type: Number, default: 0 },
		waterFeeCalcType: { type: Number, enum: _.values(WATER_FEE_CALC_TYPE), default: WATER_FEE_CALC_TYPE.DEFAULT },
		waterFee: { type: Number, default: 0 },
		defaultWaterPrice: { type: Number, default: 0 },
		oldWaterValue: { type: Number, default: 0 },
		newWaterValue: { type: Number, default: 0 },
		waterPricePerM3: { type: Number, default: 0 },
		cleaningPerWeek: { type: Number, default: 0 },
		cleaningFee: { type: Number, default: 0 },
		note: String,
		months: { type: Number, default: 0 },
		calcType: { type: Number, enum: _.values(CONTRACT_CALC_TYPE) }, // 1: Tính đến cuối tháng , 2: Tính đến ngày checkin
		language: String,
		statusNote: String,
		sale: String,
		roomType: String,
		payables: { type: Number, default: 0 },
		status: { type: String, enum: Object.values(ContractStatus), default: ContractStatus.CONFIRMED },
		canceledAt: Date,
		canceledBy: { type: ObjectId, ref: 'User' },
		autoExtend: { type: Boolean, default: false },
		histories: [
			{
				createdAt: Date,
				system: { type: Boolean, default: false },
				by: { type: ObjectId, ref: 'User' },
				removedBy: { type: ObjectId, ref: 'User' },
				updatedBy: { type: ObjectId, ref: 'User' },
				action: String,
				description: String,
				prevData: String,
				data: String,
			},
		],
		// môi giới
		totalCommission: Number,
		internalAgent: String,
		internalCommissionRate: Number,
		internalCommission: Number,
		externalAgent: String,
		externalCommissionRate: Number,
		externalCommission: Number,
		totalMonth: Number,
		commissionAvg: Number,
		commissionToRevenue: Number,
		companyFee: Number,
	},
	{
		timestamps: true,
	}
);

ContractSchema.pre('save', function (next) {
	if (!this.isNew) {
		UpdatingKeys.forEach(key => {
			if (this.isModified(key)) this.$locals[`isModified_${key}`] = true;
		});
	}
	next();
});

ContractSchema.post('save', function (doc) {
	UpdatingKeys.forEach(key => {
		if (this.$locals[`isModified_${key}`]) {
			const isDate = _.includes(['startDate', 'endDate'], key);
			const data = doc[key];

			Model.addLog({
				contractId: doc._id,
				userId: this.$locals.userId,
				action: ContractUpdate[key],
				prevData: this.$locals[`pre${key}`],
				data: isDate ? data.toISOString() : data,
				reason: this.$locals.reason,
				system: !!this.$locals.userId,
			});
		}
	});
});

ContractSchema.statics = {
	async addLog({ contractId, userId, ...data }) {
		await this.updateOne(
			{ _id: contractId },
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
};

const Model = mongoose.model('BookingContract', ContractSchema, 'booking_contract');
module.exports = Model;

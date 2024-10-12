const mongoose = require('mongoose');
const _ = require('lodash');
const { rangeDate } = require('@utils/date');
const { AcceleratorOTAs, AcceleratorDayType } = require('@utils/const');

const { Schema, Custom } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

const ModelSchema = new Schema(
	{
		from: { ...Custom.Schema.Types.Date, required: true },
		to: { ...Custom.Schema.Types.Date, required: true },
		stackability: { type: Boolean, default: false },
		commission: { type: Number, min: 1, required: true },
		countries: [String],
		eligibleDay: { type: String, enum: _.values(AcceleratorDayType), default: AcceleratorDayType.Allday },
		otas: [{ type: String, enum: [...AcceleratorOTAs] }],
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
		blockId: { type: ObjectId, ref: 'Block', required: true },
		dataOTAs: [{ _id: false, ota: String, propertyId: String, meta: Mixed }],
		deleted: { type: Boolean, default: false },
		deletedBy: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
	}
);

ModelSchema.pre('save', function (next) {
	if (!this.otas || !this.otas.length) {
		this.otas = [...AcceleratorOTAs];
	}

	next();
});

ModelSchema.methods = {
	isValidDate(date) {
		if (this.from > date || this.to < date) {
			return false;
		}

		if (!this.eligibleDay || this.eligibleDay === AcceleratorDayType.Allday) return true;

		const dow = new Date(date).getDay();
		const startDayWeekend = 5;

		if (this.eligibleDay === AcceleratorDayType.Weekday && dow < startDayWeekend) return true;
		if (this.eligibleDay === AcceleratorDayType.Weekend && dow >= startDayWeekend) return true;
		return false;
	},
};

ModelSchema.statics = {
	async getCommByDates({ blockId, ota, from, to }) {
		const accelerators = await this.find({
			blockId,
			otas: ota,
			to: { $gte: from },
			from: { $lte: to },
			deleted: false,
		});

		const dates = rangeDate(from, to).toArray();
		const rs = {};

		const today = new Date().toDateMysqlFormat();

		dates.forEach(date => {
			const fDate = date.toDateMysqlFormat();
			if (fDate < today) return;

			const accs = accelerators.filter(a => a.isValidDate(fDate));

			const stacks = accs.filter(a => a.stackability);
			const notStacks = accs.filter(a => !a.stackability);

			const commStack = _.sumBy(stacks, 'commission') || 0;
			const commNotStack = _.get(_.maxBy(notStacks, 'commission'), 'commission', 0);

			rs[fDate] = _.max([commStack, commNotStack]);
		});

		return rs;
	},
};

module.exports = mongoose.model('Accelerator', ModelSchema, 'accelerator');

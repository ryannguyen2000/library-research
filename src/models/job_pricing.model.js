const mongoose = require('mongoose');
// const _ = require('lodash');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const JobSchema = new Schema(
	{
		priceId: { type: ObjectId, ref: 'PriceHistory' },
		numRun: { type: Number, default: 0 },
		timeStart: { type: Date },
		ota: String,
		description: String,
		doing: { type: Boolean, default: false },
		done: { type: Boolean, default: false },
		force: Boolean,
	},
	{ timestamps: true }
);

// JobSchema.index({ createdAt: -1 }, { expires: '7d' });

JobSchema.statics.createJob = async function ({ otas, ...data }) {
	// const otaNames = _.chain(prices)
	// 	.values()
	// 	.reduce((otas, roomTypeData) => otas.concat(_.keys(roomTypeData)), [])
	// 	.uniq()
	// 	.value();

	const tasks = await otas.asyncMap(async otaName => {
		// const task = new this({ ota: otaName, ...data });
		// await task.save();
		return this.create({
			ota: otaName,
			...data,
		});
	});

	return tasks.filter(t => t);
};

module.exports = mongoose.model('JobPricing', JobSchema, 'job_pricing');

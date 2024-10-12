const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const OTAInfo = {
	otaName: String,
	account: String,
};

const JobSchema = new Schema(
	{
		promotionId: { type: ObjectId, ref: 'Promotion' },
		numRun: { type: Number, default: 0 },
		otas: [OTAInfo],
		operrator: String,
		description: String,
		blockId: { type: ObjectId, ref: 'Block' },
		// rateIds: [{ type: ObjectId, ref: 'Rate' }],
		ratePlanIds: [{ type: Number, ref: 'RatePlan' }],
		// doing: { type: Boolean, default: false },
		done: { type: Boolean, default: false },
		// error: { type: Boolean, default: false },
	},
	{ timestamps: true }
);

JobSchema.index({ createdAt: -1 }, { expires: '14d' });

JobSchema.statics.createJob = async function ({ promotionId, otas = [], ...data }) {
	if (!otas || otas.length === 0) {
		const promo = await this.model('Promotion').findById(promotionId).select('activeOTAs');
		if (promo) {
			otas = promo.activeOTAs.map(otaName => ({ otaName }));
		}
	}

	const tasks = await otas.asyncMap(ota => {
		return this.create({ ...data, promotionId, otas: [ota] });
	});

	return tasks;
};

module.exports = mongoose.model('JobPromotion', JobSchema, 'job_promotion');

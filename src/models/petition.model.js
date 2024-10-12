const { Schema, model } = require('mongoose');
const _ = require('lodash');

const { PETITION_STATUS } = require('@utils/const');
const { LOG_FIELDS } = require('@controllers/task/const/petition.const');

const { ObjectId, Mixed } = Schema.Types;

const PetitionSchema = new Schema(
	{
		no: { type: Number },
		status: { type: String, enum: _.values(PETITION_STATUS), default: PETITION_STATUS.WAITING },
		reportText: String,
		replyText: String,
		expired: Date,
		checkItemId: { type: ObjectId, ref: 'CheckItem', required: true },
		createdBy: { type: ObjectId, ref: 'User' },
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
		doneAt: Date,
		doneBy: { type: ObjectId, ref: 'User' },
	},
	{ timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

PetitionSchema.virtual('isExpired').get(function () {
	if (!this.expired) return false;
	return this.expired.toISOString() <= new Date().toISOString();
});

PetitionSchema.methods = {
	set$localsForLogging(userId) {
		this.$locals.updatedBy = userId;
		this.$locals.oldData = _.cloneDeep(this._doc);
	},

	addLogs() {
		const by = this.$locals.updatedBy;
		this.logs = this.logs || [];

		LOG_FIELDS.forEach(field => {
			if (this.isModified(field)) {
				const newData = this[field];
				if (newData === undefined) return;
				const oldData = _.get(this.$locals, `oldData.${field}`);
				this.logs.push({
					by,
					field,
					newData,
					oldData,
				});
			}
		});
	},
};

PetitionSchema.pre('save', async function (next) {
	if (this.isNew) {
		const last = await PetitionModel.findOne().select('no').sort({ $natural: -1 });
		this.no = _.get(last, 'no', 0) + 1;
	} else {
		this.addLogs();
	}
	next();
});

const PetitionModel = model('Petition', PetitionSchema, 'petition');
module.exports = PetitionModel;

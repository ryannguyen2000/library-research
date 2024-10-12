const { model, Schema } = require('mongoose');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { CHECK_ITEM_STATUS } = require('@utils/const');
const { LOG_FIELDS } = require('@controllers/task/const/checkItem.const');

const { ObjectId, Mixed } = Schema.Types;

const CheckItemSchema = new Schema({
	taskId: { type: ObjectId, ref: 'Task' }, // parent taskId
	label: String,
	attachments: [String],
	checkListCategoryId: { type: ObjectId, ref: 'CheckListCategory' },
	createdBy: { type: ObjectId, ref: 'User' },
	createdAt: Date,
	taskIds: [{ type: ObjectId, ref: 'Task' }],
	status: { type: String, enum: _.values(CHECK_ITEM_STATUS), default: CHECK_ITEM_STATUS.PASS },
	petitionIds: [{ type: ObjectId, ref: 'Petition' }],
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
});

CheckItemSchema.pre('save', function (next) {
	if (!this.isNew) this.addLogs();
	next();
});

CheckItemSchema.statics = {
	async findOneAndValidate(checkItemId) {
		const checkItem = await CheckItemModel.findOne({
			_id: checkItemId,
			// status: { $ne: CHECK_ITEM_STATUS.DELETED },
		}).populate('taskId');
		if (!checkItem) throw new ThrowReturn('Check item does not exist');

		return checkItem;
	},
};

CheckItemSchema.methods = {
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

	set$localsForLogging(userId) {
		this.$locals.updatedBy = userId;
		this.$locals.oldData = _.cloneDeep(this._doc);
	},

	addPetition(petitionId, userId) {
		this.set$localsForLogging(userId);
		this.petitionIds.push(petitionId);
		return this.save();
	},

	removePetition(petitionId, userId) {
		this.set$localsForLogging(userId);
		this.petitionIds = this.petitionIds.filter(_petitionId => _petitionId.toString() !== petitionId.toString());
		return this.save();
	},

	addTask(taskId, userId) {
		this.set$localsForLogging(userId);
		this.taskIds.push(taskId);
		return this.save();
	},

	removeTask(taskId, userId) {
		this.set$localsForLogging(userId);
		this.taskIds = this.taskIds.filter(_taskId => _taskId.toString() !== taskId.toString());
		return this.save();
	},
};

const CheckItemModel = model('CheckItem', CheckItemSchema, 'check_item');
module.exports = CheckItemModel;

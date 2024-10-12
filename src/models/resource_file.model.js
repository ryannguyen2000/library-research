const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;
const { VIRTUAL_RESOURCE, DEFAULT_FOLDER_NAME, RESOURCE_FILE_TYPE, RESOURCE_FILE_STATUS } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');

const ModelSchema = new Schema(
	{
		name: {
			vi: { type: String },
			en: { type: String },
		},
		parent: { type: ObjectId, ref: 'ResourceFile' },
		rsId: String,
		resource: { type: String, ref: 'ResourceUploading' },
		isFolder: { type: Boolean, default: false },
		createdBy: { type: ObjectId, ref: 'User' },
		deletedBy: { type: ObjectId, ref: 'User' },
		updatedBy: { type: ObjectId, ref: 'User' },
		blockIds: [{ type: ObjectId, ref: 'Block' }],
		groupId: { type: ObjectId, ref: 'UserGroup' },
		deleted: { type: Boolean, default: false },
		editable: { type: Boolean, default: true },
		isVirtual: { type: Boolean, defatult: false },
		fileType: { type: String, enum: _.values(RESOURCE_FILE_TYPE), default: RESOURCE_FILE_TYPE.MANUAL },
		fileStatus: { type: String, enum: _.values(RESOURCE_FILE_STATUS) },
		virtual: {
			type: { type: String, enum: _.values(VIRTUAL_RESOURCE) },
			query: Mixed,
		},
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

ModelSchema.virtual('children', {
	ref: 'ResourceFile',
	localField: '_id',
	foreignField: 'parent',
});

ModelSchema.path('parent').validate(function (value) {
	return !value || !this._id.equals(value);
}, "parent can't index it self");

ModelSchema.pre('save', async function (next) {
	if (this.parent) {
		if (this.parent.equals(this._id)) {
			throw new ThrowReturn('parent invalid');
		}
		const parent = await Model.findOne({ _id: this.parent, isFolder: true, editable: true }).select('_id');
		if (!parent) throw new ThrowReturn('parent invalid');
	}
	this.isFolder = !this.resource;
	if (this.isVirtual) this.editable = false;
	this.rsId = _.toString(this._id);
	this.name.vi = this.name.vi || this.name.en || DEFAULT_FOLDER_NAME.VI;
	this.name.en = this.name.en || this.name.vi || DEFAULT_FOLDER_NAME.EN;
	next();
});

ModelSchema.index({ parent: 1 });

const Model = mongoose.model('ResourceFile', ModelSchema, 'resource_file');

module.exports = Model;

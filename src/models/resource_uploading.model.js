const mongoose = require('mongoose');
const urlRegex = require('url-regex');
const fs = require('fs');
const path = require('path');

const { UPLOAD_CONFIG } = require('@config/setting');

const { Schema, ObjectId } = mongoose;

function hasExists(dir) {
	return fs.promises
		.access(dir, fs.constants.F_OK)
		.then(() => true)
		.catch(() => false);
}

const SchemaModel = new Schema(
	{
		_id: String,
		path: String,
		originWidth: Number,
		originHeight: Number,
		originName: String,
		originSize: Number,
		external: Boolean,
		mimetype: String,
		createdBy: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: {
			updatedAt: false,
		},
		toJSON: {
			virtuals: true,
		},
		toObject: {
			virtuals: true,
		},
		id: false,
		versionKey: false,
	}
);

SchemaModel.virtual('ratio', function () {
	return Number(this.OriginWidth / this.originHeight).toFixed(2);
});

SchemaModel.virtual('url').get(function () {
	// const isValid = urlRegex({ exact: true }).test(this.path);
	if (this.external) return this.path;
	return `${UPLOAD_CONFIG.FULL_URI}/${this.path}`;
});

SchemaModel.pre('save', function (next) {
	this.external = urlRegex({ exact: true }).test(this.path);
	next();
});

SchemaModel.methods = {
	getRelativePath() {
		const isValid = urlRegex({ exact: true }).test(this.path);
		if (isValid) return null;
		return path.resolve(`${UPLOAD_CONFIG.PATH}/${this.path}`);
	},

	async getExistRelativePath() {
		const dirPath = `${UPLOAD_CONFIG.PATH}/${this.path}`;
		const exists = await hasExists(dirPath);
		if (exists) return dirPath;
	},
};

module.exports = mongoose.model('ResourceUploading', SchemaModel, 'resource_uploading');

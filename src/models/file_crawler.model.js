const mongoose = require('mongoose');
// const _ = require('lodash');

const { Schema } = mongoose;
// const { ObjectId, Mixed } = Schema.Types;
// const { VIRTUAL_RESOURCE, DEFAULT_FOLDER_NAME } = require('@utils/const');
// const ThrowReturn = require('@core/throwreturn');

const ModelSchema = new Schema(
	{
		from: { type: String },
		url: { type: String },
		localPath: { type: String },
		localFileName: { type: String },
		fileName: { type: String },
		done: { type: Boolean, default: false },
		retried: { type: Number, default: 0 },
	},
	{
		timestamps: true,
	}
);

const FormCoopModel = mongoose.model('FileCrawler', ModelSchema, 'file_crawler');

module.exports = FormCoopModel;

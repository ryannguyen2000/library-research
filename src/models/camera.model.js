const mongoose = require('mongoose');
const { CAMERA_CONFIG } = require('@config/setting');
const uri = require('@utils/uri');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const CSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block' },
		host: String,
		username: String,
		password: String,
		name: String,
		description: String,
		order: Number,
		createdBy: { type: ObjectId, ref: 'User' },
	},
	{
		timestamps: true,
		toJSON: {
			virtuals: true,
		},
	}
);

CSchema.virtual('urls').get(function () {
	return Object.entries(CAMERA_CONFIG).map(([key, url]) => ({
		key,
		url: uri(url, {
			hostname: this.host,
			username: this.username,
			password: this.password,
		}),
	}));
});

module.exports = mongoose.model('Camera', CSchema, 'camera');

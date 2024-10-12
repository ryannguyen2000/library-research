const mongoose = require('mongoose');
const { md5 } = require('@utils/crypto');

const { Schema } = mongoose;

const ImageCompress = new Schema(
	{
		url: { type: String, required: true },
		newUrl: { type: String },
		hash: { type: String },
		data: Schema.Types.Mixed,
	},
	{ timestamps: true }
);

ImageCompress.pre('save', function (next) {
	this.hash = md5(this.url);
	next();
});

ImageCompress.pre('insertMany', async function (next, docs) {
	docs.forEach(doc => {
		doc.hash = md5(doc.url);
	});
	next();
});

ImageCompress.statics = {
	findByUrl(url) {
		return this.findOne({
			hash: md5(url),
		});
	},
	findUrls(url) {
		return this.find({
			hash: md5(url),
		});
	},
};

module.exports = mongoose.model('ImageCompress', ImageCompress, 'image_compress');

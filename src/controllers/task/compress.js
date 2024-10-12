const _ = require('lodash');

const models = require('@models');
const { md5 } = require('@utils/crypto');

const { isExtImage, saveImages } = require('@utils/file');
const { logger } = require('@utils/logger');

const MAX_SIZE = 1920;
const QUALITY = 70;
const FOLDER = 'image-compress';

async function getCompressImages(data, limit = 5, opts) {
	try {
		const attachments = {};
		await _.chunk(_.compact(data), limit).asyncForEach(item => {
			return item.asyncMap(async url => {
				const ext = url.substring(url.lastIndexOf('.'));
				const newUrl = isExtImage(ext) ? await compressImageUrl(url, opts) : url;
				attachments[url] = newUrl;
			});
		});
		return attachments;
	} catch (e) {
		logger.error(e);
	}
}

async function compressImageUrl(attachmentUrl, opts = {}) {
	if (!opts.forceCompress) {
		const imgCompressExisted = await models.ImageCompress.findByUrl(attachmentUrl)
			.select('newUrl')
			.catch(() => null);

		if (imgCompressExisted) return imgCompressExisted.newUrl;
	}

	logger.info('Force compress: ', opts.forceCompress);

	const file = await saveImages(attachmentUrl, FOLDER, '', {
		maxWidth: opts.maxWidth || MAX_SIZE,
		maxHeight: opts.maxHeight || MAX_SIZE,
		quality: opts.quality || QUALITY,
	});

	if (file && file.url) {
		await models.ImageCompress.updateOne(
			{ hash: md5(attachmentUrl) },
			{
				data: file.metadata,
				newUrl: file.url,
				url: attachmentUrl,
			},
			{ upsert: true }
		);
		return file.url;
	}

	return attachmentUrl;
}

module.exports = { getCompressImages };

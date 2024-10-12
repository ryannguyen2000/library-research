/* eslint-disable no-inner-declarations */
const { isMainThread } = require('worker_threads');

if (isMainThread) {
	const { runWorker } = require('@workers/index');
	const { FILE_COMPRESS_IMAGE } = require('@workers/const');

	function compressImage(fileData, folderPath, isFullRs, options) {
		return runWorker({
			type: FILE_COMPRESS_IMAGE,
			data: {
				fileData: {
					data: fileData.data,
					tempFilePath: fileData.tempFilePath,
				},
				folderPath,
				isFullRs,
				options,
			},
		});
	}

	module.exports = {
		compressImage,
	};
} else {
	const fs = require('fs');
	const sharp = require('sharp');
	const { v4: uuid } = require('uuid');
	const { logger } = require('./logger');

	sharp.cache(false);
	const MAX_SIZE = 1920;

	async function compressImage({ fileData, folderPath, isFullRs = false, options = {} }) {
		try {
			const quality = options.quality || 80;
			const image = sharp(fileData.tempFilePath || fileData.data);
			const meta = await image.metadata();
			const maxWidth = options.maxWidth || MAX_SIZE;
			const maxHeight = options.maxHeight || MAX_SIZE;

			if (meta.width > maxWidth) {
				image.resize({
					width: maxWidth,
				});
			}
			if (meta.height > maxHeight) {
				image.resize({
					height: maxHeight,
				});
			}

			image.jpeg({
				quality,
			});

			const nameWithoutExt = uuid();
			const newName = `${nameWithoutExt}.jpg`;

			await image.toFile(`${folderPath}/${newName}`);

			if (fileData.tempFilePath) {
				fs.unlink(fileData.tempFilePath, () => {});
			}

			return isFullRs ? { newName, metadata: meta } : newName;
		} catch (e) {
			logger.error(e);
		}
	}

	module.exports = {
		compressImage,
	};
}

// const fs = require('fs');
// const sharp = require('sharp');
// const { v4: uuid } = require('uuid');
const { parentPort } = require('worker_threads');
// const fetch = require('node-fetch');
// const path = require('path');

// const { logger } = require('../utils/logger');
const { downloadContentFromUrl } = require('../utils/file');
const { compressImage } = require('../utils/compress');
const { FILE_COMPRESS_IMAGE, FILE_CRAWLER } = require('./const');

// sharp.cache(false);
// const MAX_SIZE = 1920;

// async function compressImage({ fileData, folderPath, isFullRs = false }) {
// 	try {
// 		const image = sharp(fileData.tempFilePath || fileData.data);
// 		const meta = await image.metadata();

// 		if (meta.width > MAX_SIZE) {
// 			image.resize({
// 				width: MAX_SIZE,
// 			});
// 		}
// 		if (meta.height > MAX_SIZE) {
// 			image.resize({
// 				height: MAX_SIZE,
// 			});
// 		}
// 		image.jpeg({
// 			quality: 80,
// 		});

// 		const nameWithoutExt = uuid();
// 		const newName = `${nameWithoutExt}.jpg`;

// 		await image.toFile(`${folderPath}/${newName}`);

// 		if (fileData.tempFilePath) {
// 			fs.unlink(fileData.tempFilePath, () => {});
// 		}

// 		return isFullRs ? { newName, metadata: meta } : newName;
// 	} catch (e) {
// 		logger.error(e);
// 	}
// }

// function delay(time) {
// 	return new Promise(rs => setTimeout(rs, time));
// }

// function hasExists(dir) {
// 	return fs.promises
// 		.access(dir, fs.constants.F_OK)
// 		.then(() => true)
// 		.catch(() => false);
// }

// async function checkFolder(folderPath) {
// 	folderPath = path.resolve(folderPath);
// 	if (!(await hasExists(folderPath))) {
// 		await fs.promises.mkdir(folderPath, { recursive: true });
// 	}
// 	return folderPath;
// }

// function isExtImage(ext) {
// 	const imageExt = ['.jpeg', '.jpg', '.png', '.gif', '.tiff', '.webp'];
// 	return imageExt.includes(ext);
// }

// function isExtVideo(ext) {
// 	const videoExt = ['.webm', '.mp4', '.m4p', '.m4v', '.flv'];
// 	return videoExt.includes(ext);
// }

// const MAX_RETRY = 2;

function crawlerFile({ url, localPath }) {
	return downloadContentFromUrl({
		url,
		filePath: localPath,
	});
}

async function onMessage({ type, data, id } = {}) {
	// const result = await compressImage(data.fileData, data.folderPath, data.isFullRs);

	// parentPort.postMessage({ id, type, result });

	let result;
	let error;

	try {
		if (type === FILE_COMPRESS_IMAGE) {
			result = await compressImage(data);
		} else if (type === FILE_CRAWLER) {
			result = await crawlerFile(data);
		}
	} catch (e) {
		error = e;
	}

	parentPort.postMessage({ id, type, result, error });
}

parentPort.on('message', onMessage);

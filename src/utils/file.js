const moment = require('moment');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { v4: uuid } = require('uuid');
const isBase64 = require('is-base64');
const mime = require('mime-types');
const PDFMerger = require('pdf-merger-js');

const { UPLOAD_CONFIG, URL_CONFIG, SERVER_CONFIG } = require('../../config/setting');
const { logger } = require('./logger');
const { compressImage } = require('./compress');

function hasExists(dir) {
	return fs.promises
		.access(dir, fs.constants.F_OK)
		.then(() => true)
		.catch(() => false);
}

async function checkFolder(folderPath) {
	folderPath = path.resolve(folderPath);
	if (!(await hasExists(folderPath))) {
		await fs.promises.mkdir(folderPath, { recursive: true });
	}
	return folderPath;
}

async function saveImages(inputData, folder = 'guest', fileName, compressOptions) {
	try {
		// const today = new Date().toDateMysqlFormat();
		const fpath = `${moment().format('YY/MM/DD')}/${folder}`;

		const folderPath = await checkFolder(`${UPLOAD_CONFIG.PATH}/${fpath}`);

		if (typeof inputData === 'string' && inputData.match(/^https*:\/\//)) {
			const localUri = getLocalUri(inputData);

			if (localUri) {
				if (compressOptions) {
					const file = await compressImage({ data: localUri }, folderPath, true, compressOptions);
					if (file) {
						file.url = `${UPLOAD_CONFIG.FULL_URI}/${fpath}/${file.newName}`;
						inputData = file;
					}
				}
				return inputData;
			}

			const buffer = await fetch(inputData)
				.then(res => res.buffer())
				.catch(() => null);

			if (!buffer) {
				return inputData;
			}
			inputData = buffer;
		} else if (isBase64(inputData, { allowMime: true, mimeRequired: true, allowEmpty: false })) {
			inputData = Buffer.from(inputData.replace(/^data:image\/(jpeg|png);base64,/, ''), 'base64');
		} else {
			throw new Error('inputData not valid');
		}

		fileName = fileName || uuid();

		const compressed = await compressImage(
			{
				data: inputData,
				name: fileName,
			},
			folderPath
		);
		if (compressed) {
			return `${UPLOAD_CONFIG.FULL_URI}/${fpath}/${compressed}`;
		}

		await fs.promises.writeFile(`${folderPath}/${fileName}.jpg`, inputData);

		return `${UPLOAD_CONFIG.FULL_URI}/${fpath}/${fileName}.jpg`;
	} catch (e) {
		logger.error(e);
		return null;
	}
}

const MAX_RETRY = 2;
const TIMEOUT = 5 * 60 * 1000;

function delay(time) {
	return new Promise(rs => setTimeout(rs, time));
}

async function downloadContentFromUrl({ url, filePath, retry = 0, validateFolder = true, options }) {
	[filePath] = filePath.split('?');

	if (!retry && validateFolder) {
		await checkFolder(path.dirname(filePath));
	}

	return fetch(url, options)
		.then(
			res =>
				new Promise((resolve, reject) => {
					const contentLength = parseInt(res.headers.get('content-length')) || 0;
					if (contentLength && contentLength < 200) return reject('content-length is too short!');

					const contentType = res.headers.get('content-type');

					if (contentType && contentType !== 'application/octet-stream') {
						const ext = path.extname(filePath);
						if (
							(isExtImage(ext) && !contentType.includes('image')) ||
							(isExtVideo(ext) && !contentType.includes('video'))
						)
							return reject(`contentType is invalid! ${contentType} ${url}`);
					}

					const writeStream = fs.createWriteStream(filePath, { autoClose: true });

					const timer = setTimeout(() => {
						writeStream.close();
						reject('downloadContentFromUrl timeout');
					}, TIMEOUT);

					const onError = e => {
						writeStream.close();
						fs.unlink(filePath, () => {});
						clearTimeout(timer);
						reject(e);
					};
					const onEnd = () => {
						clearTimeout(timer);
						resolve(filePath);
					};

					writeStream.on('error', onError);

					res.body.pipe(writeStream);
					res.body.on('error', onError);
					res.body.on('end', onEnd);
				})
		)
		.catch(e => {
			if (retry < MAX_RETRY) {
				return delay(500 * (retry + 1)).then(() =>
					downloadContentFromUrl({ url, filePath, options, retry: retry + 1 })
				);
			}

			logger.error(`downloadContentFromUrl error ${url} -> `, e);
			return Promise.reject(e);
		});
}

function isExtImage(ext) {
	const imageExt = ['.jpeg', '.jpg', '.png', '.gif', '.tiff', '.webp'];
	return imageExt.includes(ext);
}

function isExtVideo(ext) {
	const videoExt = ['.webm', '.mp4', '.m4p', '.m4v', '.flv'];
	return videoExt.includes(ext);
}

function isImage(file) {
	return file.mimetype.includes('image');
}

function isPdf(url) {
	if (typeof url !== 'string') return false;
	return url.match(/\.pdf$/i) !== null;
}

function getBase64FileType(base64) {
	if (!base64) return '';

	const type = base64.split(';')[0].split(':')[1];
	if (!type) return '';

	return { ext: mime.extension(type), type };
}

async function saveBase64File(base64, filePath, fileName) {
	const { ext } = getBase64FileType(base64);

	const bIndex = base64.indexOf('base64,');
	if (bIndex >= 0) {
		base64 = base64.substr(base64.indexOf('base64,') + 7);
	}

	filePath = await checkFolder(filePath);

	const dotExt = path.extname(fileName) ? '' : ext ? `.${ext}` : '';

	await fs.promises.writeFile(`${filePath}/${fileName}${dotExt}`, base64, 'base64');

	return {
		fileName: `${fileName}${dotExt}`,
		filePath,
	};
}

function getLocalUri(url) {
	if (!url) return;

	if (url.startsWith(URL_CONFIG.SERVER)) {
		return path.resolve(url.replace(`${URL_CONFIG.SERVER}${SERVER_CONFIG.STATIC.URI}`, SERVER_CONFIG.STATIC.PATH));
	}
	if (url.startsWith(URL_CONFIG.SERVER_DOC)) {
		return path.resolve(
			url.replace(`${URL_CONFIG.SERVER_DOC}${SERVER_CONFIG.STATIC.URI}`, SERVER_CONFIG.STATIC.PATH)
		);
	}
}

async function mergePDFs(pdfPaths, outputPath) {
	const merger = new PDFMerger();
	await pdfPaths.asyncForEach(async pdfPath => {
		await merger.add(pdfPath);
	});
	await removeFiles(pdfPaths);
	await merger.save(outputPath);
	return outputPath;
}

async function removeFiles(urls) {
	try {
		await Promise.all(urls.map(url => fs.promises.unlink(url)));
	} catch (err) {
		console.error(err);
	}
}

module.exports = {
	saveImages,
	checkFolder,
	isImage,
	hasExists,
	downloadContentFromUrl,
	getBase64FileType,
	saveBase64File,
	getLocalUri,
	isExtVideo,
	isExtImage,
	isPdf,
	mergePDFs,
};

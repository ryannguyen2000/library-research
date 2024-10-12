const fileUpload = require('express-fileupload');
const _ = require('lodash');
const moment = require('moment');
const { v4: uuid } = require('uuid');

const { UPLOAD_CONFIG } = require('@config/setting');
const { compressImage } = require('@utils/compress');
const { checkFolder } = require('@utils/file');
const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

const IMAGE_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/bmp',
	'image/tiff',
	'image/webp',
	'image/svg+xml',
	'image/x-icon',
	'image/vnd.microsoft.icon',
	'image/vnd.dwg',
	'image/vnd.dxf',
];

async function upload(req, res) {
	const files = _.flatten(_.values(req.files));
	if (files.length === 0) {
		throw new ThrowReturn('No files were uploaded!');
	}

	const fileDir = `${moment().format('YY/MM/DD')}/${req.params.path}`;
	const dpath = `${UPLOAD_CONFIG.PATH}/${fileDir}`;
	await checkFolder(dpath);

	const paths = [];

	const _resources = await files.asyncMap(async file => {
		let dirPath;
		let { mimetype, size: fileSize } = file;

		let fileName = decodeURIComponent(escape(_.split(file.name, '?')[0]));
		const isImageMimeType = IMAGE_MIME_TYPES.includes(mimetype);

		const compressed = isImageMimeType ? await compressImage(file, dpath, true) : null;

		if (compressed) {
			const { newName, metadata } = compressed;
			dirPath = `${fileDir}/${newName}`;
			mimetype = 'image/jpeg';

			paths.push(newName);
			return {
				_id: newName.split('.')[0],
				path: dirPath,
				originWidth: _.get(metadata, 'width'),
				originHeight: _.get(metadata, 'height'),
				originName: fileName,
				originSize: fileSize,
				mimetype,
			};
		}

		const _fileName = `${Date.now()}_${fileName}`;
		await file.mv(`${dpath}/${_fileName}`);
		paths.push(_fileName);

		return {
			_id: uuid(),
			path: `${fileDir}/${_fileName}`,
			originName: fileName,
			originSize: fileSize,
			mimetype,
			createdBy: req.decoded.user._id,
		};
	});

	const resources = await Promise.all(_resources.map(resource => models.ResourceUploading.create(resource)));
	res.sendData({ paths: paths.map(p => `${UPLOAD_CONFIG.URI}/${fileDir}/${p}`), resources });
}

router.postS('/:path', fileUpload(UPLOAD_CONFIG.OPTIONS), upload);

const activity = {
	UPLOAD: {
		key: '',
		method: 'POST',
	},
};

module.exports = { router, activity };

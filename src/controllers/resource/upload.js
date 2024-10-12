const moment = require('moment');

const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const mime = require('mime-types');

const { UPLOAD_CONFIG } = require('@config/setting');
const { checkFolder, downloadContentFromUrl } = require('@utils/file');
const models = require('@models');

async function getUploadFolder({ rootFolder, fileName }) {
	const mdate = moment();
	rootFolder = rootFolder || 'media';

	const folderPath = `${mdate.format('YY/MM/DD')}/${rootFolder}`;

	await checkFolder(`${UPLOAD_CONFIG.PATH}/${folderPath}`);

	const ext = path.extname(fileName);
	const baseFileName = `${path.basename(fileName, ext)}_${Date.now()}`;
	fileName = `${baseFileName}${ext}`;

	return {
		folderPath,
		fullPath: `${UPLOAD_CONFIG.PATH}/${folderPath}/${fileName}`,
		relativePath: `${folderPath}/${fileName}`,
		url: `${UPLOAD_CONFIG.FULL_URI}/${folderPath}/${fileName}`,
		baseFileName,
		fileName,
	};
}

async function uploadFileData(
	{ user, data, mimeType, rootFolder, fileName, blockIds, fileType, fileStatus, resourceName, fileUrl },
	isCreateResource = true
) {
	const ext = path.extname(fileName || (fileUrl ? fileUrl.split('?')[0] : ''));
	const mimetype = mimeType || mime.lookup(ext) || undefined;

	fileName = fileName || `${uuid()}${mimeType ? mime.extension(mimeType) : ext}`;

	const { fullPath, url, relativePath } = await getUploadFolder({ rootFolder, fileName });

	if (data) {
		await fs.promises.writeFile(fullPath, data, Buffer.isBuffer(data) ? 'binary' : 'base64');
	} else if (fileUrl) {
		await downloadContentFromUrl({ url: fileUrl, filePath: fullPath, validateFolder: false });
	}

	const createdBy = user ? user._id : undefined;

	const resource = await models.ResourceUploading.create({
		_id: uuid(),
		path: relativePath,
		originName: fileName,
		mimetype,
		createdBy,
	});

	let fileDoc = null;

	if (isCreateResource) {
		fileDoc = await models.ResourceFile.create({
			resource: resource._id,
			isFolder: false,
			createdBy,
			blockIds,
			fileType,
			fileStatus,
			name: {
				vi: resourceName || fileName,
			},
		});
	}

	return {
		fileDoc,
		resource,
		url,
	};
}

module.exports = {
	uploadFileData,
	getUploadFolder,
};

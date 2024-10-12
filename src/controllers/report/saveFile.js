const { v4: uuid } = require('uuid');
const moment = require('moment');
const _ = require('lodash');
const models = require('@models');
const { RESOURCE_FILE_TYPE } = require('@utils/const');
const { generatePdfPath } = require('@utils/puppeteer');
const { logger } = require('@utils/logger');
const { hasExists, checkFolder } = require('@utils/file');
const { UPLOAD_CONFIG } = require('@config/setting');

const { LOGO_HEADER_STICKY } = require('./const');

const FOLDER_NAME = '%REPORT_TYPE%';
const MONTH_FOLDER = '%MONTH%';
const YEAR_FOLDER = '%YEAR%';

async function createResourceUploadFile({ userId, originName, path }) {
	const source = await models.ResourceUploading.findOne({ path });
	if (!source) {
		const createdBy = userId || undefined;
		const resource = await models.ResourceUploading.create({
			_id: uuid(),
			path,
			originName,
			mimetype: 'application/pdf',
			createdBy,
		});
		return resource;
	}
	return source;
}

async function createResourceFile(params, iteration = 0) {
	const { resourceFolder, blockId, userId, fileName, resourceId, parent, from, language, reportType } = params;

	if (iteration >= 10) {
		console.log(' Stop recursion if error occurred or iteration limit reached ');
		return;
	}

	if (!resourceFolder) {
		const existingFile = await getFile({ fileName, isFolder: false, blockId, resourceId });
		if (!existingFile) {
			const file = await createFile({ fileName, isFolder: false, userId, resourceId, parent, blockId });
			return file;
		}
		return existingFile;
		// return existingFile;
	}
	const month = moment(from).format('M');
	const year = moment(from).format('YYYY');
	let resourceFolderName = _.get(resourceFolder, ['folderName', language]);
	if (resourceFolderName.includes(FOLDER_NAME))
		resourceFolderName = resourceFolderName.replaceAll(FOLDER_NAME, reportType);

	if (resourceFolderName.includes(YEAR_FOLDER)) resourceFolderName = resourceFolderName.replaceAll(YEAR_FOLDER, year);

	if (resourceFolderName.includes(MONTH_FOLDER))
		resourceFolderName = resourceFolderName.replaceAll(MONTH_FOLDER, month);

	const file =
		(await getFile({ fileName: resourceFolderName, parent, isFolder: true, blockId })) ||
		(await createFile({ userId, parent, blockId, fileName: resourceFolderName, isFolder: true }));

	return await createResourceFile(
		{
			...params,
			resourceFolder: resourceFolder.children,
			parent: file._id,
		},
		iteration + 1
	);
}

function getFile({ fileName, isFolder, blockId, parent, resourceId }) {
	return models.ResourceFile.findOne({
		blockIds: blockId,
		'name.vi': fileName,
		isFolder,
		deleted: false,
		resource: resourceId,
		parent,
	})
		.select('name.vi isFolder parent')
		.lean();
}

function createFile({ userId, resourceId, parent, blockId, fileName, isFolder }) {
	const createdBy = userId || undefined;
	return models.ResourceFile.create({
		resource: resourceId,
		isFolder,
		parent,
		createdBy,
		blockIds: [blockId],
		fileType: RESOURCE_FILE_TYPE.MANUAL,
		name: {
			vi: fileName,
		},
	});
}

async function generateTmpPdfPath(data, fileDir, fileName, options = {}) {
	const dpath = `${UPLOAD_CONFIG.OPTIONS.tempFileDir}/${fileDir}`;
	await checkFolder(dpath);

	const filePath = `${dpath}/${fileName}`;
	if (await hasExists(filePath)) {
		logger.warn('File is existed', fileName);
		return filePath;
	}

	const contentHtml = data.content
		? `<table style="width: 100%;"><thead><tr><td><div class="header-space"></div></td></tr></thead><tbody><tr class="break-page"><td><div class="page"><div class="category-name">${
				data.categoryName || ''
		  }</div>${
				data.content
		  }</div></td></tr></tbody><tfoot><tr><td><div class="footer-space"></div></td></tr></tfoot></table>`
		: '';

	const html = `<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&display=swap" rel="stylesheet"/><title>Charts.js</title></head><style>${
		data.style
	} body {font-family: 'Roboto', sans-serif;}</style><body>${options.script ? options.script : ''}${
		!options.disableHeader ? `<div class='header'><img src='${LOGO_HEADER_STICKY}'/></div>` : ''
	}<div class="footer"><div class="footer-item" style="background: #00597b">${
		data.blockName
	}</div><div style="background: #00838f" class="footer-item">${
		data.address
	}</div><div style="background: #ff8f00" class="footer-item">Hotline:(+84) 898 555 889</div><div style="background: #f47920" class="footer-item"></div></div>${
		data.introContent ? data.introContent : ''
	}${contentHtml}</body></html>`;

	await generatePdfPath(html, fileDir, fileName, {
		landscape: true,
		path: filePath,
		margin: {
			top: '2mm',
			bottom: '2.5mm',
			left: '2.5mm',
			right: '2.5mm',
		},
	});
	return filePath;
}

module.exports = { createResourceUploadFile, createResourceFile, generateTmpPdfPath };

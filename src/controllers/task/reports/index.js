const moment = require('moment');
const _ = require('lodash');
const { v4: uuid } = require('uuid');

const { generatePdfPath } = require('@utils/puppeteer');
const { RESOURCE_FILE_TYPE, REPORT_TEMPLATE_TYPES } = require('@utils/const');
const { UPLOAD_CONFIG } = require('@config/setting');
const { checkFolder } = require('@utils/file');
const { logger } = require('@utils/logger');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const getPCCCReport = require('./pccc');
const getTourismAccommodationReport = require('./tourismAccommodation');

const SEARCH_VALUE = '%TERM%';

function parseToStyleString(style) {
	if (!style) return '';
	return Object.entries(style)
		.map(([key, value]) => `${key}: ${value}`)
		.join('; ');
}

async function saveReportFile({ data, style, block, from, user, resourceFolder, fileDir, pathName, fileName }) {
	try {
		const html = await generateReportHtml(data, style);
		const dpath = `${UPLOAD_CONFIG.PATH}/${fileDir}`;
		const path = `${fileDir}/${pathName}`;

		await checkFolder(dpath);

		const url = await generatePdfPath(html, fileDir, pathName);
		const resource = await createResourceUploadFile({
			user,
			fileDir,
			originName: pathName,
			blockId: block._id,
			path,
		});

		await createResourceFile({
			resourceFolder,
			blockId: block._id,
			user,
			fileName,
			resourceId: resource._id,
			from,
		});
		return url;
	} catch (err) {
		logger.error(err);
		throw new ThrowReturn('Save report failed');
	}
}

async function createResourceFile(params) {
	const { resourceFolder, blockId, user, fileName, resourceId, parent, from } = params;
	if (!resourceFolder) {
		const existingFile = await getFile({ fileName, isFolder: false, blockId, resourceId });
		if (!existingFile) await createFile({ fileName, isFolder: false, user, resourceId, parent, blockId });
		return;
	}
	const term = moment(from).format('MM-Y');
	if (resourceFolder.folderName === SEARCH_VALUE)
		resourceFolder.folderName = resourceFolder.folderName.replaceAll(SEARCH_VALUE, term);

	const file =
		(await getFile({ fileName: resourceFolder.folderName, isFolder: true, blockId, parent })) ||
		(await createFile({ user, parent, blockId, fileName: resourceFolder.folderName, isFolder: true }));

	await createResourceFile({
		...params,
		resourceFolder: resourceFolder.children,
		parent: file._id,
	});
}

function getFile({ fileName, isFolder, blockId, resourceId, parent }) {
	return models.ResourceFile.findOne({
		blockIds: blockId,
		'name.vi': fileName,
		isFolder,
		deleted: false,
		resource: resourceId,
		parent,
	})
		.select('name.vi isFolder')
		.lean();
}

function createFile({ user, resourceId, parent, blockId, fileName, isFolder }) {
	const createdBy = user ? user._id : undefined;
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

async function createResourceUploadFile({ user, originName, path }) {
	const source = await models.ResourceUploading.findOne({ path });
	if (!source) {
		const createdBy = user ? user._id : undefined;
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

async function generateReportHtml(data, style) {
	const html = `<!DOCTYPE html>
	<html lang="en">
	<head>
		<title></title>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<link href="https://fonts.cdnfonts.com/css/times-new-roman" rel="stylesheet">
		${style}
	</head>
	<body>
        ${renderContent(data)}
	</body>
	</html>`;
	return html;
}

function renderContent(data) {
	return _.map(data, ({ text, body, style }) => {
		const styleString = parseToStyleString(style);
		return `<div style="${styleString}">${text}
		${body ? renderBody(body) : ''}
		</div>`;
	}).join('');
}

function renderBody(data) {
	return _.map(data, ({ text, style, body, attachments }) => {
		const styleString = parseToStyleString(style);
		return `<div style="${styleString}">
		${text}
		${body ? renderBody(body) : ''}
			<div class="attachment-container" style="${attachments && attachments.length < 3 ? 'justify-content: center' : ''}">
				<div class="attachments" >
					${_.map(attachments, attachment => {
						return `<div class="attachment">
						 <img src="${attachment}" />
						 		</div>`;
					}).join('')}
				</div>
			</div>
		 </div>`;
	}).join('');
}

async function getReportTemplate({ id, from, to, blockId, block, user, exportDate, forceCompress }) {
	const { type } = await models.ReportTemplate.findById(id).select('type').lean();
	if (!type) throw new ThrowReturn('report type does not exist');

	let report;
	switch (type) {
		case REPORT_TEMPLATE_TYPES.PCCC: {
			report = await getPCCCReport({ id, from, to, blockId, block, user, exportDate, forceCompress });
			break;
		}
		case REPORT_TEMPLATE_TYPES.TOURISM_ACCOMMODATION: {
			report = await getTourismAccommodationReport({
				id,
				from,
				to,
				blockId,
				block,
				user,
				exportDate,
			});
			break;
		}
		default:
			break;
	}
	if (!report) throw new ThrowReturn(`Report type ${type} does not suppoted`);

	const url = await saveReportFile({
		block,
		from,
		user,
		...report,
	});

	return { url };
}

module.exports = { getReportTemplate };

const moment = require('moment');
const { logger } = require('@utils/logger');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const Task = require('@controllers/task');
const { isImageUrl } = require('@utils/func');
const { TaskStatus } = require('@utils/const');
const { mergePDFs } = require('@utils/file');
const { UPLOAD_CONFIG } = require('@config/setting');

const { LOGO_TASK, TASK_COLUMNS } = require('../const');
const { groupItems } = require('../helper');
const { getTableHeadersTemplate, getTableRowsTemplate } = require('./table');
const { QUALITY_CONTROL_STYLE, GLOBAL_STYLE, TABLE_REPORT_STYLE, TAG_STYLE } = require('../style');

const { OPERATION_REPORT_CATEGORIES } = require('../const');
const { generateTmpPdfPath } = require('../saveFile');

const LIMIT = 108;

async function qualityControlReportPath(params, start = 0) {
	const { from, to, language, user, blockId, fileDir, categoryName, blockName, address } = params;
	let allTasks = [];

	const cardPdfFiles = [];
	const tablePdfFiles = [];

	const fileName = `${OPERATION_REPORT_CATEGORIES.QUALITY_CONTROL.key}-%PART%.pdf`;
	const outputPath = `${UPLOAD_CONFIG.OPTIONS.tempFileDir}/${fileDir}/${OPERATION_REPORT_CATEGORIES.QUALITY_CONTROL.key}.pdf`;

	try {
		while (true) {
			const taskQuery = {
				blockId,
				compressImage: true,
				status: _.values(TaskStatus)
					.filter(status => status !== TaskStatus.Expired && status !== TaskStatus.Deleted)
					.join(','),
				sort: 'time',
				order: 'asc',
				from: from ? `${from}T00:00:00` : undefined,
				to: to ? `${to}T23:59:00` : undefined,
				start,
				limit: LIMIT,
			};
			const { tasks, total } = await Task.getTasks(taskQuery, user, language);
			if (_.isEmpty(tasks)) {
				break;
			}
			allTasks = [...allTasks, ...tasks];

			const cardViewFile = fileName.replace('%PART%', `card-view-p${start / LIMIT + 1}`);
			const tableViewFile = fileName.replace('%PART%', `table-view-p${start / LIMIT + 1}`);
			const htmlCardContents = getCardView(tasks, 6);
			const htmlTableContents = getTableViewHtml(getTableBody(tasks), language);

			const cardFilePartPath = await generateTmpPdfPath(
				{
					content: htmlCardContents,
					categoryName,
					blockName,
					address,
					style: [QUALITY_CONTROL_STYLE, GLOBAL_STYLE].join(''),
				},
				fileDir,
				cardViewFile
			);
			const tableFilePartPath = await generateTmpPdfPath(
				{
					content: htmlTableContents,
					categoryName,
					blockName,
					address,
					style: [TABLE_REPORT_STYLE, GLOBAL_STYLE, TAG_STYLE].join(''),
				},
				fileDir,
				tableViewFile
			);
			cardPdfFiles.push(cardFilePartPath);
			tablePdfFiles.push(tableFilePartPath);

			if (tasks.length < LIMIT || allTasks.length >= total) {
				break;
			}
			start += LIMIT;
		}
		const totalFiles = [...cardPdfFiles, ...tablePdfFiles];
		if (!_.isEmpty(totalFiles)) {
			await mergePDFs(totalFiles, outputPath);
			return outputPath;
		}
		return null;
	} catch (err) {
		logger.error(err);
		throw new ThrowReturn('Get Task Failed');
	}
}

function getCardView(data, size) {
	const chunks = groupItems(data, size);
	const tableRows = chunks
		.map(tasks => {
			const tableData = tasks
				.map(task => {
					const images = task.attachments && task.attachments.filter(item => isImageUrl(item));
					const img = _.head(images);
					const name = _.get(task.assigned, '[0].name') || '';
					const status = _.get(task, 'status') === 'done' ? 'Hoàn thành' : '';
					const time = task.ownerTime
						? moment(task.ownerTime).format('HH:mm DD-MM-YYYY')
						: moment(task.time).utcOffset(0).format('HH:mm DD-MM-YYYY');
					const source = _.get(task, 'source');
					const renderBoxImage = img
						? `<div class="box-header-img"><img alt="none" src='${img}' /></div>`
						: `<div class="box-header-placeholder"><img alt="none" style="width: 60px" src=${LOGO_TASK} /></div>`;

					const roomNo = _.get(task, 'roomIds[0].info.roomNo');
					const renderRoomNo = roomNo ? `<span class="text-bold">${roomNo} - </span>` : '';
					const description = _.get(task, 'description') || _.get(task, 'category.name') || '';
					return `<td>
						<div class="box">
							<div class="box-header">${renderBoxImage}</div>
							<div class="box-body">
								<div style="margin: 0">${name}</div>
								<div class="d-flex justify-between text-secondary">
									<div>${time}</div>
									<div class="text-bold">${status}</div>
								</div>
								<div>
									<span>Kênh báo:</span>
									<span class="text-primary text-bold">${source}</span>
								</div>
								<div class="description">${renderRoomNo} ${description}</div>
							</div>
						</div>
					</td>`;
				})
				.join('');
			return `<tr>${tableData}</tr>`;
		})
		.join('');

	return `<table class="table-quality-control">
		<thead>
			<tr>
				<td>
					<div class="table-quality-control-header"></div>
				</td>
			</tr>
		</thead>
		<tbody>
			${tableRows}
		</tbody>
		<tfoot>
			<tr></tr>
		</tfoot>
	</table>`;
}

const getTableViewHtml = (tableBody, language) => {
	const tableHeaders = getTableHeadersTemplate(TASK_COLUMNS, [], language);
	return `
		<table class="table-wrapper table-report">
			<thead>
				<tr>
					${tableHeaders}
				</tr>
			</thead>
			<tbody>
				${tableBody}
			</tbody>
			<tfoot>
				<tr>
					<td>
						<div></div>
					</td>
				</tr>
			</tfoot>
	</table>`;
};

function getTableBody(data) {
	const tableBody = getTableRowsTemplate(data, TASK_COLUMNS, [], { showStt: false });
	return tableBody;
}

module.exports = { qualityControlReportPath };

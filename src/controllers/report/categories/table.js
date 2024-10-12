const moment = require('moment');
const _ = require('lodash');

// const ThrowReturn = require('@core/throwreturn');

const { TaskStatus } = require('@utils/const');

const { formatPrice } = require('@utils/func');

const {
	FORMAT_CELL,
	CHECBOX_SVG,
	SERVICES,
	// OTAS_ICON,
	STAR_ICON,
} = require('../const');

function getTableHeadersTemplate(columns, hiddenColumns, language) {
	const results = [];

	_.forEach(columns, column => {
		if (_.some(hiddenColumns, col => col === column.dataIndex)) return;
		let headerTemplate = `<th style="width: %WIDTH%; background: #404040 !important; color: #fff; padding: 0px 5px !important; height: 30px; border-right: 1px solid #f0f0f0 !important;" class="table-report-cell %ALIGN%">%TITLE%</th>`;
		headerTemplate = headerTemplate.replaceAll('%WIDTH%', column.width || '');
		headerTemplate = headerTemplate.replaceAll('%ALIGN%', column.align || '');
		headerTemplate = headerTemplate.replaceAll('%TITLE%', _.get(column, ['title', language]) || '');
		results.push(headerTemplate);
	}).join('');

	return results.join('');
}

let convertStype = (item, rowClass) => {
	const background = _.get(item, 'background');
	const bold = rowClass || _.get(item, 'bold');
	const style = `background-color: ${background}; ${bold ? 'font-weight: bold' : 'font-weight: 400 !important'}`;
	return style;
};

function getTableRowsTemplate(data, columns, hiddenColumns, options = {}) {
	const results = [];
	const { showStt, striped } = options;
	_.forEach(data, (item, index) => {
		const style = convertStype(_.get(item, 'style'), _.get(item, 'rowClass'));
		let rowTemplate = `<tr style='${style}' class="%CLASS% table-report-row">%BODY%</tr>`;

		if (striped && index % 2) {
			rowTemplate = rowTemplate.replaceAll('%CLASS%', 'bg-grey');
		}

		const cells = _.map(columns, column => {
			if (_.some(hiddenColumns, col => col === column.dataIndex)) return;
			const numberDesciption = _.split(_.get(item, 'description'), ' ')[0];
			return getTableCellTemplate(
				!showStt
					? {
							...item,
							name: `${_.get(item, 'name')}  <sup style="font-size: smaller;">${numberDesciption}</sup>`,
					  }
					: { ...item, index: index + 1 },
				column
			);
		});

		rowTemplate = rowTemplate.replaceAll('%CLASS%', item.rowClass || '');
		rowTemplate = rowTemplate.replaceAll('%BODY%', cells.join(''));

		results.push(rowTemplate);

		if (item.children && !_.isEmpty(item.children)) {
			const childrenRows = getTableRowsTemplate(item.children, columns);
			results.push(childrenRows);
		}
	});
	return results.join('');
}

function getTableCellTemplate(data, column) {
	let cell = `<td colspan="%COL_SPAN%" class="%CELL_CLASS% %ALIGN_CLASS% table-report-cell">%TABLE_DATA%</td>`;
	let TABLE_DATA = '';

	if (_.get(data, '_doc') && column.dataIndex !== 'index') {
		TABLE_DATA = Array.isArray(column.dataIndex)
			? _.get(data, ['_doc', ...column.dataIndex])
			: _.get(data, ['_doc', column.dataIndex]);
	} else {
		TABLE_DATA = _.get(data, column.dataIndex);
	}

	if (column.format === FORMAT_CELL.PRICE) TABLE_DATA = formatPrice(TABLE_DATA) || '0';
	if (column.format === FORMAT_CELL.SERVICE_TYPE) {
		const serviceType = _.values(SERVICES).find(item => item.value === TABLE_DATA);
		TABLE_DATA = serviceType ? serviceType.label : '';
	}
	if (column.format === FORMAT_CELL.DATE) TABLE_DATA = TABLE_DATA ? moment(TABLE_DATA).format('DD/MM/yyyy') : '';
	if (column.format === FORMAT_CELL.CHECK_BOX) TABLE_DATA = TABLE_DATA ? CHECBOX_SVG : '';
	if (column.format === FORMAT_CELL.TAG) TABLE_DATA = TABLE_DATA ? renderTag(TABLE_DATA) : '';
	if (column.format === FORMAT_CELL.ASSIGN) TABLE_DATA = TABLE_DATA ? renderAssign(TABLE_DATA) : '';
	if (column.format === FORMAT_CELL.OTA_ICON) TABLE_DATA = TABLE_DATA ? _.upperCase(TABLE_DATA) : '';
	if (column.format === FORMAT_CELL.RATING_REVIEW)
		TABLE_DATA = TABLE_DATA ? renderRatingReview(TABLE_DATA, _.get(data, 'highestStar')) : '';
	if (column.format === FORMAT_CELL.RATING_AVR)
		TABLE_DATA = TABLE_DATA ? renderRatingAvr(TABLE_DATA, _.get(data, 'highestStar')) : '';
	if (column.format === FORMAT_CELL.ROOMS) {
		TABLE_DATA = _.map(TABLE_DATA, item => _.get(item, 'info.roomNo')).join(',');
	}

	const COL_SPAN = column.colSpan || '';
	const CELL_CLASS = column.cellClass || '';
	const ALIGN_CLASS = column.align ? `text-${column.align}` : '';

	cell = cell.replaceAll('%COL_SPAN%', COL_SPAN);
	cell = cell.replaceAll('%CELL_CLASS%', CELL_CLASS);
	cell = cell.replaceAll('%ALIGN_CLASS%', ALIGN_CLASS);
	cell = cell.replaceAll('%TABLE_DATA%', TABLE_DATA);

	return cell;
}

function renderTag(data) {
	let text = '';
	if (data === TaskStatus.Waiting) text = 'Đang chờ';
	if (data === TaskStatus.Checked) text = 'Đã kiểm';
	if (data === TaskStatus.Confirmed) text = 'Đã xác nhận';
	if (data === TaskStatus.Done) text = 'Đã hoàn thành';
	return `<span class="tag tag-${data}">${text}</span>`;
}

function renderAssign(data) {
	return `<span>${data ? data.map(u => u.name).join(', ') : ''}</span>`;
}

// function renderOtaIcon(data) {
// 	return `<div class="d-flex justify-center" style="width: 100%">
// 		<div style="width: 30px; height: 30px;">${OTAS_ICON[data] || data}</div>
// 	</div> `;
// }

function renderRatingAvr(data, highestStar) {
	return `<div class="d-flex justify-center items-center"><span>${STAR_ICON}</span> ${
		Number.isInteger(data) ? data : data.toFixed(1)
	} / <span style="font-size: 10px;color: #797979">${highestStar}</span></div> `;
}

function renderRatingReview(data, highestStar) {
	return `<div class="d-flex justify-center items-center">${
		Number.isInteger(data) ? data : data.toFixed(1)
	} / <span style="font-size: 10px;color: #797979">${highestStar}</span></div> `;
}

module.exports = { getTableHeadersTemplate, getTableRowsTemplate };

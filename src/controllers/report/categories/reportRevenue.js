const moment = require('moment');
const _ = require('lodash');

// const ThrowReturn = require('@core/throwreturn');
// const { UPLOAD_CONFIG } = require('@config/setting');

const {
	FORMAT_CELL,
	REPORT_TYPES,
	REVENUES_COLUMNS,
	OVERVIEW_COLUMNS,
	FOOTER_BOOKING_REVENUE_COLUMNS,
	COST_DETAIL,
	TEXT,
	REPORT_CATEGORIES,
	OPERATION_REPORT_CATEGORIES,
} = require('../const');
const { generateTmpPdfPath } = require('../saveFile');
const { TABLE_REPORT_STYLE, GLOBAL_STYLE } = require('../style');

const { getTableHeadersTemplate, getTableRowsTemplate } = require('./table');
const { replaceMultiple, getOverviewChildren } = require('../helper');

async function revenueReportTmpPath(params) {
	const { categoryName, data, language, fileDir, blockName, address } = params;

	const hasTax = _.get(data, 'block.manageFee.hasTax');
	const isSonataReport = _.get(data, 'reportType') === 'sonata';

	const fileName = `${OPERATION_REPORT_CATEGORIES.REVENUE_REPORT.key}.pdf`;

	const result = [];
	const { overview, fee } = data;
	const reportTypes = _.values(REPORT_TYPES);
	await reportTypes.asyncForEach(async report => {
		const reportName = _.get(report, ['name', language], '');
		const footerText = _.get(report, ['footerText', language], '');
		switch (report.type) {
			case REPORT_TYPES.REVENUE_EXPENSE.type: {
				let reportTableTemplate = revenueReportTmpPathTemplateHtml();
				const overviewData = getOverviewChildren(overview);
				let footerRevenueExprense = _.get(report.footerText, [language], '');

				footerRevenueExprense = footerRevenueExprense.replaceAll('%DAY%', moment().format('DD'));
				footerRevenueExprense = footerRevenueExprense.replaceAll('%MONTH%', moment().format('MM'));
				footerRevenueExprense = footerRevenueExprense.replaceAll('%YEAR%', moment().format('Y'));
				const NOTES = getReportNotesRevenueTemplateHtml(overviewData);

				const TABLE_HEADER = getTableHeadersTemplate(OVERVIEW_COLUMNS, [], language);
				const TABLE_BODY = getTableRowsTemplate(overviewData, OVERVIEW_COLUMNS);
				const TABLE_FOOTER = `<tr class="table-report-row ">
					<td class="table-report-cell" colspan="5">
						<div class="w-100 text-right">${footerRevenueExprense}</div>
						<div class="w-100">
							${NOTES}
						</div>
					</td>
				</tr>
				`;

				const textCategory = REPORT_CATEGORIES.OVERVIEW[language];
				const html = getCategoryRevenueTemplateHtml({
					reportTableTemplate,
					textCategory,
					reportName,
					TABLE_HEADER,
					TABLE_BODY,
					FOOTER: TABLE_FOOTER,
				});

				result.push(html);
				break;
			}
			case REPORT_TYPES.BOOKING_REVENUE.type: {
				let reportTableTemplate = revenueReportTmpPathTemplateHtml();
				const isRevenue = report.reportDataType === REPORT_TYPES.BOOKING_REVENUE.reportDataType;
				// const isGenerated = report.reportDataType === REPORT_TYPES.BOOKING_REVENUE_GENERATED.reportDataType;
				const isOther = report.reportDataType === REPORT_TYPES.BOOKING_REVENUE_OTHER.reportDataType;
				const isGroundRent = report.reportDataType === REPORT_TYPES.BOOKING_REVENUE_GROUND_RENT.reportDataType;
				const reportData = _.get(data, report.dataKey);

				const notRendersColumns = _.compact([
					isRevenue && 'description',
					!hasTax && 'revenueForTax',
					!hasTax && 'tax',
					!hasTax && 'totalRevenueForTax',
					!hasTax && 'totalTax',
					// !isRevenue && 'OTAFee',
					// !isRevenue && 'totalOtaAndFee',
					// !isRevenue && 'commission_ota',
					// !isRevenue && 'total_ota_fees_and_payment_fees',
					// !isRevenue && 'totalTransactionAndOTAFee',
					// !isRevenue && 'totalOTAFee',
					isRevenue && 'none',
				]);

				const isNotRenderReport =
					!reportData ||
					_.isEmpty(_.get(reportData, 'data')) ||
					(!isSonataReport && (isOther || isGroundRent));

				const TABLE_HEADER = getTableHeadersTemplate(REVENUES_COLUMNS, notRendersColumns, language);
				const TABLE_BODY = getTableRowsTemplate(
					_.get(reportData, 'data'),
					REVENUES_COLUMNS,
					notRendersColumns,
					{
						showStt: true,
						striped: true,
					}
				);

				const footerData = _.compact([
					{
						text: footerText,
						...reportData,
						commAndTransFee: _.get(reportData, 'totalCommAndTransFee'),
					},
					{
						text: 'TỔNG CỘNG',
						...data.revenue,
					},
				]);

				const footer = FOOTER_BOOKING_REVENUE_COLUMNS.map(item => ({
					...item,
					colSpan: item.colSpan ? (isRevenue ? 9 : 10) : '',
				}));

				const TABLE_FOOTER = getTableRowsTemplate(footerData, footer, notRendersColumns);
				if (!isNotRenderReport) {
					const textCategory = REPORT_CATEGORIES.INCOME_LIST[language];
					const html = getCategoryRevenueTemplateHtml({
						reportTableTemplate,
						textCategory,
						reportName,
						TABLE_HEADER,
						TABLE_BODY,
						FOOTER: TABLE_FOOTER,
					});
					result.push(html);
					break;
				}
				break;
			}
			case REPORT_TYPES.COST_DETAIL.type: {
				let reportTableTemplate = revenueReportTmpPathTemplateHtml();
				const feeData = _.get(fee, 'data');
				const TABLE_HEADER = getTableHeadersTemplate(COST_DETAIL, [], language);
				const TABLE_BODY = getTableRowsTemplate(feeData, COST_DETAIL, false, {
					showStt: true,
				});

				const FOOTER = getTableRowsTemplate(
					[{ text: TEXT.TOTAL[language], total: fee.total }],
					[
						{
							dataIndex: 'text',
							align: 'right',
							colSpan: 3,
						},
						{
							dataIndex: 'total',
							align: 'right',
							format: FORMAT_CELL.PRICE,
						},
					]
				);
				const textCategory = REPORT_CATEGORIES.COST_LIST[language];
				const html = getCategoryRevenueTemplateHtml({
					reportTableTemplate,
					textCategory,
					reportName,
					TABLE_HEADER,
					TABLE_BODY,
					FOOTER,
				});

				result.push(html);
				break;
			}
			default:
				break;
		}
	});

	const html = `<div class="page"><table class="table-wrapper"><thead><tr><td><div></div></td></tr></thead><tbody><tr><td>${result.join(
		''
	)}</td></tr><tr><td><div class="d-flex signature"><h4>Người lập</h4><h4>Kế toán</h4><h4>Giám đốc</h4><h4>Chủ nhà</h4></div></td></tr></tbody><tfoot><tr><td></td></tr></tfoot></table></div>`;
	const tmpPath = await generateTmpPdfPath(
		{
			content: html,
			categoryName,
			blockName,
			address,
			style: [TABLE_REPORT_STYLE, GLOBAL_STYLE].join(''),
		},
		fileDir,
		fileName
	);

	return tmpPath;
}

function getCategoryRevenueTemplateHtml({
	reportTableTemplate,
	reportName,
	TABLE_HEADER,
	TABLE_BODY,
	FOOTER,
	textCategory,
}) {
	const replace = replaceMultiple(reportTableTemplate, [
		{ search: '%REPORT_NAME%', replaceValue: reportName },
		{ search: '%TABLE_HEADER%', replaceValue: TABLE_HEADER },
		{ search: '%TABLE_BODY%', replaceValue: TABLE_BODY },
		{ search: '%TABLE_FOOTER%', replaceValue: FOOTER },
	]);
	const resultHtml = `<div class="w-100">
							<div class="table-category-name">${textCategory}</div>
							${replace}
						</div>`;

	return resultHtml;
}

function revenueReportTmpPathTemplateHtml() {
	return ` <div class="table-report-name">%REPORT_NAME%</div>
		<table class="table-wrapper table-report">
			<thead>
				<tr>
					%TABLE_HEADER%
				</tr>
			</thead>
			<tbody>
				%TABLE_BODY%
				%TABLE_FOOTER%
			</tbody>
			<tfoot>
				<tr>
					<td>
						<div></div>
					</td>
				</tr>
			</tfoot>
		</table>`;
}

function getReportNotesRevenueTemplateHtml(params) {
	const notes = _.reduce(
		params,
		(acc, item) => {
			if (item && item.description) {
				acc.push({ key: item.key, description: item.description });
			}
			if (item && item.data) {
				_.forEach(item.data, subItem => {
					if (subItem.description) {
						acc.push({ key: item.key, description: subItem.description });
					}
				});
			}
			return acc;
		},
		[]
	);

	const html = !_.isEmpty(notes)
		? `<div class="w-100">
				<div style="font-weight: bold;" class="header-notes">GHI CHÚ:</div>
				<div class="content-notes">
					${_.map(notes, n => {
						const parts = _.split(_.get(n, 'description'), ' ', 2);
						const x = parts[0];
						const y = _.get(n, 'description').substring(_.get(n, 'description').indexOf(' ') + 1);

						return `<div style="padding: 5px 0px;">
									<sup style="font-size: xx-small; vertical-align: super; font-weight: bold;">
										${x}
									</sup>
									${y}
								</div>`;
					}).join('')}
				</div>
			</div>`
		: '';
	return html;
}

module.exports = { revenueReportTmpPath, getReportNotesRevenueTemplateHtml };

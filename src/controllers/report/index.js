const moment = require('moment');
const _ = require('lodash');

const { UPLOAD_CONFIG } = require('@config/setting');
const { logger } = require('@utils/logger');
const { checkFolder, mergePDFs } = require('@utils/file');
const { PayoutAutoTypes } = require('@utils/const');
// const { generatePdfPath } = require('@utils/puppeteer');
const { runWorker } = require('@workers/index');
const { REPORT_CALCULATOR } = require('@workers/const');
const models = require('@models');
const paymentAutoUtils = require('@controllers/finance/auto/utils');
const { generateTmpPdfPath } = require('./saveFile');

const { createResourceUploadFile, createResourceFile } = require('./saveFile');
const { revenueReportTmpPath } = require('./categories/reportRevenue');
const { performanceTmpPath } = require('./categories/performance');
const { qualityControlReportPath } = require('./categories/quality_control');
const { invoiceTmpPath } = require('./categories/invoice');
const { taskStatsTmpPath } = require('./categories/task_statistic');
const { customerReviewTmpPath } = require('./categories/customer_review');

const {
	RESOUCRE_DIRECTORY_TEMPLATE,
	LOGO_INTRO_PAGE,
	LOGO_HEADER_STICKY,
	OPERATION_REPORT_CATEGORIES,
	REPORT_TYPE,
	TEXT,
} = require('./const');

const { GLOBAL_STYLE, INTRO_PAGE_STYLE } = require('./style');

function getRevenueAmount(data) {
	if (data.version === 2) {
		const lastOvv = _.last(data.overview);
		const amount = _.get(_.last(lastOvv.data), 'total') || lastOvv.total;

		return amount || 0;
	}

	const amount = _.get(data.overview, 'payment.data.tb.total');
	return amount ? -amount : 0;
}

async function createAutoPayout({ data, block, period }) {
	try {
		const amount = getRevenueAmount(data);
		if (!amount) return;

		const auto = await models.PayoutAuto.findOne({ type: PayoutAutoTypes.REVENUE_SHARE, blockIds: block._id });
		if (!auto) return;

		const pay = auto.payouts.find(p => _.toString(p.blockId) === _.toString(block._id));
		if (!auto) return;

		const blockName = _.get(block, 'info.name');

		const description = `${pay.description || auto.name} ${moment(period).format('MM.YYYY')} ${blockName}`;

		const payouts = await paymentAutoUtils.findOrCreatePayout({
			amount,
			categoryId: pay.categoryId,
			description,
			payAccountId: pay.payAccountId,
			payDebitAccountId: pay.payDebitAccountId,
			payDescription: description,
			auto,
			period: moment(period).add(1, 'month').format('Y-MM'),
			blockId: block._id,
		});

		let report;

		if (payouts.length && auto.isCreateReport) {
			report = await paymentAutoUtils.findOrCreateReport({
				payouts,
				blockId: block._id,
				auto,
				mtime: moment(period),
			});
		}

		if (report && auto.isCreatePayRequest) {
			await paymentAutoUtils.findOrCreatePayRequest({
				payouts,
				description,
				auto,
			});
		}
	} catch (e) {
		logger.error('createAutoPayout Reveune', block._id, period, e);
	}
}

async function saveOperationReport(params) {
	const { block, blockId, from, to, userId, language, task, period } = params;

	// const period = moment(params.from).format('Y-MM');
	const type = _.find(REPORT_TYPE, reportType => reportType.key === _.get(task, 'type'));
	const reportName = _.get(type, ['name', language]);
	const reportShortName = _.get(type, 'shortName', '');

	const data = await runWorker({
		type: REPORT_CALCULATOR,
		data: {
			blockId: blockId.toString(),
			from,
			to,
			userId: userId.toString(),
			language,
		},
	});

	const blockName = _.get(block, 'info.name');
	const address = _.get(block, 'info.address');
	const blockFileName = blockName.split(' ').join('-').toLowerCase();
	const version = task.version ? `-v${task.version}` : '';
	const fileDir = `report/operation/${moment(from).format('YY/MM/DD')}/${blockFileName}`;
	const fileName = `${_.toUpper(reportShortName)}-${blockName.split(' ').join('-')}-${period}${version}.pdf`;
	const pathName = `${reportShortName}-${blockFileName}-${period}${version}.pdf`;
	const dpath = `${UPLOAD_CONFIG.PATH}/${fileDir}`;

	await checkFolder(dpath);

	const url = await generateReportPath({
		...params,
		data,
		operationReportCategories: task.operationReportCategories,
		fileDir,
		pathName,
		blockName,
		address,
		period: moment(from).format('MM-Y'),
		reportName,
		language,
	});

	const resource = await createResourceUploadFile({
		userId,
		fileDir,
		originName: pathName,
		blockId,
		path: `${fileDir}/${pathName}`,
	});

	const resourceFile = await createResourceFile({
		resourceFolder: RESOUCRE_DIRECTORY_TEMPLATE,
		blockId,
		userId,
		fileName,
		resourceId: resource._id,
		from,
		language,
		reportType: _.toUpper(reportName),
	});

	await createAutoPayout({
		data,
		block,
		period,
	});

	return { url, resourceId: resourceFile._id, name: reportName };
}

async function generateReportPath({ operationReportCategories, data, ...params }) {
	const outputPath = `${UPLOAD_CONFIG.PATH}/${params.fileDir}/${params.pathName}`;
	const tmpIntroFilePath = await printIntroPage({ ...params, operationReportCategories });
	const tmpPaths = [tmpIntroFilePath];
	let stt = 0;

	if (!operationReportCategories || _.isEmpty(operationReportCategories)) {
		logger.info('Category is empty');
	}

	await operationReportCategories.asyncForEach(async key => {
		const category = _.values(OPERATION_REPORT_CATEGORIES).find(item => {
			return item.key === key;
		});
		if (!category) return;

		stt += 1;
		const categoryName = `${stt}. ${_.get(category, ['name', params.language], '')}`;

		if (category.key === OPERATION_REPORT_CATEGORIES.REVENUE_REPORT.key) {
			const tmpPath = await revenueReportTmpPath({ ...params, categoryName, data });
			tmpPaths.push(tmpPath);
			return;
		}
		if (category.key === OPERATION_REPORT_CATEGORIES.PERFORMANCE.key) {
			const tmpPath = await performanceTmpPath({ ...params, categoryName, data });
			if (tmpPath) tmpPaths.push(tmpPath);
			return;
		}
		if (category.key === OPERATION_REPORT_CATEGORIES.TASK_STATISTIC.key) {
			const tmpPath = await taskStatsTmpPath({ ...params, categoryName, data });
			if (tmpPath) tmpPaths.push(tmpPath);
			return;
		}
		if (category.key === OPERATION_REPORT_CATEGORIES.QUALITY_CONTROL.key) {
			const tmpPath = await qualityControlReportPath({ ...params, categoryName, data });
			if (tmpPath) tmpPaths.push(tmpPath);
			return;
		}
		if (category.key === OPERATION_REPORT_CATEGORIES.INVOICE.key) {
			const tmpPath = await invoiceTmpPath({ ...params, categoryName, data });
			if (tmpPath) tmpPaths.push(tmpPath);
		}
		if (category.key === OPERATION_REPORT_CATEGORIES.CUSTOMER_REVIEW.key) {
			const tmpPath = await customerReviewTmpPath({ ...params, categoryName, data });
			if (tmpPath) tmpPaths.push(tmpPath);
		}
	});
	await mergePDFs(tmpPaths, outputPath);
	return `${UPLOAD_CONFIG.FULL_URI_DOC}/${params.fileDir}/${params.pathName}`;
}

async function printIntroPage(params) {
	const { period, reportName, language, fileDir, blockName, operationReportCategories, address } = params;
	const monthText = TEXT.MONTH[language] || '';

	let stt = 0;
	const categoriesPageHtml = `<div>
	<div class='header'>
		<img src='${LOGO_HEADER_STICKY}' />
	</div>
	<div class="text-bold" style="font-size: 45px;">${blockName}</div>
	${_.map(operationReportCategories, key => {
		const category = _.values(OPERATION_REPORT_CATEGORIES).find(item => {
			return item.key === key;
		});
		if (!category) return;
		stt += 1;
		return `
			<div class="text-bold category-item d-flex items-center">
				<div>${stt}</div>
				<div class="devider"></div>
				<div>${_.get(category, ['name', language], '')}</div>
			</div>
		`;
	}).join('')}
	</div>`;

	const tmpIntroFilePath = await generateTmpPdfPath(
		{
			content: '',
			introContent: `<div class="page intro-page"><div class="logo"><img alt="" class="h-100 intro-logo" src="${LOGO_INTRO_PAGE}" /></div><div class="title text-bold report-name">${reportName ? _.toUpper(reportName) : ''
				}</div><div class="title text-bold date">${monthText} ${period}</div></div><table class="table-wrapper"><thead><tr><td><div class="header-space" style="height: 40px"></div></td></tr></thead><tbody><tr class="break-page"><td class="page">${categoriesPageHtml}</td></tr></tbody><tfoot><tr><td><div class="footer-space"></div></td></tr></tfoot></table>`,
			style: [INTRO_PAGE_STYLE, GLOBAL_STYLE].join(''),
			blockName,
			address,
		},
		fileDir,
		'intro-page.pdf',
		{ disableHeader: true }
	);
	return tmpIntroFilePath;
}

module.exports = { saveOperationReport };

const path = require('path');
const { logger } = require('@utils/logger');
const _ = require('lodash');
const moment = require('moment');
const fs = require('fs');

const { getLocalUri, isPdf } = require('@utils/file');
const { generateImagePath } = require('@utils/puppeteer');
const { UPLOAD_CONFIG } = require('@config/setting');
const { mergePDFs } = require('@utils/file');

const models = require('@models');
const { GLOBAL_STYLE, INVOICE_STYLE } = require('../style');
const { OPERATION_REPORT_CATEGORIES } = require('../const');
const { generateTmpPdfPath } = require('../saveFile');
const { groupItems } = require('../helper');

const PDF_PRINT_OPTIONS = {
	QUALITY: 10,
	SCALE: 1.5,
};
const MAX_FILE_SIZE = 5;
const SELECTOR_ROOT = 'pdf-container';

function getInvoiceTemplateHtml(data, description, size) {
	const chunks = groupItems(data, size);
	const tableRows = chunks
		.map(attachments => {
			const attachmentData = attachments
				.map(src => {
					return `<td>
						<div class="w-100 d-flex justify-center">
							<div class="invoice-attachment">
								<img
									class="invoice-image"
									alt="none"
									style="width: 100%; height: 100%; object-fit: contain;"
									src="${src}"
								/>
							</div>
						</div>
					</td>`;
				})
				.join('');
			return `<tr>${attachmentData}</tr>`;
		})
		.join('');

	return `<table class="table-wrapper break-page">
		<thead>
			<tr>
				<td colspan="100%">
					<div style="height: 30px" class="text-center">
						<h3>${description}</h3>
					</div>
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

async function invoiceTmpPath(params) {
	const { data, categoryName, blockName, address, fileDir } = params;
	const tmpFiles = [];
	const outputPath = `${UPLOAD_CONFIG.OPTIONS.tempFileDir}/${fileDir}/${OPERATION_REPORT_CATEGORIES.INVOICE.key}.pdf`;

	let fileOrder = 0;
	await data.fee.data.asyncForEach(async item => {
		let body = [];
		const allAttachments = [...(item.historyAttachments || []), ...(item.images || [])];

		if (_.isEmpty(allAttachments)) return;
		fileOrder++;
		const fileName = `${OPERATION_REPORT_CATEGORIES.INVOICE.key}-${fileOrder}.pdf`;

		await allAttachments.asyncForEach(async attachment => {
			if (isPdf(attachment)) {
				const images = await convertPdfToImages(attachment, body);
				body = [...body, ...images];
			} else {
				body.push(attachment);
			}
		});
		const cardFilePartPath = await generateTmpPdfPath(
			{
				content: getInvoiceTemplateHtml(body, item.description, 2),
				categoryName,
				blockName,
				address,
				style: [GLOBAL_STYLE, INVOICE_STYLE].join(''),
			},
			fileDir,
			fileName
		);
		tmpFiles.push(cardFilePartPath);
	});
	if (!_.isEmpty(tmpFiles)) {
		await mergePDFs(tmpFiles, outputPath);
		return outputPath;
	}
	return null;
}

async function convertPdfToImages(url) {
	let imageUrls = [];
	let fileLocalPath = getLocalUri(url);

	const imgs = await models.ImageCompress.findUrls(url)
		.select('newUrl url')
		.catch(() => null);

	if (!_.isEmpty(imgs)) {
		imageUrls = _.map(imgs, img => img.newUrl);
		logger.info('Get images from PDF file: ', url);
		return imageUrls;
	}
	const stats = fs.statSync(fileLocalPath);
	const fileSizeInMB = stats.size / (1024 * 1024);
	logger.info(`File size: ${fileSizeInMB}MB`);
	if (fileSizeInMB > MAX_FILE_SIZE) {
		logger.warn(`File size is greater than ${MAX_FILE_SIZE}!`);
		return imageUrls;
	}

	let imagesCompress = [];

	const fileName = path.basename(fileLocalPath, path.extname(fileLocalPath));
	const timeTxt = moment().format('YY/MM/DD');
	const fileDir = `${timeTxt}/media`;

	const html = generateInvoiceHtml(url);
	const imagesPath = await generateImagePath({
		html,
		fileName,
		fileDir,
		selectorRoot: `#${SELECTOR_ROOT} canvas`,
		options: { quality: PDF_PRINT_OPTIONS.QUALITY },
	});
	if (imagesPath && !_.isEmpty(imagesPath)) {
		imagesPath.forEach(newUrl => {
			imagesCompress.push({
				url,
				newUrl,
			});
		});
		const insertResults = await models.ImageCompress.insertMany(imagesCompress);
		logger.info('Convert PDF complete', url);
		imageUrls = _.map(insertResults, img => img.newUrl);
	}
	return imageUrls;
}

function generateInvoiceHtml(url) {
	return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PDF.js Rendering</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.3.200/pdf.js"></script>
        <style>
            #${SELECTOR_ROOT} {
                display: none;
            }
        </style>
    </head>
    <body>
        <div id="${SELECTOR_ROOT}"></div>
        <script>
            const pdfUrl = "${url}";
            const pdfContainer = document.getElementById("${SELECTOR_ROOT}");

            async function renderPdf(url, container) {
                try {
                    const pdf = await pdfjsLib.getDocument(url).promise;
                    const numPages = pdf.numPages;

                    const renderPage = async (pageNum) => {
                        const page = await pdf.getPage(pageNum);
                        const canvas = document.createElement('canvas');
                        const viewport = page.getViewport({ scale: ${PDF_PRINT_OPTIONS.SCALE} });
                        const context = canvas.getContext('2d');
                        canvas.width = viewport.width;
                        canvas.height = viewport.height;
                        const renderContext = {
                            canvasContext: context,
                            viewport: viewport,
                        };
                        await page.render(renderContext).promise;
                        canvas.id = 'item' + '-' + pageNum;
                        container.appendChild(canvas);
                    };

                    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                        await renderPage(pageNum);
                    }

                    container.style.display = 'block';
                } catch (error) {
                    console.error('Error occurred while rendering PDF:', error);
                }
            }

            renderPdf(pdfUrl, pdfContainer);
        </script>
    </body>
</html>`;
}

module.exports = { invoiceTmpPath };

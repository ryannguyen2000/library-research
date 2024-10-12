const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const review = require('@controllers/review');
const { logger } = require('@utils/logger');

const { RATING_COLUMNS, REVIEW_COLUMNS, OPERATION_REPORT_CATEGORIES } = require('../const');
const { generateTmpPdfPath } = require('../saveFile');
const { GLOBAL_STYLE, TABLE_REPORT_STYLE, CUSTOMER_REVIEW_STYLE } = require('../style');

const { getTableHeadersTemplate, getTableRowsTemplate } = require('./table');

const LIMIT = 100;

async function getRatingHtml({ blockId, user, from, to, language }) {
	const data = await review.getRating(blockId, null, user, null, from, to);

	const tableHeaders = getTableHeadersTemplate(RATING_COLUMNS, [], language);
	const tableRating = getTableRowsTemplate(data.ratings, RATING_COLUMNS, false, {
		showStt: true,
		striped: true,
	});

	return `<div style="margin-bottom: 10px;" class="d-flex w-100 items-center">
		<div style="width: 280px">
			<div style="font-size: 3rem" class="text-secondary text-bold text-center">${_.get(data, 'avgRating')}</div>
			<div style="font-size: 12px" class="text-primary text-center">${_.get(data, 'total')} lượt đánh giá</div>
		</div>
		<div class="w-100">
			<table class="table-wrapper table-rating">
				<thead>
					<tr>
						${tableHeaders}
					</tr>
				</thead>
				<tbody>
                    ${tableRating}
				</tbody>
				<tfoot>
					<tr>
						<td>
							<div></div>
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	</div>`;
}

async function getReviewHtml(params, start = 0) {
	const { from, to, user, blockId, language } = params;
	let allTasks = [];
	try {
		while (true) {
			const reviewQuery = {
				blockId,
				from,
				to,
				user,
				star: 'all',
				start,
				limit: LIMIT,
			};
			const { reviews, total } = await review.getReviews(reviewQuery);
			allTasks = [...allTasks, ...reviews];
			if (reviews.length < LIMIT || allTasks.length >= total) {
				break;
			}
			start += LIMIT;
		}
		const tableBody = getTableRowsTemplate(allTasks, REVIEW_COLUMNS, false, {
			showStt: true,
		});
		const tableHeaders = getTableHeadersTemplate(REVIEW_COLUMNS, [], language);

		return `<table class="table-wrapper table-rating">
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
	} catch (err) {
		logger.error(err);
		throw new ThrowReturn('Get Task Failed');
	}
}

async function customerReviewTmpPath(params) {
	const { categoryName, fileDir, blockName, address } = params;
	const fileName = `${OPERATION_REPORT_CATEGORIES.CUSTOMER_REVIEW.key}.pdf`;

	const ratingHtml = await getRatingHtml(params);
	const reviewHtml = await getReviewHtml(params);
	const html = `<div class="page">
		<div>
             ${ratingHtml}
			 ${reviewHtml}
		</div> 
	</div> `;

	const tmpPath = await generateTmpPdfPath(
		{
			content: html,
			categoryName,
			blockName,
			address,
			style: [GLOBAL_STYLE, TABLE_REPORT_STYLE, CUSTOMER_REVIEW_STYLE].join(''),
		},
		fileDir,
		fileName
	);
	return tmpPath;
}

module.exports = { customerReviewTmpPath };

const _ = require('lodash');

const Task = require('@controllers/task');
const { OPERATION_REPORT_CATEGORIES } = require('../const');
const { generateTmpPdfPath } = require('../saveFile');
const { GLOBAL_STYLE, TASK_STATISTIC_STYLE } = require('../style');

const ROOMS_TASK = 'Tác vụ theo phòng';
const USERS_TASK = 'Thống kê theo nhân viên';
const TASKS = 'Thống kê theo tác vụ';

async function taskStatsTmpPath(params) {
	const { from, to, blockId, category, language, categoryName, fileDir, blockName, address } = params;
	const { rooms, tags, users } = await Task.quantityStatistic({ from, to, blockId, category }, language);
	const fileName = `${OPERATION_REPORT_CATEGORIES.TASK_STATISTIC.key}.pdf`;

	// if (_.isEmpty(data)) return;
	const roomsHtml = getStatisticHtml(
		ROOMS_TASK,
		_.map(rooms, item => {
			return { ...item, xValue: item.total, yValue: _.get(item, 'info.roomNo'), yWidth: 50 };
		})
	);
	const userTasksHTML = getStatisticHtml(
		USERS_TASK,
		_.map(users, item => {
			return { ...item, xValue: item.total, yValue: item.name, yWidth: 130 };
		}),
		true
	);

	const tasksHTML = getStatisticHtml(
		TASKS,
		_.map(tags, item => {
			return { ...item, xValue: item.total, yValue: item.name };
		})
	);

	const html = `<div class="page">
		<table class="table-wrapper">
			<thead>
				<tr>
					<td>
						<div></div>
					</td>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td class="d-flex w-100">
					<div style="width: 50%; margin-right: 15px">
					${userTasksHTML}
					</div>
					<div style="width: 50%">
						${roomsHtml}
					</div>
					</td>
 				</tr>
				<tr>
					<td>
						<div>${tasksHTML}</div>
					</td>
				</tr>
			</tbody>
			<tfoot>
				<tr>
					<td>
						<div></div>
					</td>
				</tr>
			</tfoot>
		</table>
	</div> `;

	const tmpPath = await generateTmpPdfPath(
		{
			content: html,
			categoryName,
			blockName,
			address,
			style: [GLOBAL_STYLE, TASK_STATISTIC_STYLE].join(''),
		},
		fileDir,
		fileName
	);
	return tmpPath;
}

function getStatisticHtml(name, data, showAvatar) {
	const maxValue = _.get(_.maxBy(data, 'xValue'), 'xValue');

	return `<div>
		<div style="margin-bottom: 10px; font-size: 12px">${name}</div>
		${
			_.isEmpty(data)
				? '<div>Trống</div>'
				: _.map(data, item => {
						const xWidth = (item.xValue / maxValue) * 100;
						const yWidth = item.yWidth || 90;
						const outsideFill = xWidth < 5;
						return `<div class="statistic-chart-row d-flex items-center">
							<div class="d-flex yAxis text-bold d-flex items-center" style="width: ${yWidth}px">
							${
								showAvatar
									? `<div>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												width="32"
												height="32"
												viewBox="0 0 24 24"
											>
												<path
													fill="#004e75"
													d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6m0 14c-2.03 0-4.43-.82-6.14-2.88a9.947 9.947 0 0 1 12.28 0C16.43 19.18 14.03 20 12 20"
												/>
											</svg>
									  </div> `
									: ''
							}
								<div>${item.yValue}</div>
							</div>
							<div class="xAxis d-flex ">
								<div class="fill" style="width: ${xWidth}%">
									${!outsideFill ? `<div class="text-primary text-bold label-value">${item.xValue}</div>` : ``}
								</div>
								${outsideFill ? `<div class='text-primary text-bold' style="margin-left: 5px">${item.xValue}</div>` : ''}
							</div>
						</div>`;
				  }).join('')
		}
	</div>`;
}

module.exports = { taskStatsTmpPath };

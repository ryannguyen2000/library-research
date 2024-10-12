const moment = require('moment');
const _ = require('lodash');

const stats = require('@controllers/performance/stats');

const { formatPrice } = require('@utils/func');
const models = require('@models');
const { generateTmpPdfPath } = require('../saveFile');
const { PERFORMANCE_STYLE, GLOBAL_STYLE } = require('../style');

const { PERFORMANCE_TYPES, OPERATION_REPORT_CATEGORIES } = require('../const');

const { replaceMultiple } = require('../helper');

async function performanceTmpPath(params) {
	const { from, to, blockId, user, categoryName, blockName, address, fileDir } = params;
	const fileName = `${OPERATION_REPORT_CATEGORIES.PERFORMANCE.key}.pdf`;

	const otas = await models.BookingSource.find({}).select('color name');
	const results = [];
	await _.values(PERFORMANCE_TYPES).asyncForEach(async type => {
		let title;
		let totals = {
			totalRevenue: 0,
			totalNight: 0,
			totalAvg: 0,
			totalRevPar: 0,
			totalRooms: 0,
		};
		const isRevenue = type === PERFORMANCE_TYPES.REVENUE;
		const isFormatPrice = type === PERFORMANCE_TYPES.REV_PAR || type === PERFORMANCE_TYPES.ADR;
		let templateHtml = getPerformanceTemplateHtml();
		const datasets = [];
		const labels = [];
		const dataset = {
			data: [],
			fill: true,
			borderColor: '#5aae66',
			backgroundColor: 'transparent',
			pointBackgroundColor: '#fff',
			tension: 0,
			formatValue: '',
			chartType: 'line',
			displayLegend: 'false',
			yAxesMax: '',
			prefix: '',
		};
		const res = await stats.getStatsPerformance({ from, to, type: isRevenue ? '' : type, blockId }, user);
		_.forEach(res.dates, (value, date) => {
			if (type === PERFORMANCE_TYPES.OCCUPANCY) {
				dataset.prefix = '%';
				dataset.yAxesMax = 'max: 100';
				dataset.data.push(`${value.occupancy || 0}`);
			} else {
				const revenueData = { date: moment(date).format('DD/MM') };
				let revenue = 0;
				let booked = 0;
				totals.totalRooms += value.rooms;
				_.forEach(value.revenue, (val, ota) => {
					val = parseInt(val);
					revenueData[ota] = val;
					revenue += val;
					booked += value.booked[ota] || 0;
				});
				const revParValue = revenue && value.rooms ? parseInt(revenue / value.rooms) : 0;
				const adrValue = booked ? parseInt(revenue / booked) : null;

				totals.totalRevenue += revenue;
				totals.totalNight += booked;
				totals.totalAvg = (totals.totalRevenue / totals.totalNight).toFixed(0);
				totals.totalRevPar = (totals.totalRevenue / totals.totalRooms).toFixed(0);

				if (isRevenue) {
					dataset.chartType = 'bar';
					dataset.formatValue = 'value = value / 1000000 + "M"';
					dataset.data.push(revenueData);
					dataset.displayLegend = 'true';
				}
				if (type === PERFORMANCE_TYPES.REV_PAR) {
					dataset.data.push(`${revParValue || 0}`);
				}
				if (type === PERFORMANCE_TYPES.ADR) {
					dataset.data.push(adrValue);
				}
				if (isFormatPrice) dataset.formatValue = 'value = Number(value).toLocaleString()';
			}
			labels.push(`'${moment(date).format('DD/MM')}'`);
			if (_.isEmpty(value.revenue)) dataset.formatValue = 'value = 0';
		});

		if (isRevenue) {
			_.forEach(_.keys(dataset.data[0]).sort(), otaKey => {
				if (otaKey === 'date') return;
				const ota = _.find(otas, item => item.name === otaKey);
				const color = _.get(ota, 'color', '');
				datasets.push(
					JSON.stringify({
						backgroundColor: color,
						borderColor: color,
						data: dataset.data.map(item => `${item[otaKey]}`),
						label: otaKey,
					})
				);
			});
		} else {
			datasets.push(JSON.stringify(dataset));
		}

		title = getTitleHtml(res, totals, type);

		results.push(
			replaceMultiple(templateHtml, [
				{ search: '%FORMAT_VALUE%', replaceValue: dataset.formatValue },
				{ search: '%PREFIX%', replaceValue: dataset.prefix },
				{ search: '%PERFORMANCE_TYPE%', replaceValue: type },
				{ search: '%CHART_TYPE%', replaceValue: dataset.chartType },
				{ search: '%DATA_SETS%', replaceValue: datasets },
				{ search: '%LABELS%', replaceValue: labels.join(',') },
				{ search: '%DISPLAY%', replaceValue: dataset.displayLegend },
				{ search: '%Y_AXES_MAX%', replaceValue: dataset.yAxesMax },
				{ search: '%TITLE%', replaceValue: title },
			])
		);
	});
	const html = `<div class="page d-flex justify-between flex-wrap chart-wrapper">
			${results.join(' ')}
		</div>
		 `;
	const tmpPath = await generateTmpPdfPath(
		{
			content: html,
			categoryName,
			blockName,
			address,
			style: [GLOBAL_STYLE, PERFORMANCE_STYLE].join(''),
		},
		fileDir,
		fileName,
		{
			script: `<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.6.0/Chart.js"></script>`,
		}
	);
	return tmpPath;
}

function getPerformanceTemplateHtml() {
	return `
		<div>
		<div class="table-performance">
		<div class="chart-title">%TITLE%</div>
			<canvas id="%PERFORMANCE_TYPE%"></canvas>
		</div>

		<script>
			var ctx = document.getElementById('%PERFORMANCE_TYPE%').getContext('2d');
			var chart = new Chart(ctx, {
			type: '%CHART_TYPE%', // also try bar or other graph types
			data: {
				labels: [%LABELS%],
				datasets: [%DATA_SETS%]
			},
			options: {
				maintainAspectRatio: false,
				layout: {
					padding: 10,
				},
				legend: {
					display: %DISPLAY%,
				},
				scales: {
					yAxes: [
						{
							ticks: {
								autoSkip: true,
								beginAtZero: true,
								callback: function (value) {
									%FORMAT_VALUE%;
									return value + "%PREFIX%";
								},
								%Y_AXES_MAX%

							},
							stacked: true,
						},

					],
					xAxes: [
						{
							ticks: {
								fontSize: 10,
								autoSkip: true,
								maxRotation: 0,
								// minRotation: 0
							},
							gridLines: {
								display: false, // Display grid lines
							},
							stacked: true
						},
					],
				},
			},
		});
			</script>
		</div>
	`;
}

function getTitleHtml(data, { totalRevenue, totalNight, totalAvg, totalRevPar }, type) {
	const isOccupancy = type === PERFORMANCE_TYPES.OCCUPANCY;
	const isADR = type === PERFORMANCE_TYPES.ADR;
	const isREVPAR = type === PERFORMANCE_TYPES.REV_PAR;
	const isRevenue = type === PERFORMANCE_TYPES.REVENUE;

	let titleTemplate = `
		<div class="d-flex justify-between w-100">
			<div>
				<div class="chat-title">%TITLE_1%</div>
				<div class="text-black">
					%VALUE_1%
				</div>
			</div>
			<div>
				<div class="chat-title">%TITLE_2%</div>
				<div class="text-black">%VALUE_2%</div>
			</div>
			<div>
				<div class="chat-title">%TITLE_3%</div>
				<div class="text-black">%VALUE_3%</div>
			</div>
		</div>
	`;

	if (isOccupancy) {
		[
			{ title: 'Total Rooms Available', value: _.get(data, 'occupancy.available') },
			{ title: 'Total Rooms Sold', value: _.get(data, 'occupancy.sold') },
			{
				title: 'Total Rooms Occupacy',
				value: _.get(data, 'occupancy.avgOccupancy')
					? `<span class="revenue-chart-value">${data.occupancy.avgOccupancy.toFixed(1)}%</span>`
					: 0,
			},
		].forEach((item, i) => {
			const index = i + 1;
			titleTemplate = titleTemplate.replaceAll(`%TITLE_${index}%`, item.title);
			titleTemplate = titleTemplate.replaceAll(`%VALUE_${index}%`, item.value);
		});
	}
	if (isADR) {
		[
			{
				title: 'Total Revenue',
				value: `<span class="revenue-chart-value">${formatPrice(totalRevenue)} VND</span>`,
			},
			{ title: 'Total Nights', value: totalNight || '' },
			{
				title: 'ADR Avg',
				value: `<span class="revenue-chart-value">${formatPrice(totalAvg)} VND</span>`,
			},
		].forEach((item, i) => {
			const index = i + 1;
			titleTemplate = titleTemplate.replaceAll(`%TITLE_${index}%`, item.title);
			titleTemplate = titleTemplate.replaceAll(`%VALUE_${index}%`, item.value);
		});
	}
	if (isREVPAR) {
		[
			{
				title: 'Total Revenue',
				value: `<span class="revenue-chart-value">${formatPrice(totalRevenue)} VND</span>`,
			},
			{ title: 'Total Rooms Available', value: _.get(data, 'occupancy.available') || '' },
			{
				title: 'RevPar',
				value: `<span class="revenue-chart-value">${formatPrice(totalRevPar)} VND</span>`,
			},
		].forEach((item, i) => {
			const index = i + 1;
			titleTemplate = titleTemplate.replaceAll(`%TITLE_${index}%`, item.title);
			titleTemplate = titleTemplate.replaceAll(`%VALUE_${index}%`, item.value);
		});
	}
	if (isRevenue) {
		[
			{
				title: 'Total Revenue',
				value: `<span class="revenue-chart-value">${formatPrice(totalRevenue)} VND</span>`,
			},
			{ title: '', value: '' },
			{
				title: '',
				value: '',
			},
		].forEach((item, i) => {
			const index = i + 1;
			titleTemplate = titleTemplate.replaceAll(`%TITLE_${index}%`, item.title);
			titleTemplate = titleTemplate.replaceAll(`%VALUE_${index}%`, item.value);
		});
	}
	return titleTemplate;
}

module.exports = { performanceTmpPath };

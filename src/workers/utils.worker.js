const { parentPort } = require('worker_threads');

global.isDev = process.env.NODE_ENV !== 'production';

require('module-alias/register');
require('@utils/ext');
require('@src/init/db').initDB();

const reportHost = require('@controllers/finance/reportHost');
const { fetchPayout } = require('@controllers/finance/sync');
const { earningStats } = require('@controllers/finance/stats');
const { syncReviews } = require('@controllers/review/thread');
const { syncAvailablityCalendar } = require('@controllers/schedule/local');
const sync = require('@controllers/sync');

const {
	REPORT_CALCULATOR,
	FINANCE_EARNING_STATS,
	PAYMENT_CRAWLER,
	REVIEW_CRAWLER,
	SYNC_CALENDAR_LOCAL,
	SYNC_CALENDAR,
	SYNC_PRICE,
	// GENERATE_EXCEL_TO_IMG,
} = require('./const');

require('./utils/job');

async function onMessage({ type, data, id } = {}) {
	let result;
	let error;

	try {
		if (type === REPORT_CALCULATOR) {
			result = await reportHost.getReport(data);
			result = JSON.parse(JSON.stringify(result));
		} else if (type === PAYMENT_CRAWLER) {
			result = await fetchPayout(data.otas, data.from, data.to, data.blockId);
		} else if (type === FINANCE_EARNING_STATS) {
			result = await earningStats(data);
		} else if (type === REVIEW_CRAWLER) {
			result = await syncReviews(data.otas, data.getAll);
		} else if (type === SYNC_CALENDAR_LOCAL) {
			result = await syncAvailablityCalendar(data.blockId, data.from, data.to);
		} else if (type === SYNC_CALENDAR) {
			result = await sync.synchronizeSchedules(data);
		} else if (type === SYNC_PRICE) {
			result = await sync.synchronizePrices(data);
		}
	} catch (e) {
		error = e;
	}

	if (result || error) {
		parentPort.postMessage({ id, type, result, error });
	}
}

// setTimeout(() => {
// 	(async () => {
// 		const rs = await require('./index').runWorker({
// 			type: GENERATE_EXCEL_TO_IMG,
// 			data: {
// 				url: 'https://api.tb.com/static/upload/finance/24/01/15/paydi_LCT_1705291594924.xlsx',
// 				folderPath: 'tmp',
// 			},
// 		});
// 		console.log('test', rs);
// 	})();
// }, 1000);

parentPort.on('message', onMessage);

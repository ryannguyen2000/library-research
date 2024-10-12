const { runWorker } = require('@workers/index');
const { SYNC_CALENDAR, SYNC_PRICE } = require('@workers/const');

async function synchronizeSchedules({ listingId, from, to, otas, taskId }) {
	return await runWorker({
		type: SYNC_CALENDAR,
		data: {
			listingId: listingId && listingId.toString(),
			from,
			to,
			otas,
			taskId: taskId && taskId.toString(),
		},
	});
}

async function synchronizePrices(data) {
	return await runWorker({
		type: SYNC_PRICE,
		data,
	});
}

module.exports = {
	synchronizeSchedules,
	synchronizePrices,
};

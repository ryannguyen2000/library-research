const { runWorker } = require('@workers/index');
const { SYNC_CALENDAR_LOCAL } = require('@workers/const');

async function syncAvailablityCalendar(blockId, from, to) {
	return await runWorker({
		type: SYNC_CALENDAR_LOCAL,
		data: {
			blockId: blockId.toString(),
			from,
			to,
		},
	});
}

module.exports = {
	syncAvailablityCalendar,
};

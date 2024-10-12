const { runWorker } = require('@workers/index');
const { PAYMENT_CRAWLER } = require('@workers/const');

function fetchPayout(otas, from, to, blockId) {
	return runWorker({
		type: PAYMENT_CRAWLER,
		data: {
			from,
			to,
			otas,
			blockId: blockId ? blockId.toString() : null,
		},
	});
}

module.exports = {
	fetchPayout,
};

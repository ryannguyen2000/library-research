const { runWorker } = require('@workers/index');
const { REVIEW_CRAWLER } = require('@workers/const');

async function syncReviews(otas, getAll) {
	return await runWorker({
		type: REVIEW_CRAWLER,
		data: {
			otas,
			getAll,
		},
	});
}

module.exports = {
	syncReviews,
};

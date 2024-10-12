const _ = require('lodash');

const { runWorker } = require('@workers/index');
const { FINANCE_EARNING_STATS } = require('@workers/const');

function earningStats({ blockId, excludeRoomIds, filters, ...params }) {
	return runWorker({
		type: FINANCE_EARNING_STATS,
		data: {
			...params,
			blockId: _.isArray(blockId) ? _.map(blockId, _.toString) : _.toString(blockId),
			excludeRoomIds: excludeRoomIds && excludeRoomIds.map(b => b.toString()),
			filters: JSON.stringify(filters),
		},
	});
}

module.exports = {
	earningStats,
};

const _ = require('lodash');
const moment = require('moment');

const payments = require('@controllers/ota_api/payments');

function fetchPayout(otas, from, to, blockId) {
	from = from || moment(from).add(-15, 'day').toDate();
	to = to || moment(to).add(15, 'day').toDate();

	return Object.entries(payments)
		.filter(([ota, p]) => p.fetchAll && (!otas || _.includes(otas, ota)))
		.asyncMap(([, p]) => p.fetchAll(from, to, blockId).catch(() => {}));
}

module.exports = {
	fetchPayout,
};

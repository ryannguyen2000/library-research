const { exec } = require('child_process');
const moment = require('moment');
const { logger } = require('@utils/logger');

async function caclPromotionData({ hour, total_room, available_room, maximum_promotion, minimum_promotion }) {
	const command = [
		'python',
		`${__dirname}/../../../../lib/smartprice/smart-price-calc.py`,
		`--total_room ${total_room}`,
		`--hour ${hour}`,
		`--available_room ${available_room}`,
		`--maximum_promotion ${maximum_promotion}`,
		`--minimum_promotion ${minimum_promotion}`,
	].join(' ');

	const data = await new Promise((resolve, reject) => {
		exec(command, (error, stdout) => {
			if (error !== null) {
				reject(error);
			} else {
				resolve(stdout);
			}
		});
	});

	try {
		return JSON.parse(data);
	} catch (err) {
		logger.error('caclPromotionData error', data);
		throw err;
	}
}

const cache = {
	timestamp: 0,
	data: {},
};

const DAY = 1000 * 60 * 60 * 24;

/**
 *
 *
 * @param {Object} data
 * @param {number} data.hour
 * @param {number} data.total_room
 * @param {number} data.available_room
 * @param {number} data.minimum_promotion
 * @param {number} data.maximum_promotion
 */
async function algorithm(data) {
	const key = Object.values(data).join('|');
	if (Date.now() - cache.timestamp >= DAY) {
		cache.timestamp = moment().startOf('days').toDate().getTime();

		cache.data = {};
	}

	if (cache.data[key]) {
		return cache.data[key];
	}

	const result = await caclPromotionData(data);
	logger.info(
		'Last Minute One Day: algorithm -> result',
		data.hour,
		data.total_room,
		data.available_room,
		data.minimum_promotion,
		data.maximum_promotion,
		result.promotion
	);

	const discount = -Math.round(result.promotion * 100);
	cache.data[key] = discount;

	return discount;
}

module.exports = {
	name: 'Last Minute One Day',
	exec: algorithm,
};

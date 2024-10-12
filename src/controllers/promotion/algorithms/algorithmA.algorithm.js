const { exec } = require('child_process');
const get = require('lodash/get');
const { logger } = require('@utils/logger');
const models = require('@models');
const otas = require('../otas');

async function getPromotionSample(nominal_price, maximum_promotion, elasticity) {
	const data = await new Promise((resolve, reject) => {
		exec(
			`${
				process.env.PYTHON || 'python'
			} ${__dirname}/../../../../lib/smartprice/smartprice.py -m ${maximum_promotion} -e ${elasticity}`,
			(error, stdout) => {
				if (error !== null) {
					reject(error);
				} else {
					resolve(stdout);
				}
			}
		);
	});
	try {
		return JSON.parse(data);
	} catch (err) {
		logger.error('getPromotionSample error', data, err);
		throw err;
	}
}

function generatePromotionData({ data, infoKey, plan, blockId, avaiableRooms }) {
	const { startDate, endDate, name, maxPromo, elasticity, activeOTAs } = plan;

	return data
		.map(info => {
			let capacity = Math.max(...info['capacity/price'].map(d => d[0]));
			if (capacity >= avaiableRooms.length) {
				capacity = avaiableRooms.length;
			}

			const price = info['capacity/price'].find(d => d[0] === capacity)[1];
			if (price === 1) {
				return null;
			}

			const promotionInfo = {
				[infoKey]: info[infoKey],
				key: infoKey,
				capacity,
				price: 1 - price,
			};

			const promotion = {
				promoType: 'last_minute',
				rooms: [],
				active: true,
				modifiled: true,
				cozrum: {
					secretDeal: false,
					maxPromo,
					elasticity,
				},
				name: `(${name}) for block ${blockId}: ${infoKey} - ${info[infoKey]} - ${price}`,
				startDate,
				endDate,
				timeFormat: 'Day',
				activeOTAs,
				promotionInfo,
			};

			Object.keys(otas)
				.filter(key => otas[key].generate)
				.forEach(key => {
					promotion[key] = otas[key].generate(promotion);
				});
			return promotion;
		})
		.filter(p => p);
}

async function algorithm(plan, blockId, rates, roomIds) {
	if (!plan || !blockId || !rates || !roomIds) {
		return [];
	}

	const { startDate, endDate, maxPromo, elasticity } = plan;

	const promises = rates.map(async rate => {
		const sample = await getPromotionSample(rate.defaultPrice, maxPromo / 100, elasticity / 100);

		const avaiableRooms = await models.BlockScheduler.findAvailableRooms(roomIds, blockId, startDate, endDate);
		if (avaiableRooms.length === 0) {
			return [];
		}

		const hourPromotions = generatePromotionData({
			data: get(sample, 'results.early', []),
			infoKey: 'hours',
			plan,
			blockId,
			avaiableRooms,
		});

		const dayPromotions = generatePromotionData({
			data: get(sample, 'results.late', []),
			infoKey: 'day',
			plan,
			blockId,
			avaiableRooms,
		});

		return hourPromotions.concat(dayPromotions);
	});

	const promotions = await Promise.all(promises);

	return promotions.reduce((arr, v) => arr.concat(v), []);
}

module.exports = {
	name: 'Algorithm A',
	exec: algorithm,
};

const _ = require('lodash');
const uuid = require('uuid').v4;
const schedule = require('node-schedule');
const moment = require('moment');

const { logger } = require('@utils/logger');
const models = require('@models');
const { getStatsPerformance } = require('@controllers/performance/stats');
const { bulkUpdatePrice } = require('@controllers/pricing');

async function getOccupancy(blockId, date) {
	date = date || new Date();
	const data = await getStatsPerformance({
		type: 'occupancy',
		from: date,
		to: date,
		blockId,
	}).then(rs => _.get(rs, ['dates', date.toDateMysqlFormat()]));

	const sold = data ? _.sum(_.values(data.booked)) : 0;
	const total = data ? data.rooms : 0;
	return {
		occupancy: total ? sold / total : 0,
		total,
		available: total - sold,
	};
}

async function runAutoInDay(auto, today) {
	const { occupancy } = await getOccupancy(auto.blockId);

	const stepMatching = _.find(
		_.get(auto, 'configs[0].steps'),
		step => occupancy >= step.minOcc / 100 && occupancy <= step.maxOcc / 100
	);
	if (!stepMatching) return;

	await bulkUpdatePrice({
		from: today,
		to: today,
		price: stepMatching.priceChange,
		blockId: auto.blockId,
		otas: auto.activeOTAs,
		roomTypes: auto.roomTypes,
	});
}

async function getN(date, blockId, config) {
	// tong so phong * BW * (ty le lap day tuan truoc + ty le ky vong)

	const to = moment(date).add(-config.bookingWindowDayCalc, 'day');
	const from = moment(to).add(-config.bookingWindow, 'day');
	const data = await getStatsPerformance({
		type: 'BookingWindow',
		from,
		to,
		blockId,
	});
	const BWDataMatched = _.pickBy(data.dates, (v, a) => parseInt(a) <= config.period);
	const BW = _.sum(_.map(BWDataMatched, i => _.sum(_.values(i)))) / data.total;
	const { occupancy } = await getOccupancy(blockId, moment(date).add(-7, 'day').toDate());

	return BW * (occupancy + (config.expertPercentSelling || 0) / 100);
}

function validateRaito(ratio, config) {
	if (ratio >= 1) {
		config.maxPercentIncrease /= 100;
		config.minPercentIncrease /= 100;
		if (ratio - 1 > config.maxPercentIncrease) ratio = 1 + config.maxPercentIncrease;
		else if (ratio - 1 < config.minPercentIncrease) ratio = 1 + config.minPercentIncrease;
	} else {
		config.maxPercentDecrease /= 100;
		config.minPercentDecrease /= 100;
		if (1 - ratio > config.maxPercentDecrease) ratio = 1 - config.maxPercentDecrease;
		else if (1 - ratio < config.minPercentDecrease) ratio = 1 - config.minPercentDecrease;
	}

	return ratio;
}

async function runAutoPeriod(auto, date) {
	const roomTypes = await models.Room.getRoomTypes(auto.blockId);
	if (!auto.roomTypes.length) auto.roomTypes = _.keys(roomTypes);

	return auto.configs.asyncMap(async config => {
		const dateSet = moment(date).add(config.period, 'day');
		const dateStr = dateSet.toDate().toDateMysqlFormat();

		const { total, available: n } = await getOccupancy(auto.blockId, dateSet.toDate());
		const N = total * (await getN(dateSet, auto.blockId, config));
		let ratio = (n / N) ** (1 / config.e);
		if (!ratio) return;

		ratio = validateRaito(ratio, config);

		return auto.roomTypes.asyncMap(async roomType => {
			const obj = {
				from: dateSet,
				to: dateSet,
				ratio,
				blockId: auto.blockId,
				otas: auto.activeOTAs,
				roomTypes: [roomType],
			};
			const prevPrice = _.find(auto.priceState, state => state.roomType === roomType && state.date === dateStr);
			if (prevPrice) {
				obj.priceSet = Math.abs(prevPrice.prevPrice * ratio);
			} else {
				obj.ratio = ratio;
			}
			const tasks = await bulkUpdatePrice(obj);
			if (!prevPrice) {
				const price = _.get(tasks, [0, 'prevPrice']);
				if (price) {
					const priceState = {
						date: dateStr,
						prevPrice: Math.abs(price),
						roomType,
					};
					await models.PriceAuto.updateOne({ _id: auto._id }, { $push: { priceState } });
				}
			}
		});
	});
}

const jobs = {};

function clearJob(jobId) {
	if (jobs[jobId]) {
		jobs[jobId].cancel();
		delete jobs[jobId];
	}
}

async function runJob(jobId, timeStart) {
	try {
		const today = new Date();
		const autoPrices = await models.PriceAuto.find({
			active: true,
			to: { $gte: today.toDateMysqlFormat() },
			'configs.timeStart': timeStart,
		});

		if (autoPrices.length === 0) {
			return clearJob(jobId);
		}

		await autoPrices.asyncMap(auto => {
			auto = auto.toJSON();
			if (auto.activeDays.length && !auto.activeDays.includes(String(today.getDay() + 1))) {
				return;
			}
			auto.configs = _.filter(auto.configs, c => c.timeStart === timeStart);
			if (!auto.configs.length) return;

			if (auto.autoType === 0) {
				return runAutoInDay(auto, today);
			}
			return runAutoPeriod(auto, today);
		});
	} catch (e) {
		logger.error(`Job price auto error`, jobId, e);
	}
}

async function init() {
	try {
		_.keys(jobs).map(clearJob);

		const autoPrices = await models.PriceAuto.aggregate([
			{
				$match: {
					active: true,
					to: { $gte: new Date().toDateMysqlFormat() },
				},
			},
			{
				$unwind: '$configs',
			},
			{
				$group: { _id: '$configs.timeStart' },
			},
		]);

		_.forEach(autoPrices, auto => {
			if (!auto._id.match(/\d{2}:\d{2}/)) return;

			const [hour, minute] = auto._id.split(':');
			const jobId = uuid();

			jobs[jobId] = schedule.scheduleJob(`${minute} ${hour} * * *`, () => runJob(jobId, auto._id));
		});
	} catch (e) {
		logger.error(e);
	}
}
init();

module.exports = {
	init,
};

const moment = require('moment');
const _ = require('lodash');
const { v4: uuid } = require('uuid');

const { logger } = require('@utils/logger');
const { rangeDate } = require('@utils/date');
const models = require('@models');
const synchronize = require('@controllers/ota_api/synchronize');
const { syncAvailablityCalendar } = require('@controllers/schedule/local');
const { Services, OTAs, LocalOTA } = require('@utils/const');

async function syncCalendar(syncId, { agent, property, listing, from, to, schedules, isMuti }) {
	let { otaName, account } = agent;

	if (otaName.startsWith(LocalOTA)) {
		otaName = LocalOTA;
	}

	const api = synchronize[otaName];
	if (!api) return;

	const [otaConfig] = await models.OTAManager.findByName(otaName, account);
	const propertyId = _.get(property, 'propertyId') || '';
	const promises = [];

	// update room to sell
	if (api.synchronizeRoomToSell) {
		await api.synchronizeRoomToSell(propertyId, agent, from, to, listing.roomIds.length, otaConfig);
	}

	if (!api.synchronizeSchedule) return;

	let sameListingRoom = 1;

	if (otaName === OTAs.Booking && schedules.some(s => s.available)) {
		sameListingRoom = await models.Listing.countDocuments({
			blockId: listing.blockId._id,
			roomIds: { $all: listing.roomIds },
			OTAs: { $elemMatch: { active: true, otaName, account } },
		});
	}

	// update schedule
	schedules.forEach(schedule => {
		let { available } = schedule;

		if (available && sameListingRoom > 1) {
			if (available === 1) {
				available = agent.genius ? 1 : 0;
			} else {
				available = agent.genius
					? Math.ceil(available / sameListingRoom)
					: Math.floor(available / sameListingRoom);
			}
		}

		const fn = api.synchronizeSchedule(
			propertyId, // otaPropertyId
			agent, // otaListing
			schedule.date, // from
			schedule.date, // to
			available, // avaiable
			otaConfig,
			syncId,
			listing,
			schedule.unavailableHours,
			isMuti
		);

		if (api.synchronizeSchedule[Symbol.toStringTag] === 'AsyncFunction') {
			promises.push(fn);
		}
	});

	if (promises.length) {
		return Promise.all(promises);
	}
}

async function synchronizeSchedulesLock({ listings, from, to, otas }) {
	const syncId = uuid();
	from = from.zeroHours();
	to = to.zeroHours();

	const dates = rangeDate(from, to).toArray();
	const otaData = {};
	const scheduleBlocks = {};

	await _.uniqBy(listings, l => l.blockId._id.toString()).asyncMap(async listing => {
		const blockId = listing.blockId._id;
		scheduleBlocks[blockId] = await models.BlockScheduler.find({
			blockId,
			date: { $gte: from, $lte: to },
		})
			.sort({ date: 1 })
			.lean();
	});

	const syncItems = await listings.asyncMap(async listing => {
		const includeHourService = _.includes(listing.blockId.serviceTypes, Services.Hour);
		// const includeHourService = listing.OTAs.some(ota =>
		// 	ota.rates.some(r => r.ratePlanId.serviceType === Services.Hour)
		// );
		const rules = listing.blockId.getRules();

		const schedulesObj = await models.BlockScheduler.getSchedulesByRoomIds({
			blockId: listing.blockId._id,
			schedules: scheduleBlocks[listing.blockId._id],
			roomIds: listing.roomIds,
			filterEmpty: false,
			rules,
			includeHourService,
			isSync: true,
		}).then(sches => _.keyBy(sches, s => s.date.toDateMysqlFormat()));

		const schedules = dates.map(
			date =>
				schedulesObj[date.toDateMysqlFormat()] || {
					date,
					available: listing.roomIds.length,
				}
		);

		const block = listing.blockId;
		const properties = _.groupBy(block.OTAProperties, 'otaName');

		const arr = listing.OTAs.map(agent => {
			if (!agent.active || agent.disableSyncCalendar) return;
			if (
				otas.length &&
				!otas.some(
					ota =>
						ota === agent.otaName ||
						(ota.otaName === agent.otaName && (!ota.account || ota.account === agent.account))
				)
			)
				return;

			otaData[agent.otaName] = otaData[agent.otaName] || [];
			if (!otaData[agent.otaName].includes(agent.account)) {
				otaData[agent.otaName].push(agent.account);
			}

			return {
				agent,
				listing,
				from,
				to,
				schedules,
				property: _.find(properties[agent.otaName], p => p.account === agent.account),
				isMuti: !otas.length,
			};
		});

		return _.compact(arr);
	});

	const errors = [];

	await _.flatten(syncItems).asyncMap(info =>
		syncCalendar(syncId, info).catch(error => {
			logger.error(error);
			errors.push({ otaName: info.agent.otaName, account: info.agent.account });
		})
	);

	// final steps
	await _.entries(synchronize)
		.filter(([, api]) => api.syncDone)
		.asyncMap(([otaName, api]) =>
			api.syncDone(syncId).catch(error => {
				logger.error(error);
				_.forEach(otaData[otaName], account => {
					errors.push({ otaName, account });
				});
			})
		);

	// return error for create new task later
	return _.uniqBy(errors, e => e.otaName + e.account);
}

async function synchronizeSchedules({ listingId, from, to, otas, taskId }) {
	from = from ? new Date(from) : new Date();
	to = to ? new Date(to) : moment().add(12, 'month').toDate();
	otas = _.compact(_.isArray(otas) ? otas : [otas]);

	if (moment().isAfter(to, 'day')) return;

	const start = Date.now();

	const query = {
		OTAs: {
			$elemMatch: { active: true },
		},
	};
	if (listingId) {
		query._id = listingId;
	} else {
		query.blockId = await models.Block.getActiveBlock();
	}
	if (otas.length) {
		if (_.isObject(otas[0])) {
			query.OTAs.$elemMatch.$or = otas;
		} else if (_.isString(otas[0])) {
			query.OTAs.$elemMatch.otaName = { $in: otas };
		}
	}

	const listings = await models.Listing.find(query)
		.select('blockId OTAs roomIds info.maxOccupancy rateIds roomTypeId')
		.populate('blockId');

	const blockIds = _.uniqBy(_.map(listings, 'blockId._id'), _.toString);

	blockIds.forEach(blockId => {
		syncAvailablityCalendar(blockId, from, to);
	});

	const rs = await synchronizeSchedulesLock({
		listings,
		from,
		to,
		otas,
	});

	logger.info('synchronizeSchedules', otas, taskId, Math.ceil((Date.now() - start) / 1000));

	return rs;
}

/**
 * Synchronize price to OTAs
 * @param {string} listingId
 * @param {string} otaName
 * @param {string} rateId
 * @param {Number} price
 * @param {Date} from
 * @param {Date} to
 * @param {Boolean} smartPrice
 */
async function synchronizePrices(data) {
	let { otaName, account, otaListingId } = data.otaListing;

	logger.info('UpdatePrice -> ', otaName, otaListingId, _.pick(data, ['syncId', 'from', 'to', 'price', 'rates']));

	if (otaName.startsWith(LocalOTA)) {
		otaName = LocalOTA;
	}

	if (!synchronize[otaName] || !synchronize[otaName].synchronizePrice) return;

	const [otaConfig] = await models.OTAManager.findByName(otaName, account);

	const fn = synchronize[otaName].synchronizePrice({
		...data,
		otaConfig,
	});

	if (synchronize[otaName].synchronizePrice[Symbol.toStringTag] === 'AsyncFunction') {
		await fn;
	}
}

module.exports = {
	synchronizeSchedules,
	synchronizePrices,
};

const _ = require('lodash');
const moment = require('moment');

const { OTAs } = require('@utils/const');
const { Settings } = require('@utils/setting');
const { logger } = require('@utils/logger');
const { ReservateCrawlerLock } = require('@utils/lock');
const { extractEmails } = require('@utils/func');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const crawler = require('@controllers/ota_api/crawler_reservations');

async function getReservationsOfOTAs(otas, from, to) {
	if (!to) {
		to = moment().add(Settings.DaysForCrawlerBookings.value, 'day').toDate();
	}

	await otas
		.filter(otaName => _.has(crawler[otaName], 'reservationsCrawler'))
		.asyncMap(async otaName => {
			const otaConfigs = await models.OTAManager.findByName(otaName);
			await otaConfigs.asyncForEach(otaConfig =>
				crawler[otaName].reservationsCrawler(otaConfig, from, to).catch(err => {
					logger.error(err);
				})
			);
		});
}

async function getOTAByTask(task) {
	const { otaName } = task;

	if (otaName === OTAs.Agoda) {
		const listing = await models.Listing.aggregate([
			{ $unwind: '$OTAs' },
			{
				$match: _.pickBy({
					'OTAs.otaName': task.otaName,
					'OTAs.active': true,
					'OTAs.otaListingId': task.propertyId && { $regex: new RegExp(`^${task.propertyId},`) },
				}),
			},
			{ $limit: 1 },
		]);
		return _.get(listing[0], 'OTAs');
	}

	const match = {
		'OTAProperties.otaName': task.otaName,
	};
	if (task.propertyId) {
		match['OTAProperties.propertyId'] = task.propertyId;
	} else if (task.propertyName) {
		match['OTAProperties.propertyName'] = task.propertyName;
	} else {
		const [email] = extractEmails(task.email) || [];
		return { otaName: task.otaName, username: email };
	}

	const block = await models.Block.aggregate([
		{ $match: match },
		{ $unwind: '$OTAProperties' },
		{ $match: match },
		{ $limit: 1 },
	]);
	const property = _.get(block, [0, 'OTAProperties']);
	if (property) {
		task.propertyId = property.propertyId;
	}

	return property;
}

async function getOtaConfigWithOtaProperty(task) {
	const otaInfo = await getOTAByTask(task);
	if (!otaInfo) {
		return Promise.reject(`422`);
	}

	const query = _.pickBy({
		active: true,
		name: otaInfo.otaName,
		account: otaInfo.account,
		username: otaInfo.username,
	});

	let otaConfig = await models.OTAManager.findOne(query);
	if (!otaConfig) {
		delete query.username;
		delete query.account;
		otaConfig = await models.OTAManager.findOne(query);
	}

	if (!otaConfig) {
		return Promise.reject(`422`);
	}

	return otaConfig;
}

async function crawlerReservation(task) {
	const otaConfig = await getOtaConfigWithOtaProperty(task);
	return crawler[task.otaName].crawlerReservationWithId(otaConfig, task.propertyId, task.reservationId, task);
}

async function crawlerReservations(task) {
	const ota = task.otaName;
	if (!crawler[ota] || !crawler[ota].reservationsCrawler) return;

	const otaConfigs = await models.OTAManager.findByName(ota);
	if (!task.to) {
		task.to = moment().add(Settings.DaysForCrawlerBookings.value, 'day').toDate();
	}

	for (const otaConfig of otaConfigs) {
		await crawler[ota].reservationsCrawler(otaConfig, task.from, task.to, task.reservationId).catch(err => {
			logger.error(err);
		});
	}
}

async function getReservationsOfOTAsHook(task) {
	return await ReservateCrawlerLock.acquire(task.otaName, async () => {
		const start = Date.now();

		if (task.reservationId && crawler[task.otaName].crawlerReservationWithId) {
			await crawlerReservation(task);
		} else {
			await crawlerReservations(task);
		}

		logger.info('getReservationsOfOTAsHook', task._id, task.otaName, Math.ceil((Date.now() - start) / 1000));
	});
}

async function fetchListingDetail(ota, listingId) {
	const listing = await models.Listing.findById(listingId);
	if (!listing || !listing.getOTA(ota)) {
		throw new ThrowReturn('Listing not found');
	}

	if (!crawler[ota] || !crawler[ota].listingDetail) {
		throw new ThrowReturn('Not yet supported');
	}

	const otaListing = listing.getOTA(ota);
	const [otaConfig] = await models.OTAManager.findByName(ota, otaListing.account);

	const detail = await crawler[ota].listingDetail(otaListing.otaListingId, otaConfig).catch(err => {
		throw new ThrowReturn(err);
	});

	if (detail) {
		listing.info = {
			...listing.info,
			...detail,
		};
		await listing.save();
	}
	return listing;
}

module.exports = {
	getReservationsOfOTAs,
	fetchListingDetail,
	getReservationsOfOTAsHook,
};

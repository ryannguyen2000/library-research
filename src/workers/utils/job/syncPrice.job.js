// const mongoose = require('mongoose');
const schedule = require('node-schedule');
const moment = require('moment');
const _ = require('lodash');

const { MAX_RUN_SYNC_PRICE, LocalOTAs } = require('@utils/const');
const { getDayOfRange, rangeDate, groupDates } = require('@utils/date');
const { logger } = require('@utils/logger');
const models = require('@models');
const synchronize = require('@controllers/ota_api/synchronize');
const { synchronizePrices } = require('@controllers/sync');

const runningOTA = {};
const DAY_TO_RESYNC = 60;

function rangeToArr(from, to) {
	return rangeDate(from, to)
		.toArray()
		.map(d => d.toDateMysqlFormat());
}

function doneJob(job, data) {
	delete runningOTA[job.ota];

	data = data || { done: true };

	models.JobPricing.updateOne({ _id: job._id }, { $inc: { numRun: 1 }, $set: data }).catch(e => {
		logger.error(e);
	});
}

async function validateJob(job, priceHistory) {
	let isValid = true;
	let chunks;

	if (isValid) {
		const today = new Date().zeroHours();
		if (priceHistory.to < today) {
			isValid = false;
		} else {
			if (priceHistory.from < today) priceHistory.from = today;
			const daysOfWeek =
				priceHistory.daysOfWeek && priceHistory.daysOfWeek.length ? priceHistory.daysOfWeek : null;

			if (daysOfWeek) {
				isValid = getDayOfRange(priceHistory.from, priceHistory.to).some(day =>
					daysOfWeek.includes(String(day + 1))
				);
			}
		}
	}

	if (isValid && !job.force) {
		const filter = {
			blockId: priceHistory.blockId,
			roomTypeId: priceHistory.roomTypeId,
			ratePlanId: priceHistory.ratePlanId,
			serviceType: priceHistory.serviceType,
			createdAt: { $gt: priceHistory.createdAt },
			from: { $lte: priceHistory.to },
			to: { $gte: priceHistory.from },
			otas: job.ota,
			daysOfWeek: { $all: priceHistory.daysOfWeek },
		};

		const newerHistories = await models.PriceHistory.find(filter).select('from to').sort({ createdAt: -1 });
		if (newerHistories.length) {
			const availableDates = _.difference(
				rangeToArr(priceHistory.from, priceHistory.to),
				...newerHistories.map(h => rangeToArr(h.from, h.to))
			);

			if (availableDates.length) {
				chunks = groupDates(availableDates.map(d => new Date(d).zeroHours()));
			} else {
				isValid = false;
			}
		}
	}

	if (!isValid) {
		doneJob(job);
	}

	return [isValid, chunks];
}

async function findSyncRefPrices({ otaListing, ratePlanId, price, blockId, listingId }) {
	const otherRefsSync = [];

	const otherRates = _.filter(otaListing.rates, r => r.ratePlanId !== ratePlanId);
	if (!otherRates.length) return otherRefsSync;

	const refRatePlans = await models.RatePlan.findChildRates({
		_id: { $in: _.map(otherRates, 'ratePlanId') },
		'ref.ratePlanId': ratePlanId,
	});
	if (!refRatePlans.length) return otherRefsSync;

	const filteredOtherRates = otherRates.filter(r => refRatePlans.some(rp => rp._id === r.ratePlanId));
	if (!filteredOtherRates.length) return otherRefsSync;

	const frateIds = _.compact(_.map(filteredOtherRates, 'rateId'));

	const refOTARates = frateIds.length
		? await models.Rate.find({
				blockId,
				otaName: otaListing.otaName,
				rateId: { $in: frateIds },
		  })
		: [];

	_.values(_.groupBy(filteredOtherRates, 'ratePlanId')).forEach(rrates => {
		const rateIds = refOTARates.length
			? rrates.filter(
					r =>
						refOTARates.some(re => re.rateId === r.rateId && re.isOtaChildRate === false) ||
						!refOTARates.some(re => re.rateId === r.rateId)
			  )
			: rrates;

		if (!rateIds.length) return;

		const rratePlanId = rateIds[0].ratePlanId;
		const refRatePlan = refRatePlans.find(r => r._id === rratePlanId);
		if (!refRatePlan) return;

		otherRefsSync.push({
			ratePlanId: rratePlanId,
			rateIds: _.compact(_.map(rateIds, 'rateId')),
			rates: rateIds,
			price: refRatePlan.calcRefPrice(price),
			otaListing,
			listingId: _.toString(listingId),
		});
	});

	return otherRefsSync;
}

async function findRefListingRates({ blockId, roomTypeId, ratePlanId, price, otaListing, listingId }) {
	const otherRefsSync = [];

	const otherListings = await models.Listing.find({
		_id: { $ne: listingId },
		blockId,
		roomTypeId,
		OTAs: {
			$elemMatch: {
				active: true,
				otaName: otaListing.otaName,
				otaListingId: { $ne: otaListing.otaListingId },
			},
		},
	}).select('OTAs blockId');

	if (otherListings.length) {
		await otherListings.asyncMap(async listing => {
			const cotaListing = listing.getOTA(otaListing.otaName);
			if (!cotaListing) return;

			const otherListingRefs = await findSyncRefPrices({
				otaListing: cotaListing,
				ratePlanId,
				price,
				blockId,
				listingId: listing._id,
			});

			otherRefsSync.push(...otherListingRefs);
		});
	}

	return otherRefsSync;
}

async function syncPriceJob(job) {
	const otaName = job.ota;
	if (runningOTA[otaName]) return;

	try {
		const priceHistory = await models.PriceHistory.findById(job.priceId).lean();

		const [isValid, chunks] = await validateJob(job, priceHistory);
		if (!isValid) return;

		runningOTA[otaName] = true;

		const {
			roomTypeId,
			ratePlanId,
			price,
			priceFirstHours,
			// promotionPriceFirstHours,
			priceAdditionalHours,
			// promotionPriceAdditionalHours,
		} = priceHistory;

		if (priceHistory.timeStart && priceHistory.isBasicPrice) {
			models.BlockCalendar.syncPriceCalendar(priceHistory);
		}

		const listings = await models.Listing.find({
			roomTypeId,
			OTAs: {
				$elemMatch: {
					active: true,
					otaName,
					'rates.ratePlanId': ratePlanId,
				},
			},
		}).select('blockId rateIds OTAs roomTypeId');

		const params = {
			syncId: job._id.toString(),
			otaName,
			price,
			priceFirstHours,
			// promotionPriceFirstHours,
			priceAdditionalHours,
			// promotionPriceAdditionalHours,
			ratePlanId,
			roomTypeId,
		};

		await listings.asyncMap(async listing => {
			const otaListing = listing.getOTA(otaName);

			const lisitingParams = {
				...params,
				otaListing,
				listing,
				listingId: listing._id.toString(),
			};

			const otaRates = _.filter(otaListing.rates, r => r.ratePlanId === ratePlanId);
			if (!otaRates.length) {
				logger.error('syncPrice not found rates -> otaName, priceHistoryId', otaName, priceHistory._id);
				return;
			}

			const rateIds = _.compact(_.map(otaRates, 'rateId'));

			lisitingParams.rates = otaRates;
			lisitingParams.rateIds = rateIds;
			lisitingParams.propertyId = await models.Block.getPropertyIdOfABlock(
				listing.blockId,
				otaName,
				otaListing.account
			);

			const otherRefsSync = [
				...(await findSyncRefPrices({
					otaListing,
					ratePlanId,
					price,
					blockId: listing.blockId,
					listingId: listing._id,
				})),
				...(await findRefListingRates({
					otaListing,
					ratePlanId,
					price,
					blockId: listing.blockId,
					listingId: listing._id,
					roomTypeId,
				})),
			];

			if (chunks) {
				return chunks.asyncMap(async ([from, to]) => {
					const cDaysOfWeek = getDayOfRange(from, to).map(day => String(day + 1));
					const daysOfWeek = _.intersection(priceHistory.daysOfWeek, cDaysOfWeek);
					if (!daysOfWeek.length) return;

					await synchronizePrices({
						...lisitingParams,
						from,
						to,
						daysOfWeek,
					});

					if (otherRefsSync.length) {
						await otherRefsSync.asyncForEach(otherRefSync =>
							synchronizePrices({
								...lisitingParams,
								...otherRefSync,
								from,
								to,
								daysOfWeek,
							})
						);
					}
				});
			}

			await synchronizePrices({
				...lisitingParams,
				from: priceHistory.from,
				to: priceHistory.to,
				daysOfWeek: priceHistory.daysOfWeek,
			});

			if (otherRefsSync.length) {
				await otherRefsSync.asyncForEach(otherRefSync =>
					synchronizePrices({
						...lisitingParams,
						...otherRefSync,
						from: priceHistory.from,
						to: priceHistory.to,
						daysOfWeek: priceHistory.daysOfWeek,
					})
				);
			}
		});

		if (synchronize[otaName] && synchronize[otaName].synchronizePriceDone) {
			await synchronize[otaName].synchronizePriceDone(job._id.toString());
		}

		doneJob(job, { done: true });
	} catch (e) {
		logger.error('syncPriceJob', e);
		doneJob(job, { done: false });
	}
}

let isGetting = false;

async function priceJob() {
	try {
		if (isGetting) return;

		isGetting = true;

		const jobs = await models.JobPricing.aggregate()
			.match({
				done: false,
				numRun: { $lte: MAX_RUN_SYNC_PRICE },
				ota: { $nin: _.keys(runningOTA) },
				$or: [
					{
						timeStart: null,
					},
					{
						timeStart: { $lte: new Date() },
					},
				],
			})
			.sort({ createdAt: 1 })
			.group({
				_id: '$ota',
				job: { $first: '$$ROOT' },
			});

		isGetting = false;

		await jobs.asyncMap(j => syncPriceJob(j.job));
	} catch (e) {
		isGetting = false;
		logger.error('priceJob', e);
	}
}

async function retryPricingTasks() {
	try {
		const today = moment().startOf('date').toDate();
		await models.JobPricing.updateMany(
			{
				createdAt: { $gte: today },
				done: false,
				numRun: { $gte: MAX_RUN_SYNC_PRICE },
			},
			{
				numRun: 0,
			}
		);
	} catch (e) {
		logger.error('retryPricingTasks', e);
	}
}

async function syncLocalPrice() {
	try {
		const localOTAs = Object.values(LocalOTAs);

		const listings = await models.Listing.find({
			OTAs: {
				$elemMatch: {
					active: true,
					otaName: { $in: localOTAs },
					'rates.0': { $exists: true },
				},
			},
		})
			.select('OTAs roomTypeId')
			.lean();

		const from = new Date();
		const to = moment().add(DAY_TO_RESYNC, 'day').toDate();

		const roomRates = [];

		listings.forEach(lising => {
			lising.OTAs.forEach(ota => {
				if (!localOTAs.includes(ota.otaName) || !ota.rates || !ota.rates.length) return;

				ota.rates.forEach(rate => {
					roomRates.push({
						roomTypeId: lising.roomTypeId,
						ratePlanId: rate.ratePlanId,
					});
				});
			});
		});

		await _.uniqBy(roomRates, r => `${r.roomTypeId}${r.ratePlanId}`).asyncForEach(roomRate => {
			return models.CozrumPrice.calcPromotionPrice({
				roomTypeId: roomRate.roomTypeId,
				ratePlanId: roomRate.ratePlanId,
				from,
				to,
			}).catch(e => {
				logger.error('calcPromotionPrice', roomRate, e);
			});
		});
	} catch (e) {
		logger.error('runPriceAuto error', e);
	}
}

schedule.scheduleJob('*/1 * * * * *', priceJob);
schedule.scheduleJob('22 */1 * * *', retryPricingTasks);
schedule.scheduleJob('0 4 * * *', syncLocalPrice);

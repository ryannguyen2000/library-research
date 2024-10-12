const _ = require('lodash');
const schedule = require('node-schedule');

const { OTAs, LocalOTA, OTAHasGeniusPromotion } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const APIs = require('@controllers/promotion/otas');

const MAX_RETRY = 3;
const RUNNING_TASKS = {};
const TIMEOUT = 5 * 60 * 1000;

const OTANames = Object.values(OTAs).filter(o => APIs[o] || o.startsWith(LocalOTA));

async function getGroupData(promotion, operrator, otas, taskBlockId, jobRatePlanIds) {
	if (!otas || otas.length === 0) {
		otas = promotion.activeOTAs || OTANames;
	}

	const promotionId = promotion._id;

	otas = otas.filter(ota => OTANames.includes(ota) && promotion.data && promotion.activeOTAs.includes(ota));

	const query = taskBlockId ? { promotionId, blockId: taskBlockId } : { promotionId };
	const promotionBlocks = await models.PromotionBlocks.find(query);

	if (!promotionBlocks.length && operrator === 'clear') {
		const otaIds = _.filter(promotion.otaIds, otaId => otas.includes(otaId.ota) && otaId.meta);
		if (!otaIds.length) {
			return [];
		}

		const groups = await otaIds.asyncMap(async otaId => {
			const group = {
				// blockId,
				account: otaId.account,
				propertyId: otaId.propertyId,
				otaName: otaId.ota,
				otaListingIds: otaId.meta.listingIds || [],
				rateIds: otaId.meta.rateIds || [],
				ratePlanIds: otaId.meta.ratePlanIds || [],
				// roomTypeIds,
			};

			if (otaId.propertyId) {
				const block = await models.Block.findOne({
					active: true,
					isProperty: true,
					isTest: false,
					OTAProperties: {
						$elemMatch: {
							otaName: otaId.ota,
							propertyId: otaId.propertyId,
						},
					},
				}).select('_id');
				if (block) {
					group.blockId = block._id;
				}
			} else if (group.otaListingIds) {
				const listing = await models.Listing.findOne({
					OTAs: {
						$elemMatch: _.pickBy({
							active: true,
							otaName: otaId.ota,
							otaListingId: { $in: group.otaListingIds },
							account: otaId.account,
						}),
					},
				}).select('blockId');
				if (listing) {
					group.blockId = listing.blockId;
				}
			}

			return [group];
		});

		return groups;
	}

	const geniusFilter = {};
	if (OTAHasGeniusPromotion.includes(otas[0])) {
		geniusFilter['OTAs.genius'] = promotion.genius ? true : { $ne: true };
	}

	const array = await promotionBlocks.asyncMap(async ({ blockId, ratePlanIds, roomTypeIds }) => {
		// let isClearRateAndRoom = false;

		if (ratePlanIds.length === 0) {
			// isClearRateAndRoom = true;
			ratePlanIds = jobRatePlanIds;
		}

		const filter = {
			blockId,
			OTAs: {
				$elemMatch: {
					active: true,
					otaName: { $in: otas },
					'rates.ratePlanId': { $in: ratePlanIds },
				},
			},
		};

		if (roomTypeIds && roomTypeIds.length) {
			filter.roomTypeId = { $in: roomTypeIds };
		} else {
			const promotionRulesetBlock = await models.PromotionRuleSetBlocks.findOne({
				blockId,
				promotionIds: promotionId,
			}).select('roomTypeIds');

			if (promotionRulesetBlock && promotionRulesetBlock.roomTypeIds.length) {
				filter.roomTypeId = { $in: promotionRulesetBlock.roomTypeIds };
			}
		}

		// get room type / listing id from rates
		const listings = await models.Listing.aggregate([
			{
				$match: filter,
			},
			{ $unwind: '$OTAs' },
			{
				$match: {
					'OTAs.active': true,
					'OTAs.otaName': { $in: otas },
					'OTAs.rates.ratePlanId': { $in: ratePlanIds },
					...geniusFilter,
					// 'OTAs.genius': genius,
				},
			},
			{ $unwind: '$OTAs.rates' },
			{
				$match: {
					'OTAs.rates.ratePlanId': { $in: ratePlanIds },
				},
			},
			{
				$project: {
					rateId: '$OTAs.rates.rateId',
					ratePlanId: '$OTAs.rates.ratePlanId',
					otaName: '$OTAs.otaName',
					account: '$OTAs.account',
					otaListingId: '$OTAs.otaListingId',
					secondaryId: '$OTAs.secondaryId',
					roomTypeId: '$roomTypeId',
				},
			},
		]);

		const data = await listings.asyncMap(async listing => {
			if (listing.otaName === OTAs.Agoda) {
				[listing.propertyId] = listing.otaListingId.split(',');
			} else {
				listing.propertyId = await models.Block.getPropertyIdOfABlock(
					blockId,
					listing.otaName,
					listing.account
				);
			}

			return {
				...listing,
				blockId,
				promotionId,
			};
		});

		return _.chain(data)
			.groupBy(v => `${v.account}|${v.otaName}|${v.promotionId}`)
			.values()
			.map(groupValues => ({
				...groupValues[0],
				otaListingIds: _.chain(groupValues).map('otaListingId').uniq().compact().value(),
				rateIds: _.chain(groupValues).map('rateId').uniq().compact().value(),
				ratePlanIds: _.chain(groupValues).map('ratePlanId').uniq().compact().value(),
				roomTypeIds: _.chain(groupValues).map('roomTypeId').uniqBy(_.toString).compact().value(),
			}))
			.value();
	});

	const data = _.chain(array).flatten().uniqWith(_.isEqual).value();
	const groupdata = _.groupBy(data, v => `${v.account}|${v.otaName}`);

	Object.keys(groupdata).forEach(k => {
		groupdata[k] = groupdata[k].reduce((arr, v) => {
			const result = arr.find(info => _.isEqual(info.otaListingIds, v.otaListingIds));
			if (result && result.rateIds) {
				result.rateIds = _.uniq(result.rateIds.concat(v.rateIds));
				result.ratePlanIds = _.uniq(result.ratePlanIds.concat(v.ratePlanIds));
				result.roomTypeIds = _.uniqBy(result.roomTypeIds.concat(v.roomTypeIds), _.toString());
			} else {
				arr.push(v);
			}
			return arr;
		}, []);
	});

	return _.values(groupdata);
}

async function clearPromotionOTA({ promotion, blockId, account, ratePlanIds }) {
	const filter = _.pickBy({
		promotionId: promotion._id,
		blockId,
	});

	const promotionBlock = await models.PromotionBlocks.findOne(filter);
	const newRatePlanIds = _.differenceBy(_.get(promotionBlock, 'ratePlanIds', []), ratePlanIds, _.toString);
	const update = {};

	if (promotionBlock && newRatePlanIds.length) {
		promotionBlock.ratePlanIds = newRatePlanIds;
		await promotionBlock.save();
	} else {
		await models.PromotionBlocks.deleteOne(filter);
		update.$pull = { promotionIds: promotion._id };
	}

	if (!_.isEmpty(update)) {
		await models.PromotionRuleSetBlocks.updateMany({ blockId, promotionIds: promotion._id }, update);
	}

	await models.PromotionRuleSet.updateMany(
		{
			promotions: {
				$elemMatch: {
					...filter,
				},
			},
		},
		{
			$pull: {
				promotions: {
					...filter,
					account,
				},
			},
		}
	);
}

async function executeJob(group, promotion, operrator) {
	const promotionId = promotion._id;

	for (const info of group) {
		const { blockId, propertyId, account, otaListingIds, otaName, rateIds, ratePlanIds, roomTypeIds } = info;

		let isCreated = false;
		let meta;

		const moduleOTAName = otaName.startsWith(LocalOTA) ? LocalOTA : otaName;
		const moduleAPI = APIs[moduleOTAName];

		const [otaInfo] = await models.OTAManager.findByName(otaName, account);

		// check create new ota promotion
		if (!meta) {
			const currentPromotion = await models.Promotion.findById(promotionId);
			if (currentPromotion) {
				meta = currentPromotion.getMetadata(otaName, account, propertyId);
			}
		}

		if (operrator !== 'clear' && moduleAPI.create && !meta) {
			({ meta } = await moduleAPI.create({
				otaInfo,
				data: promotion.data,
				propertyId,
				listingIds: otaListingIds,
				rateIds,
				ratePlanIds,
				roomTypeIds,
				promotion,
			}));
			// push new meta
			if (meta) {
				isCreated = true;
				await models.Promotion.createMeta(promotionId, meta, otaName, account, propertyId);
			}
		}

		if (!meta) {
			if (operrator === 'clear') {
				await clearPromotionOTA({ promotion, blockId, otaName, account, ratePlanIds });
			}

			logger.warn('Promotion job not found meta', promotion._id);
			return;
		}

		if (!moduleAPI || !moduleAPI[operrator]) {
			logger.warn('Promotion not found operrator', promotion._id, operrator);
			return;
		}

		if (!isCreated) {
			// set promotion
			({ meta } = await moduleAPI[operrator]({
				otaInfo,
				propertyId,
				listingIds: otaListingIds,
				rateIds,
				ratePlanIds,
				roomTypeIds,
				data: promotion.data,
				meta,
				start: new Date(promotion.startDate),
				end: new Date(promotion.endDate),
				promotion,
			}));
			// update promotion
			if (meta) {
				logger.info('update meta', promotionId, otaName, account, propertyId);
				await models.Promotion.updateMeta(promotionId, meta, otaName, account, propertyId);
			}
		}

		if (operrator === 'clear') {
			if (!meta) {
				logger.info('remove meta', promotionId, otaName, account, propertyId);
				await models.Promotion.removeMeta(promotionId, otaName, account, propertyId);
			}
			await clearPromotionOTA({ promotion, blockId, otaName, account, ratePlanIds });
		}
	}
}

/**
 * apply promotion
 * @param {string} promotionId
 * @param {string[]} rooms
 * @param {string} operrator 'set' or 'clear'
 */
async function execute(promotionId, operrator = 'set', otas = null, block, ratePlanIds) {
	const promotion = await models.Promotion.findById(promotionId);
	if (!promotion) {
		logger.error('Promotion is not exists', promotionId);
		return;
	}

	if (!promotion.active && operrator !== 'clear') {
		logger.warn('Promotion is not active', promotionId);
		return;
	}

	const groups = await getGroupData(promotion, operrator, otas, block, ratePlanIds);

	logger.info('JobPromotion: ->', promotionId, operrator, String(otas), groups.length);

	return await groups.asyncMap(group => executeJob(group, promotion, operrator));
}

function createJob(otaName) {
	async function fn() {
		const task = await models.JobPromotion.findOne({
			_id: { $nin: _.keys(RUNNING_TASKS).toMongoObjectIds() },
			done: false,
			'otas.otaName': otaName,
			numRun: { $lt: MAX_RETRY },
		}).sort({
			numRun: 1,
			updatedAt: 1,
		});
		if (!task) return;

		try {
			RUNNING_TASKS[task._id] = true;

			const { promotionId, operrator, blockId, ratePlanIds } = task;
			const otas = task.otas.map(o => o.otaName);

			await execute(promotionId, operrator, otas, blockId, ratePlanIds);

			task.done = true;
		} catch (err) {
			logger.error(err);
		} finally {
			delete RUNNING_TASKS[task._id];

			task.numRun += 1;

			await task.save();
		}
	}

	let doing = false;

	async function main() {
		if (doing) return;

		doing = true;

		const id = setTimeout(() => {
			logger.error('Promotion job timeout', otaName);
			doing = false;
		}, TIMEOUT);

		await fn().catch(err => {
			logger.error('Promotion job', otaName, err);
		});

		clearTimeout(id);
		doing = false;
	}

	return main;
}

// async function smartJob() {
// 	const rulesets = await models.PromotionRuleSet.find({ 'airbnb.pricing_rules.smart': true }).select('_id');
// 	if (!rulesets.length) return;

// 	const { updatePromotionRuleSetBlock } = require('./promotionRuleSetBlock.controller');

// 	await rulesets.asyncForEach(async ruleset => {
// 		const rulesetBlocks = await models.PromotionRuleSetBlocks.find({ rulesetId: ruleset._id });

// 		await rulesetBlocks.asyncForEach(async rulesetBlock => {
// 			await updatePromotionRuleSetBlock(rulesetBlock);
// 			await Promise.delay(5000);
// 		});
// 	});
// }

OTANames.forEach(otaName => {
	schedule.scheduleJob('*/2 * * * * *', createJob(otaName));
});

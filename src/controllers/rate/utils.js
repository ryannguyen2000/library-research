// const _ = require('lodash');
const { Services } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');

async function updateRateLink(rateId, listingIds) {
	// unlink
	await models.Listing.updateMany({ _id: { $nin: listingIds }, rateIds: rateId }, { $pull: { rateIds: rateId } });

	// new link
	await models.Listing.updateMany({ _id: { $in: listingIds } }, { $addToSet: { rateIds: rateId } });
}

async function addOrUpdateRate(filter, data, listingIds) {
	data.serviceType = data.serviceType || Services.Day;
	delete data._id;

	const doc = await models.Rate.findOneAndUpdate(
		filter,
		{
			$set: data,
		},
		{ upsert: true, new: true }
	);

	await updateRateLink(doc._id, listingIds);

	return doc;
}

async function removeRate(filter) {
	const rate = await models.Rate.findOne(filter);
	if (!rate) return;

	const rateId = rate._id;

	await models.Listing.updateMany(
		{
			blockId: filter.blockId,
			rateIds: rateId,
			OTAs: {
				$elemMatch: {
					otaName: rate.otaName,
					rates: {
						$elemMatch: {
							rateId: rate.rateId,
						},
					},
				},
			},
		},
		{
			$set: {
				'OTAs.$[].rates.$[rate].rateId': null,
			},
		},
		{ arrayFilters: [{ 'rate.rateId': rate.rateId }] }
	);

	await models.Listing.updateMany({ blockId: filter.blockId, rateIds: rateId }, { $pull: { rateIds: rateId } });

	await models.Rate.deleteOne({ _id: rateId });

	logger.warn('Remove rate', rate.otaName, rateId, rate.rateId);
}

// async function generateRatesForListing(listing) {
// 	const OTAInfo = listing.OTAs;

// 	const { otaName, otaListingId, account, serviceTypes = [] } = OTAInfo;

// 	const hasGenius = OTAHasGeniusPromotion.includes(otaName);
// 	const ota = _.capitalize(otaName);

// 	const items = [];

// 	if (serviceTypes.includes(Services.Day)) {
// 		items.push({
// 			rateId: otaListingId,
// 			name: _.compact([`${ota} Rate`, listing.name]).join(' - '),
// 			serviceType: Services.Day,
// 		});
// 		if (hasGenius) {
// 			items.push({
// 				genius: true,
// 				rateId: `${otaListingId},1234`,
// 				name: _.compact([`${ota} Rate`, listing.name, 'Genius']).join(' - '),
// 				serviceType: Services.Day,
// 			});
// 		}
// 	}

// 	if (serviceTypes.includes(Services.Hour)) {
// 		items.push({
// 			rateId: `${otaListingId},5`,
// 			name: _.compact([`${ota} Rate`, listing.name, 'Bán giờ']).join(' - '),
// 			serviceType: Services.Hour,
// 		});
// 	}

// 	const rates = await items.asyncMap(obj => {
// 		const filter = {
// 			blockId: listing.blockId,
// 			rateId: obj.rateId,
// 			otaName,
// 			// account,
// 		};
// 		const data = {
// 			...obj,
// 			[otaName]: {
// 				rateId: obj.rateId,
// 				account,
// 			},
// 		};

// 		return addOrUpdateRate(filter, data, [listing._id]);
// 	});

// 	return rates;
// }

// async function syncRatesForNotHaveRatePlanOTA(blockId, otaName) {
// 	const listings = await models.Listing.aggregate([
// 		{
// 			$match: {
// 				blockId,
// 			},
// 		},
// 		{
// 			$unwind: '$OTAs',
// 		},
// 		{
// 			$match: {
// 				'OTAs.active': true,
// 				'OTAs.otaName': _.pickBy({ $in: OTANotHaveRatePlan, $eq: otaName }),
// 			},
// 		},
// 		{
// 			$project: {
// 				_id: 1,
// 				blockId: 1,
// 				name: 1,
// 				OTAs: 1,
// 			},
// 		},
// 		{
// 			$sort: {
// 				'OTAs.otaName': 1,
// 				'OTAs.account': 1,
// 			},
// 		},
// 	]);

// 	const listingRates = [];

// 	await listings.asyncForEach(async listing => {
// 		const rates = await generateRatesForListing(listing);
// 		listingRates.push(...rates);
// 	});

// 	return {
// 		listingRates,
// 	};
// }

module.exports = {
	addOrUpdateRate,
	// syncRatesForNotHaveRatePlanOTA,
	removeRate,
};

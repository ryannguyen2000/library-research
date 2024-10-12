const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const models = require('@models');
const { addOrUpdateRate, removeRate } = require('@controllers/rate/utils');
const { changeHotelSession } = require('@controllers/ota_api/headers/traveloka');

async function fetchRates({ propertyId, otaConfig }) {
	const uri =
		'https://astiapi-public.ast.traveloka.com/api/v1/rate-structure/rate-plans?order=desc&limit=100&offset=0';

	await changeHotelSession(otaConfig, propertyId);

	const response = await fetchRetry(
		uri,
		{
			method: 'GET',
			redirect: 'manual',
		},
		otaConfig
	);

	const result = await response.json();

	const rates = _.get(result, 'data.ratePlans');

	return rates;
}

async function addRate(rate, blockId, otaName, account) {
	const rateId = _.toString(rate.id);

	const filter = {
		blockId,
		otaName,
		rateId,
	};

	if (!rate.active) {
		await removeRate(filter);
		return null;
	}

	const otaRateData = {
		otaRateName: rate.name,
		isOtaChildRate: rate.type.type === 'DERIVED',
		isExpired: false,
		isDefault: false,
	};

	const name = `${_.capitalize(otaName)} Rate - ${rate.name} (${rateId})`;

	const updateData = {
		...filter,
		...otaRateData,
		[otaName]: { account, rateId },
		name,
		otaName,
		rateId,
		account,
	};

	const otaListingIds = _.map(rate.roomAssignment.roomIds, _.toString);

	const listings = otaListingIds.length
		? await models.Listing.find({
				blockId,
				OTAs: { $elemMatch: { otaListingId: { $in: otaListingIds }, active: true, otaName } },
		  }).select('_id')
		: [];

	if (!listings.length) {
		await removeRate(filter);
		return null;
	}

	const listingIds = listings.map(l => l._id);

	logger.info('RATE: Traveloka -> name', name, listingIds);

	return addOrUpdateRate(filter, updateData, listingIds);
}

async function crawlAndGenerateRates(blockId, otaName, account) {
	const [otaConfig] = await models.OTAManager.findByName(otaName, account);
	if (!otaConfig) return;

	const propertyId = await models.Block.getPropertyIdOfABlock(blockId, otaName, account);
	if (!propertyId) return;

	const rates = await fetchRates({ propertyId, account, otaConfig });

	const travelokaRates = await rates.asyncMap(async rate => {
		return [
			await addRate(rate, blockId, otaName, account),
			...(await rate.children.asyncMap(childRate => addRate(childRate, blockId, otaName, account))),
		];
	});

	return _.compact(_.flatten(travelokaRates));
}

module.exports = {
	crawlAndGenerateRates,
};

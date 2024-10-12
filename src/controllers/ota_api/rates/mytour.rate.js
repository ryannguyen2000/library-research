const _ = require('lodash');
const { logger } = require('@utils/logger');
const fetchRetry = require('@utils/fetchRetry');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { addOrUpdateRate, removeRate } = require('@controllers/rate/utils');

async function crawlBookingRates({ propertyId, otaConfig }) {
	const url = `https://gate.tripi.vn/hms-premium/hotels/rate-plans/list?hotelId=${propertyId}&pageOffset=0&pageSize=50`;

	const data = await fetchRetry(
		url,
		{
			method: 'POST',
			body: '{"term":null,"rateTypeIds":null}',
		},
		otaConfig
	).then(res => res.json());

	const rs = _.get(data, 'data.items');
	if (!rs) {
		throw new ThrowReturn(`Get Rates Plan of Mytour(${propertyId}) Error`);
	}

	return rs;
}

async function crawlAndGenerateRates(blockId, otaName, account) {
	const [otaConfig] = await models.OTAManager.findByName(otaName, account);
	if (!otaConfig) return;

	const propertyId = await models.Block.getPropertyIdOfABlock(blockId, otaName, account);
	if (!propertyId) return;

	const rates = await crawlBookingRates({ propertyId, otaConfig });
	const ota = otaName[0].toUpperCase() + otaName.slice(1);

	const results = await rates.syncMap(async rate => {
		const rateId = rate.id;

		const otaRateData = {
			otaRateName: rate.name,
			isOtaChildRate: false,
			isExpired: false,
			isDefault: true,
		};

		const name = `${ota} Rate - ${rate.name} (${rateId})`;
		const filter = {
			blockId,
			otaName,
			rateId,
		};
		const updateData = {
			...filter,
			...otaRateData,
			[otaName]: { account, rateId },
			name,
			otaName,
			rateId,
			account,
		};

		const listings = await models.Listing.find({
			blockId,
			OTAs: {
				$elemMatch: {
					otaListingId: {
						$in: rate.rooms.map(r => r.id.toString()),
					},
					active: true,
					otaName,
				},
			},
		}).select('_id');

		if (!listings.length) {
			await removeRate(filter);
			return null;
		}

		const listingIds = listings.map(l => l._id);
		logger.info(`RATE: ${ota} -> name`, name, listingIds);
		return addOrUpdateRate(filter, updateData, listingIds);
	});

	return _.compact(results);
}

module.exports = {
	crawlAndGenerateRates,
};

const mongoose = require('mongoose');
const _ = require('lodash');

const { logger } = require('@utils/logger');
const { AsyncOne } = require('@utils/async');
const OTAHeaders = require('@controllers/ota_api/headers');
const { getHeader, sendExtRequest, sendCustomRequest } = require('@services/webExtension');

const asyncOne = new AsyncOne();

function getHeadersData(accountData) {
	const { name: otaName, username, account } = accountData;

	return asyncOne.acquire(`${otaName}_${username}`, async () => {
		try {
			if (OTAHeaders && OTAHeaders[otaName] && OTAHeaders[otaName].getHeaders) {
				logger.info('HEADER: getHeader from api -> ', otaName, account, username);

				const data = await OTAHeaders[otaName].getHeaders(accountData);
				if (data.error_code === undefined) {
					return data;
				}
			}

			const data = await getHeader(accountData);
			return data;
		} catch (e) {
			logger.error('get header error', otaName, username, e);
		}
	});
}

async function updateOTAConfig(otaConfig) {
	const headers = await getHeadersData(otaConfig);

	// update cookie
	if (headers && headers.error_code === undefined) {
		otaConfig.cookie = headers.data.cookie;
		otaConfig.token = headers.data.token;
		otaConfig.other = { ...(otaConfig.other || null), ...(headers.data.other || null), updatedAt: new Date() };

		await mongoose.model('OTAManager').updateMany(
			{ name: otaConfig.name, username: otaConfig.username },
			{
				cookie: otaConfig.cookie,
				token: otaConfig.token,
				other: otaConfig.other,
			}
		);
	}

	return otaConfig;
}

async function getOTAFromListing(otaName, otaListingId) {
	const listing =
		otaListingId &&
		(mongoose.Types.ObjectId.isValid(otaListingId)
			? await mongoose.model('Listing').findById(otaListingId)
			: await mongoose.model('Listing').findListingByOTA(otaName, otaListingId));

	const account = listing && _.get(listing.getOTA(otaName), 'account');

	const propertyId =
		listing &&
		listing.blockId &&
		account &&
		(await mongoose.model('Block').getPropertyIdOfABlock(listing.blockId, otaName, account));

	const otaInfo = await mongoose.model('OTAManager').findOne(
		_.pickBy({
			name: otaName,
			active: true,
			account,
		})
	);

	if (!otaInfo) {
		return {};
	}

	return { otaInfo, propertyId };
}

module.exports = {
	updateOTAConfig,
	getOTAFromListing,
	sendExtRequest,
	sendCustomRequest,
};

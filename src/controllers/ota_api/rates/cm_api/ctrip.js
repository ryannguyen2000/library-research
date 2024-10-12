const _ = require('lodash');
// const xml2js = require('xml2js');

const ThrowReturn = require('@core/throwreturn');
const fetchDebugerApi = require('@utils/fetchDebugerApi');
const { logger } = require('@utils/logger');

const models = require('@models');
const { addOrUpdateRate, removeRate } = require('@controllers/rate/utils');

const getRequestXML = (timeStamp, userName, password, codeContext, propertyId) => {
	logger.info('Generate request XML with', { userName, password, codeContext, propertyId });
	return `<OTA_HotelProductRQ Version="4.0" PrimaryLangID="en-us" TimeStamp="${timeStamp}" 
	xmlns="http://www.opentravel.org/OTA/2003/05">
			<POS>
				<Source>
					<RequestorID ID="${userName}" Type="1" MessagePassword="${password}">
						<CompanyName Code="C" CodeContext="${codeContext}" />
					</RequestorID>
				</Source>
			</POS>
				<HotelProducts>
					<HotelProduct HotelCode="${propertyId}" />
				</HotelProducts>
	</OTA_HotelProductRQ>`;
};

async function getHotelProducts({ propertyId, otaConfig }) {
	const url = `${otaConfig.other.url}/OTA_HotelProduct`;
	const timeStamp = new Date().toISOString();

	const requestXml = getRequestXML(
		timeStamp,
		otaConfig.other.connectivityUserName,
		otaConfig.other.connectivityPassword,
		otaConfig.other.codeContext,
		propertyId
	);
	const data = await fetchDebugerApi(
		url,
		{
			method: 'POST',
			body: requestXml,
			headers: { 'Content-Type': 'application/xml' },
		},
		{ otaConfig, responseElement: 'OTA_HotelProductRS' }
	);
	logger.info('Ctrip.com response products retrieval ', JSON.stringify(data, null, 4));
	// const xmlResponse = await response.text();
	// const parser = new xml2js.Parser();
	// const data = await parser.parseStringPromise(xmlResponse);
	if (data.OTA_HotelProductRS.Errors) {
		const shortText = _.get(data, 'OTA_HotelProductRS.Errors[0].Error[0].$.ShortText', 'Error');
		throw new ThrowReturn(shortText);
	}

	const hotelProducts = _.get(data, 'OTA_HotelProductRS.HotelProducts[0].HotelProduct');

	return hotelProducts;
}

async function crawlAndGenerateRates(blockId, otaName, account, otaConfig, propertyId) {
	if (!otaConfig.other.connectivityUserName || !otaConfig.other.connectivityPassword) {
		logger.error('CM_API Ctrip Username or Password can not find !');
	}
	const hotelProducts = await getHotelProducts({ propertyId, otaConfig });

	const ratePlans = _.flatMap(hotelProducts, item => _.flatMap(item.RatePlans, ratePlan => ratePlan.RatePlan));

	const rates = await _.uniqBy(ratePlans, '$.RatePlanCode').asyncMap(async ratePlan => {
		const rateId = _.get(ratePlan, '$.RatePlanCode');
		const ratePlanName = _.get(ratePlan, '$.RatePlanName');

		const otaRateData = {
			otaRateName: ratePlanName,
			isOtaChildRate: false,
			isExpired: false,
			isDefault: true,
		};
		const name = `${otaName} Rate - ${ratePlanName} (${rateId})`;
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

		const roomTypes = _.filter(hotelProducts, h => {
			return _.some(
				_.isArray(h.RatePlans) ? h.RatePlans : [h.RatePlans],
				r => _.get(r, 'RatePlan[0].$.RatePlanCode') === rateId || _.get(r, 'RatePlan.$.RatePlanCode') === rateId
			);
		});

		const otaListingIds = _.map(
			roomTypes,
			item =>
				_.get(item.RoomTypes, 'RoomType.$.RoomTypeCode') ||
				_.get(item.RoomTypes, 'RoomType[0].$.RoomTypeCode') ||
				_.get(item.RoomTypes, '[0].RoomType.$.RoomTypeCode') ||
				_.get(item.RoomTypes, '[0].RoomType[0].$.RoomTypeCode')
		);

		const listings = await models.Listing.find({
			blockId,
			OTAs: {
				$elemMatch: {
					otaListingId: { $in: otaListingIds },
					active: true,
					otaName,
				},
			},
		});

		if (!listings.length) {
			await removeRate(filter);
			return null;
		}

		const listingIds = listings.map(l => l._id);
		logger.info('RATE:', otaName, name, listingIds);

		return addOrUpdateRate(filter, updateData, listingIds);
	});

	return rates.filter(rate => rate !== null);
}

module.exports = {
	crawlAndGenerateRates,
};

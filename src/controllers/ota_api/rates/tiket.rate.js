const _ = require('lodash');
const { v4: uuid } = require('uuid');

const ThrowReturn = require('@core/throwreturn');
const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const models = require('@models');
const { addOrUpdateRate, removeRate } = require('@controllers/rate/utils');

async function getHotelProducts({ propertyId, otaConfig }) {
	const url = `${otaConfig.other.uri}/b2b-gateway/tix-hotel-channel-manager/tix-connect/v2/hotel-products`;

	const body = {
		OTA_HotelProductRQ: {
			_EchoToken: uuid(),
			_TimeStamp: new Date(),
			_Version: '2.0',
			xmlns: 'http://www.opentravel.org/OTA/2003/05',
			POS: {
				Source: {
					RequestorID: {
						_ID: otaConfig.other.RequestorID,
					},
				},
			},
			HotelProducts: {
				HotelProduct: [
					{
						_HotelCode: propertyId,
					},
				],
			},
		},
	};

	const response = await fetchRetry(
		url,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaConfig
	);

	const data = await response.json();

	const hotelProducts = data.OTA_HotelProductRS.HotelProducts;
	if (!hotelProducts) {
		throw new ThrowReturn(`Không tìm thấy productId ${propertyId}`);
	}

	return hotelProducts;
}

async function crawlAndGenerateRates(blockId, otaName, account) {
	const [otaConfig] = await models.OTAManager.findByName(otaName, account);
	if (!otaConfig) return;

	const propertyId = await models.Block.getPropertyIdOfABlock(blockId, otaName, account);
	if (!propertyId) return;

	const hotelProducts = await getHotelProducts({ propertyId, otaConfig });

	const ratePlans = _.uniqBy(_.flatten(_.map(hotelProducts.HotelProduct, 'RatePlans.RatePlan')), '_RatePlanCode');

	const ota = _.upperFirst(otaName);

	const rates = await ratePlans.asyncMap(async ratePlan => {
		const rateId = ratePlan._RatePlanCode.toString();

		const otaRateData = {
			otaRateName: ratePlan._RatePlanName,
			isOtaChildRate: false,
			isExpired: false,
			isDefault: true,
		};

		const name = `${ota} Rate - ${ratePlan._RatePlanName} (${rateId})`;
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

		const roomTypes = _.filter(hotelProducts.HotelProduct, h =>
			h.RatePlans.RatePlan.some(r => r._RatePlanCode.toString() === rateId)
		);

		const listings = await models.Listing.find({
			blockId,
			OTAs: {
				$elemMatch: {
					otaListingId: { $in: _.map(roomTypes, r => _.toString(r.RoomTypes.RoomType[0]._RoomTypeCode)) },
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
		logger.info('RATE:', otaName, name, listingIds);

		return addOrUpdateRate(filter, updateData, listingIds);
	});

	return _.compact(rates);
}

module.exports = {
	crawlAndGenerateRates,
};

const _ = require('lodash');
const moment = require('moment');

const Uri = require('@utils/uri');
const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const models = require('@models');
const ThrowReturn = require('@core/throwreturn');
const { addOrUpdateRate, removeRate } = require('@controllers/rate/utils');

async function getExpediaRoomList(propertyId, otaConfig) {
	const url = Uri('https://apps.expediapartnercentral.com/lodging/prodcreation/getRoomList.json', {
		htid: propertyId,
		t: Math.random(),
	});

	const response = await fetchRetry(url, null, otaConfig);
	if (!response.ok) {
		logger.error(`Expedia getExpediaRoomList error`, response.status);
	}

	const data = await response.json();
	if (!data.successful) {
		logger.error(`Expedia getExpediaRoomList error`, data);
	}

	const rooms = _.keyBy(data.value, 'roomTypeID');
	return rooms;
}

async function crawlExpediaRates({ propertyId, account, otaConfig }) {
	const url = Uri('https://apps.expediapartnercentral.com/lodging/prodcreation/getRatePlan.json', {
		htid: propertyId,
		t: Math.random(),
	});

	const response = await fetchRetry(url, null, otaConfig);
	if (!response.ok) {
		throw new ThrowReturn(`Get Rates Plan of Expedia(${account}) Error`);
	}

	const data = await response.json();
	if (!data.successful) {
		throw new ThrowReturn(data.errorDetails);
	}

	//
	const rates = _.get(data, 'value.RatePlans');
	return rates;
}

// const CancelPolicyNight = {
// 	FirstNightRoomAndTax: 1,
// 	SecondNightRoomAndTax: 2,
// };

// const CancelPolicyPercent = {
// 	TenPercentCostOfStayAndTax: 10,
// 	TwentyPercentCostOfStayAndTax: 20,
// 	ThirtyPercentCostOfStayAndTax: 30,
// 	FortyPercentCostOfStayAndTax: 40,
// 	FiftyPercentCostOfStayAndTax: 50,
// 	SixtyPercentCostOfStayAndTax: 60,
// 	SeventyPercentCostOfStayAndTax: 70,
// 	EightyPercentCostOfStayAndTax: 80,
// 	NinetyPercentCostOfStayAndTax: 90,
// 	FullCostOfStay: 100,
// };

async function crawlAndGenerateRates(blockId, otaName, account) {
	const [otaConfig] = await models.OTAManager.findByName(otaName, account);
	if (!otaConfig) return;

	const propertyId = await models.Block.getPropertyIdOfABlock(blockId, otaName, account);
	if (!propertyId) return;

	const [rates, rooms] = await Promise.all([
		crawlExpediaRates({ propertyId, account, otaConfig }),
		getExpediaRoomList(propertyId, otaConfig),
	]);

	const ota = otaName[0].toUpperCase() + otaName.slice(1);

	const expediaRates = await rates
		// .filter(r => r.ActiveStatus === 'Active')
		.asyncMap(async rate => {
			const rateId = rate.RatePlanID;
			const filter = {
				blockId,
				otaName,
				rateId,
			};

			if (rate.ActiveStatus !== 'Active') {
				await removeRate(filter);
				return null;
			}

			const otaRateData = {
				otaRateName: rate.RatePlanName,
				isOtaChildRate: rate.RatePlanType === 'Package',
				isExpired: !!rate.IsExpired,
				isDefault: !!rate.IsDefault,

				bookStartDate: moment(rate.RateRule.BookStartDate).toDate(),
				bookEndDate: moment(rate.RateRule.BookEndDate).toDate(),
				travelStartDate: moment(rate.RateRule.TravelStartDate).toDate(),
				travelEndDate: moment(rate.RateRule.TravelEndDate).toDate(),
			};

			const roomName = _.get(rooms, [rate.RoomTypeID, 'roomTypeName']);
			const name = `${ota} Rate - ${rate.RatePlanName} - ${roomName} - ${rate.RatePlanType} (${rateId})`;

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
				OTAs: { $elemMatch: { otaListingId: _.toString(rate.RoomTypeID), active: true, otaName } },
			}).select('_id');

			if (!listings.length) {
				await removeRate(filter);
				return null;
			}

			const listingIds = listings.map(l => l._id);
			logger.info('RATE: Expedia -> name', name, listingIds);
			return addOrUpdateRate(filter, updateData, listingIds);
		});

	return _.compact(expediaRates);
}

module.exports = {
	crawlAndGenerateRates,
};

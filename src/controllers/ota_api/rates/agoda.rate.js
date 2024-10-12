// const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { OTAs, RateDiscountType } = require('@utils/const');
const { logger } = require('@utils/logger');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { addOrUpdateRate, removeRate } = require('@controllers/rate/utils');

const format = 'YYYY-MM-DD';
const MapDiscountType = {
	1: RateDiscountType.Amount,
	2: RateDiscountType.Percentage,
};

// async function addOrUpdateListingRates({ parent, otaListingId, rateId, blockId, otaName, account, ota, otaRateData }) {
// 	const listing = await models.Listing.findOne({
// 		blockId,
// 		OTAs: {
// 			$elemMatch: {
// 				otaListingId,
// 				active: true,
// 				otaName,
// 			},
// 		},
// 	});

// 	const listingId = listing && listing._id;
// 	const listingRateId = `${rateId},${otaListingId}`;
// 	const filter = {
// 		blockId,
// 		otaName,
// 		rateId: listingRateId,
// 	};

// 	if (!listingId) {
// 		logger.warn('RATE: crawlAndGenerateRatesForAgoda -> not found otaListingId', otaListingId);
// 		await removeRate(filter);
// 		return null;
// 	}

// 	const otaInfo = listing.OTAs.find(o => o.active && o.otaName === OTAs.Agoda && o.otaListingId === otaListingId);

// 	const lName = (otaInfo && otaInfo.otaListingName) || listing.name || otaListingId;
// 	const name = `${ota} Rate - ${otaRateData.otaRateName}(${rateId}) - ${lName}(${otaListingId})`;

// 	const updateData = {
// 		...filter,
// 		[otaName]: { account, rateId: listingRateId },
// 		...otaRateData,
// 		parent,
// 		name,
// 		otaName,
// 		rateId: listingRateId,
// 		account,
// 	};

// 	return await addOrUpdateRate(filter, updateData, [mongoose.Types.ObjectId(listingId)]);
// }

async function addOrUpdateParentRate({ blockId, otaName, ota, otaListingIds, otaRateData, account, rateId }) {
	const filter = {
		blockId,
		otaName,
		rateId,
	};

	const updateData = {
		...filter,
		...otaRateData,
		[otaName]: { account, rateId },
		name: `${ota} Rate - ${otaRateData.otaRateName}(${rateId})`,
		otaName,
		rateId,
		account,
	};

	const _listings = await models.Listing.find({
		blockId,
		OTAs: {
			$elemMatch: {
				active: true,
				otaName: OTAs.Agoda,
				otaListingId: {
					$in: otaListingIds,
				},
			},
		},
	}).select('_id');

	if (!_listings.length) {
		await removeRate(filter);
		return;
	}

	const listingIds = _listings.map(l => l._id);

	logger.info('RATE: Agoda -> name', updateData.name, listingIds);

	return addOrUpdateRate(filter, updateData, listingIds);
}

async function crawlAgodaRates({ otaConfig, propertyId }) {
	const url = `https://ycs.agoda.com/en-us/${propertyId.trim()}/kipp/api/RateCategoryApi/Search?&recStatus=1`;

	const response = await fetchRetry(url, null, otaConfig);
	if (!response.ok) {
		logger.error('Get Rates Plan of Agoda Error', propertyId, await response.text());
		throw new ThrowReturn('Get Rates Plan of Agoda Error');
	}

	const data = await response.json();
	if (!data.IsSuccess) {
		throw new ThrowReturn(`${data.Data} ${propertyId}`);
	}

	const rates = data.Data;
	return rates;
}

async function crawlAndGenerateRates(blockId, otaName, account) {
	const [otaConfig] = await models.OTAManager.findByName(otaName, account);
	if (!otaConfig) {
		logger.error('agodad crawlAndGenerateRates not found otaConfig', blockId, otaName, account);
		return;
	}

	const listings = await models.Listing.find({
		blockId,
		OTAs: { $elemMatch: { account, otaName, active: true } },
	}).select('_id OTAs');

	const propertyIds = [];
	const propertieListings = {};

	listings.forEach(listing => {
		const OTAInfo = listing.getOTA(otaName);
		const propertyId = OTAInfo.otaListingId.split(',')[0];

		propertieListings[propertyId] = propertieListings[propertyId] || [];
		propertieListings[propertyId].push(OTAInfo.otaListingId);
		if (propertyIds.includes(propertyId)) {
			return;
		}
		propertyIds.push(propertyId);
	});

	return await propertyIds.syncMap(async propertyId => {
		const ota = otaName[0].toUpperCase() + otaName.slice(1);

		const rates = await crawlAgodaRates({ otaConfig, propertyId });

		const results = await rates
			.filter(r => r.Status)
			.syncMap(async rate => {
				const rateId = rate.ID.toString();

				// rate = await crawlAgodaRate({ otaConfig, propertyId, rateId });

				const otaRateData = {
					otaRateName: rate.Description,
					discount: {
						type: MapDiscountType[rate.RateCategoryType],
						parentRateId: rate.ParentId,
						amount: rate.RateCategoryValue,
					},
					// meals: {
					// 	dinner: !!rate.meals.dinner,
					// 	breakfast: !!rate.meals.breakfast,
					// 	allInclusive: !!rate.meals.all_inclusive,
					// 	lunch: !!rate.meals.lunch,
					// },
					// restrictions: {
					// 	minStayThrough: rate.restrictions.min_stay_through,
					// 	earlyBookerAmount: rate.restrictions.early_booker_amount,
					// },
					policy: {
						cancellationDescription: rate.CancellationPolicy,
						isNonRefundable: !!rate.CancellationPolicy === 'Non Refundable',
					},
					isOtaChildRate: !!rate.ParentId,
					isExpired: false,
					isDefault: !!rate.IsDefault,
					bookStartDate: moment(rate.SellStartDate, format).toDate(),
					bookEndDate: moment(rate.SellEndDate, format).toDate(),
					travelStartDate: moment(rate.ArrivalStartDate, format).toDate(),
					travelEndDate: moment(rate.ArrivalEndDate, format).toDate(),
				};

				const otaListingIds =
					_.get(rate.RoomTypes, [0, 'HotelRoomTypeID']) === 0
						? propertieListings[propertyId]
						: rate.RoomTypes.filter(r => r.IsActive).map(r => `${propertyId},${r.HotelRoomTypeID}`);

				const parent = await addOrUpdateParentRate({
					blockId,
					propertyId,
					otaName,
					ota,
					otaRateData,
					account,
					rateId,
					otaListingIds,
				});

				return parent;

				// const otaRates = await otaListingIds.asyncMap(otaListingId =>
				// 	addOrUpdateListingRates({
				// 		parent: parent && parent._id,
				// 		blockId,
				// 		otaName,
				// 		ota,
				// 		// rate,
				// 		otaRateData,
				// 		account,
				// 		otaListingId,
				// 		rateId,
				// 	})
				// );

				// return otaRates.filter(r => r);
			});

		// return results.reduce((arr, r) => arr.concat(r), []);
		return results;
	});
}

module.exports = {
	crawlAndGenerateRates,
};

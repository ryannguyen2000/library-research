const mongoose = require('mongoose');
const _ = require('lodash');

const Uri = require('@utils/uri');
const { logger } = require('@utils/logger');
const fetchRetry = require('@utils/fetchRetry');
const { OTAs, RateDiscountType } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { addOrUpdateRate, removeRate } = require('@controllers/rate/utils');

const MapBookingDiscountType = {
	0: 0, // none
	1: RateDiscountType.Percentage,
	2: RateDiscountType.Amount,
};

async function addOrUpdateListingRates({
	parent,
	blockId,
	otaName,
	ota,
	rate,
	otaRateData,
	account,
	otaListingId,
	rateId,
}) {
	const listing = await models.Listing.findOne({
		blockId,
		OTAs: { $elemMatch: { otaListingId, active: true, otaName } },
	});
	const listingId = listing && listing._id;
	const listingRateId = `${rateId},${otaListingId}`;

	const filter = {
		blockId,
		otaName,
		rateId: listingRateId,
		// [otaName]: { account, rateId: listingRateId },
	};

	if (!listingId) {
		logger.warn('RATE: crawlAndGenerateRatesForBooking -> not found otaListingId', otaListingId);
		await removeRate(filter);
		return null;
	}

	const otaInfo = listing.OTAs.find(o => o.active && o.otaName === OTAs.Booking && o.otaListingId === otaListingId);

	const lName = (otaInfo && otaInfo.otaListingName) || listing.name || otaListingId;

	const genius = otaInfo && otaInfo.genius ? ` - Genius` : '';
	const name = `${ota} Rate - ${rate.name}(${rateId}) - ${lName}(${otaListingId})${genius}`;

	const updateData = {
		...filter,
		...otaRateData,
		[otaName]: { account, rateId: listingRateId },
		name,
		otaName,
		rateId: listingRateId,
		account,
		genius: !!genius,
		parent,
	};

	return await addOrUpdateRate(filter, updateData, [mongoose.Types.ObjectId(listingId)], genius);
}

async function addOrUpdateParentRate({ blockId, propertyId, otaName, ota, rate, otaRateData, account, rateId }) {
	const filter = {
		blockId,
		otaName,
		rateId,
	};

	const updateData = {
		...filter,
		...otaRateData,
		[otaName]: { account, rateId },
		name: `${ota} Rate - ${rate.name}(${rateId})`,
		otaName,
		rateId,
		account,
	};

	const _listings = await models.Listing.find({
		blockId,
		OTAs: {
			$elemMatch: {
				active: true,
				otaName: OTAs.Booking,
				otaListingId: {
					$in: rate.rooms.map(r => String(r.id)),
				},
			},
		},
	}).select('_id');

	if (!_listings.length) {
		await removeRate(filter);
		return;
	}

	const listingIds = _listings.map(l => l && l._id).filter(id => id);
	logger.info('RATE: Booking -> name', updateData.name, listingIds);
	return addOrUpdateRate(filter, updateData, listingIds);
}

async function crawlBookingRates({ propertyId, otaConfig, account }) {
	const url = Uri('https://admin.booking.com/fresa/extranet/rate_plans/list', {
		hotel_id: propertyId,
		lang: 'xu',
		ses: otaConfig.other.ses,
	});

	const response = await fetchRetry(url, null, otaConfig);
	if (!response.ok) {
		throw new ThrowReturn(`Get Rates Plan of Booking(${account}) Error`);
	}

	const data = await response.json();
	if (!data.success) {
		throw new ThrowReturn(data);
	}

	//
	const rates = _.get(data, 'data.rates');
	return rates;
}

async function crawlAndGenerateRates(blockId, otaName, account) {
	const [otaConfig] = await models.OTAManager.findByName(otaName, account);
	if (!otaConfig) return;

	const propertyId = await models.Block.getPropertyIdOfABlock(blockId, otaName, account);
	if (!propertyId) return;

	const rates = await crawlBookingRates({ propertyId, otaConfig, account });

	const ota = otaName[0].toUpperCase() + otaName.slice(1);

	const results = await rates.syncMap(async rate => {
		const rateId = rate.rate_id;

		const otaRateData = {
			otaRateName: rate.name,
			discount: {
				type: MapBookingDiscountType[rate.discount.type],
				parentRateId: rate.discount.parent_rate_id,
				amount: rate.discount.amount * (rate.discount.direction ? -1 : 1),
			},
			meals: {
				dinner: !!rate.meals.dinner,
				breakfast: !!rate.meals.breakfast,
				allInclusive: !!rate.meals.all_inclusive,
				lunch: !!rate.meals.lunch,
			},
			restrictions: {
				minStayThrough: rate.restrictions.min_stay_through,
				earlyBookerAmount: rate.restrictions.early_booker_amount,
			},
			policy: {
				name: rate.policy_info.name,
				prepayDescription: rate.policy_info.prepay_desc,
				isGNR: !!rate.policy_info.is_gnr,
				cancellationDescription: rate.policy_info.cancellation_desc,
				isNonRefundable: !!rate.policy_info.is_non_refundable || rate.policy_info.name === 'Non-refundable',
			},
			isOtaChildRate: !!rate.is_child_rate,
			isExpired: false,
			isDefault: !rate.is_child_rate,
		};

		const parent = await addOrUpdateParentRate({
			blockId,
			propertyId,
			otaName,
			ota,
			rate,
			otaRateData,
			account,
			rateId,
		});

		return parent;

		// otaRateData.isDefault = false;

		// const otaRates = await rate.rooms
		// 	.map(r => String(r.id))
		// 	.syncMap(otaListingId =>
		// 		addOrUpdateListingRates({
		// 			parent: parent && parent._id,
		// 			blockId,
		// 			otaName,
		// 			ota,
		// 			rate,
		// 			otaRateData,
		// 			account,
		// 			otaListingId,
		// 			rateId,
		// 		})
		// 	);

		// return otaRates.filter(r => r);
	});

	// return results.reduce((arr, r) => arr.concat(r), []);
	return results;
}

module.exports = {
	crawlAndGenerateRates,
};

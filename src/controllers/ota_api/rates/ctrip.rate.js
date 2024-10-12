const _ = require('lodash');
// const { v4: uuid } = require('uuid');

const ThrowReturn = require('@core/throwreturn');
const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const models = require('@models');
const { addOrUpdateRate, removeRate } = require('@controllers/rate/utils');
const { OTA_ACCOUNT_TYPE } = require('@utils/const');
const { getCtripHeader } = require('@controllers/ota_api/header_helper');
const CM_API = require('./cm_api/ctrip');

async function getRoomTypes({ propertyId: hotelId, otaConfig }) {
	const { reqHead } = otaConfig.other;

	const clientId = _.get(reqHead, 'client.clientId');
	const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
	const uri = `https://ebooking.trip.com/restapi/soa2/23783/queryRoomTypeInfoV2?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

	const body = JSON.stringify({
		reqHead,
		hotelId,
		_hotelId: hotelId,
		ebkHiddenModel: true,
		filterUnMatchedMasterBasicRoom: true,
		isEnabledPriceBeforeTax: false,
	});

	const headers = await getCtripHeader(otaConfig, { hotelId });
	const res = await fetch(uri, {
		method: 'POST',
		headers,
		body,
		redirect: 'manual',
	});

	const json = await res.json();

	if (!json.roomTypeInfo) {
		logger.error('Ctrip get getRoomTypes error', json);
		throw new ThrowReturn(`Ctrip get getRoomTypes error`);
	}

	return json.roomTypeInfo;
}

async function getRatePlans({ propertyId: hotelId, otaConfig }) {
	const { reqHead } = otaConfig.other;

	const clientId = _.get(reqHead, 'client.clientId');
	const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
	const uri = `https://ebooking.trip.com/restapi/soa2/23783/queryRatePlanList?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

	const body = JSON.stringify({
		reqHead,
		hotelId,
		_hotelId: hotelId,
	});

	const headers = await getCtripHeader(otaConfig, { hotelId });
	const res = await fetch(uri, {
		method: 'POST',
		headers,
		body,
		redirect: 'manual',
	});

	const json = await res.json();

	if (!json.ratePlanInfo) {
		logger.error('Ctrip get ratePlans error', json);
		throw new ThrowReturn(`Ctrip get ratePlans error`);
	}

	return _.values(json.ratePlanInfo);
}

async function crawlAndGenerateRates(blockId, otaName, account) {
	const [otaConfig] = await models.OTAManager.findByName(otaName, account);
	if (!otaConfig) return;

	const propertyId = await models.Block.getPropertyIdOfABlock(blockId, otaName, account);
	if (!propertyId) return;

	if (otaConfig.other.account_type === OTA_ACCOUNT_TYPE.CM_API) {
		logger.info('Crawler rates by CM API');
		await CM_API.crawlAndGenerateRates(blockId, otaName, account, otaConfig, propertyId);
		return;
	}

	const roomTypesInfo = await getRoomTypes({ propertyId, otaConfig });
	const ratePlans = await getRatePlans({ propertyId, otaConfig });

	const ota = _.upperFirst(otaName);

	const rates = await ratePlans.asyncMap(async ratePlan => {
		const rateId = ratePlan.detail.ratePlanId.toString();

		const otaRateData = {
			otaRateName: ratePlan.detail.name.ratePlanName,
			isOtaChildRate: ratePlan.detail.priceMode.type !== 1,
			isExpired: ratePlan.detail.status.currentStatus !== 'T',
			isDefault: ratePlan.detail.priceMode.type === 1,
		};

		const name = `${ota} Rate - ${otaRateData.otaRateName} (${rateId})`;
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

		const roomTypeIds = [];

		_.forEach(ratePlan.detail.basicRoomTypeItems, r => {
			const roomRate = _.get(roomTypesInfo, [r.basicRoomTypeID, 'ratePlans', rateId]);
			if (roomRate) {
				roomTypeIds.push(roomRate.roomTypeId.toString());
			}
		});

		// const roomTypeIds = _.map(ratePlan.detail.basicRoomTypeItems, r => {
		// 	const roomTypeProduct = _.get(roomTypesInfo, [r.basicRoomTypeID, 'products']);
		// 	if (roomTypeProduct) {
		// 		return _.keys(roomTypeProduct)[0];
		// 	}
		// }).filter(r => r);

		const listings = await models.Listing.find({
			blockId,
			OTAs: {
				$elemMatch: {
					otaListingId: { $in: roomTypeIds },
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

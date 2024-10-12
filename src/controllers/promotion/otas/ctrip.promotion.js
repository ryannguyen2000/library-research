const moment = require('moment');
const _ = require('lodash');

const { logger } = require('@utils/logger');
// const fetch = require('@utils/fetch');
const { OTA_ACCOUNT_TYPE } = require('@utils/const');
const { requestToCtrip } = require('@controllers/ota_api/utils');

// const headerHelper = require('@controllers/ota_api/header_helper');

const END_POINT = 'https://ebooking.trip.com/restapi/soa2/24267';

async function getRoomsList({ otaInfo, promotionType, propertyId }) {
	const { reqHead } = otaInfo.other;

	const clientId = _.get(reqHead, 'client.clientId');
	const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
	const uri = `${END_POINT}/getRoomInfo?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

	const body = JSON.stringify({
		reqHead,
		promotionType,
		roomFilters: ['OvsPromotionNewFilter', 'EbkHideFilter'],
	});

	const res = await requestToCtrip({
		url: uri,
		options: {
			method: 'POST',
			body,
		},
		otaConfig: otaInfo,
		hotelId: propertyId,
	});

	const json = await res.json();

	if (json.resStatus.rcode !== 200 || !json.basicRoomInfos) {
		throw new Error(`ctrip promotion failed getRoomList ${propertyId} ${body} ${JSON.stringify(json)}`);
	}

	return json.basicRoomInfos;
}

async function create({ otaInfo, data, propertyId, listingIds, ratePlanIds, rateIds }) {
	const { ruleIds, promotionType, ...promotion } = data;

	let resourceAssmbleItemList = []; // { resourceId }

	if (otaInfo.other.account_type === OTA_ACCOUNT_TYPE.CM_API) {
		const roomList = await getRoomsList({
			otaInfo,
			promotionType,
			propertyId,
		});

		roomList.forEach(r => {
			if (!listingIds.includes(r.basicRoomTypeId.toString())) return;

			r.roomTypeInfos.forEach(rt => {
				if (rateIds && rateIds.includes(rt.ratePlanCode.toString())) {
					resourceAssmbleItemList.push({
						resourceId: rt.roomId,
						resourceName: rt.roomName,
					});
				}
			});
		});

		if (!resourceAssmbleItemList.length) {
			logger.error(listingIds, rateIds, JSON.stringify(roomList));
			throw new Error(`ctrip promotion failed not found resourceAssmbleItemList`);
		}
	} else {
		resourceAssmbleItemList = listingIds.map(l => ({ resourceId: l }));
	}

	const { reqHead } = otaInfo.other;

	const clientId = _.get(reqHead, 'client.clientId');
	const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
	const uri = `${END_POINT}/setOvsPro?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

	const body = JSON.stringify({
		reqHead,
		viewRuleIdList: ruleIds || [],
		fundId: 0,
		promotionType,
		promotionAssembleInfoList: [
			{
				...promotion,
				ruleName: genName(promotion.ruleName),
				ruleId: _.get(ruleIds, 0) || 0,
				promotionResourceInfo: {
					resourceDataType: 'ROOM',
					resourceAssmbleItemList,
					inventoryFilterList: [],
					isInventory: false,
				},
			},
		],
		submitPromotionType: 'PASS_RISK_MANAGEMENT',
	});

	const res = await requestToCtrip({
		url: uri,
		options: {
			method: 'POST',
			body,
		},
		otaConfig: otaInfo,
		hotelId: propertyId,
	});

	if (!res.ok) {
		throw new Error(`ctrip create promotion error ${body} ${await res.text()}`);
	}

	const json = await res.json();

	if (json.resStatus.rcode !== 200 || !json.ruleIdList) {
		throw new Error(`ctrip create promotion failed ${body} ${JSON.stringify(json)}`);
	}

	return {
		data,
		meta: {
			hotelId: propertyId,
			listingIds,
			ratePlanIds,
			promoIds: json.ruleIdList,
			promoId: json.ruleIdList[0],
		},
	};
}

async function update({ otaInfo, propertyId, listingIds, rateIds, data, meta, ratePlanIds }) {
	return await create({
		otaInfo,
		data: { ...data, ruleIds: meta.promoIds || (meta.promoId ? [meta.promoId] : []) },
		propertyId: propertyId || meta.hotelId,
		listingIds: _.uniq(listingIds),
		rateIds,
		ratePlanIds,
	});
}

async function set({ otaInfo, propertyId, listingIds, data, meta, rateIds, ratePlanIds }) {
	return await create({
		otaInfo,
		data: {
			...data,
			ruleIds: meta.promoIds || (meta.promoId ? [meta.promoId] : []),
		},
		propertyId,
		listingIds: _.uniq(listingIds),
		rateIds,
		ratePlanIds,
	});
}

async function clear({ otaInfo, propertyId: hotelId, data, meta }) {
	const { reqHead } = otaInfo.other;

	const clientId = _.get(reqHead, 'client.clientId');
	const traceID = `${clientId}-${Date.now()}-${_.random(10000, 99999)}`;
	const uri = `${END_POINT}/setOvsProCancel?_fxpcqlniredt=${clientId}&x-traceID=${traceID}`;

	const body = JSON.stringify({
		reqHead,
		ruleIdList: [meta.promoId],
		remarkInfos: [{ reasonType: 1, reasonMsg: 'The revenue from Basic Deal is lower than expected.' }],
		promotionType: data.promotionType,
	});

	const res = await requestToCtrip({
		url: uri,
		options: {
			method: 'POST',
			body,
		},
		otaConfig: otaInfo,
		hotelId,
	});

	const json = await res.json();

	if (json.resStatus.rcode !== 200) {
		throw new Error(`ctrip clear promotion error ${JSON.stringify(json)}`);
	}

	return { data, meta: null };
}

function getStayTime(datetime) {
	const time = moment(datetime);
	return time.format('Y-MM-DD');
}

const PromoType = {
	basic: 'DRT',
	early_bird: 'EBP',
	early_booker: 'EBP',
	last_minute: 'LRS',
};

function genName(name) {
	const chars = name.match(/[a-z]+/gi);
	chars.forEach(char => {
		name = name.replace(char, char[0]);
	});
	return `${name.replace(/\s/g, '')}-${_.random(1000, 9999)}`;
}

function generate(data) {
	const promotionType = PromoType[data.promoType];
	if (!promotionType) return;

	const pricePromotionVal = 1 - data.discount_amount / 100;
	const costPromotionVal = pricePromotionVal;

	const genData = {
		promotionType,
		ruleId: 0,
		bookingDate: {
			startHour: 0,
			startMinute: 0,
			endHour: 23,
			endMinute: 59,
			invalidWeeks: [],
			startDate: getStayTime(data.bookStartDate),
			endDate: getStayTime(data.bookEndDate),
		},
		ruleName: data.name,
		needAutoDelay: true,
		roomQuantity: null,
		details: [
			{
				pricePromotionVal,
				costPromotionVal,
				preBookingDays: null,
				continuousDays: null,
				inValidWeeks: [],
				countryBlacklist: '',
				countryWhitelist: '',
				provinceBlacklist: '',
				provinceWhitelist: '',
				currency: null,
				tailRoomSalePolicyHour: null,
				cancelPolicy: 0,
				deductPolicy: 0,
				manyRoomThreshold: null,
				promotionStartDate: getStayTime(data.startDate),
				promotionEndDate: getStayTime(data.endDate),
			},
		],
		promotionMethod: 'DISCOUNT',
		promotionResourceInfo: {
			resourceDataType: 'ROOM',
			resourceAssmbleItemList: [],
			inventoryFilterList: [],
			isInventory: false,
		},
	};

	if (promotionType === PromoType.early_bird) {
		genData.details[0].preBookingDays = data.early_booker_amount;
	}

	if (promotionType === PromoType.last_minute) {
		genData.details[0].tailRoomSalePolicyHour = Number(data.last_minute_amount_days) * 24;
	}

	return genData;
}

module.exports = {
	create,
	update,
	set,
	clear,
	generate,
};

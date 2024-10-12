// const moment = require('moment');
const _ = require('lodash');

// const { logger } = require('@utils/logger');
// const isoFetch = require('@utils/isoFetch');
const { PromotionChangeType } = require('@utils/const');
const { getTiketHeaders, changeHotelSession, browserRequest } = require('@controllers/ota_api/headers/tiket');

async function create({ otaInfo, data, propertyId, listingIds, ratePlanIds, rateIds }) {
	const rooms = listingIds.map(listingId => ({
		id: Number(listingId),
		ratePlans: rateIds.map(rateId => ({
			id: Number(rateId),
		})),
	}));

	await changeHotelSession(otaInfo, propertyId);

	const uri = `https://tix.tiket.com/tix-api-gateway-dashboard-hotel/tix-hotel-deals/hotels/${propertyId}/deals${
		data.id ? `/${data.id}` : ''
	}`;

	const body = JSON.stringify({
		...data,
		hotelId: propertyId,
		rooms,
		id: undefined,
	});

	const options = {
		method: data.id ? 'PUT' : 'POST',
		headers: getTiketHeaders(otaInfo),
		body,
	};

	// const res = await isoFetch(uri, options);
	const json = await browserRequest(otaInfo, uri, options);

	if (!json.data || !json.data.id) {
		throw new Error(`tiket create promotion failed ${options.method} ${uri} ${body} ${JSON.stringify(json)}`);
	}

	return {
		data,
		meta: {
			hotelId: propertyId,
			listingIds,
			ratePlanIds,
			rateIds,
			promoId: json.data.id,
		},
	};
}

async function update({ otaInfo, propertyId, listingIds, rateIds, data, meta, ratePlanIds }) {
	return await create({
		otaInfo,
		data: { ...data, id: meta.promoId },
		propertyId: propertyId || meta.hotelId,
		listingIds: listingIds || meta.listingIds,
		rateIds: rateIds || meta.rateIds,
		ratePlanIds: ratePlanIds || meta.ratePlanIds,
	});
}

async function set({ otaInfo, propertyId, listingIds, data, meta, rateIds, ratePlanIds }) {
	return await create({
		otaInfo,
		data: {
			...data,
			id: meta.promoId,
		},
		propertyId,
		listingIds: _.uniq(listingIds),
		rateIds,
		ratePlanIds,
	});
}

async function clear({ otaInfo, propertyId, data, meta }) {
	await changeHotelSession(otaInfo, propertyId);

	const uri = `https://tix.tiket.com/tix-api-gateway-dashboard-hotel/tix-hotel-deals/hotels/${propertyId}/deals/${meta.promoId}`;

	const json = await browserRequest(otaInfo, uri, {
		method: 'DELETE',
		headers: getTiketHeaders(otaInfo),
	});

	if (json.code !== 'SUCCESS') {
		throw new Error(`tiket clear promotion error ${propertyId} ${meta.promoId} ${JSON.stringify(json)}`);
	}

	return { data, meta: null };
}

function getDay(days = '1111111') {
	return days
		.split('')
		.map((d, i) => (d === '1' ? i + 1 : null))
		.filter(d => d)
		.map(d => d);
}

const PromoType = {
	basic: 'BASIC_DEAL',
	early_bird: 'EARLY_BIRD',
	early_booker: 'EARLY_BIRD',
	last_minute: 'LAST_MINUTE_OFFER',
};

function generate(data) {
	const promotionType = PromoType[data.promoType];
	if (!promotionType) return;

	if (data.discount_type === PromotionChangeType.VALUE) {
		return;
	}

	const discountValue = parseInt(data.discount_amount);

	const genData = {
		hotelId: '',
		active: true,
		cancellationPolicyDetail: {
			active: false,
			cancellationChargeType: null,
			cancellationChargeValue: null,
			cancellationDaysBefore: null,
			noShowType: null,
			noShowValue: null,
			refundable: null,
		},
		bookingDateEnd: data.bookEndDate ? new Date(data.bookEndDate).toDateMysqlFormat() : '',
		bookingDateStart: data.bookStartDate ? new Date(data.bookStartDate).toDateMysqlFormat() : '',
		bookingDays: getDay(data.bookDayOfWeeks),
		bookingTimeStart: '00:00',
		bookingTimeEnd: '23:59',
		checkInDateStart: data.startDate ? new Date(data.startDate).toDateMysqlFormat() : '',
		checkInDateEnd: data.endDate ? new Date(data.endDate).toDateMysqlFormat() : '',
		combinable: false,
		platform: [
			'DESKTOP_LOGIN',
			'MOBILE_LOGIN',
			'ANDROID_LOGIN',
			'IOS_LOGIN',
			'DESKTOP',
			'MOBILE',
			'ANDROID',
			'IOS',
		],
		promoName: data.name,
		promoType: promotionType,
		blackoutDates: [],
		promoValues: [{ checkInDays: getDay(data.dayOfWeeks), discountType: 'percentage', discountValue, minStay: 1 }],
		rooms: [
			// {
			// 	id: '2563754',
			// 	name: 'Window Studio',
			// 	ratePlans: [
			// 		{ id: '351231', name: 'Standard Rate' },
			// 		{ id: 351232, name: 'Non Refundable Rate' },
			// 	],
			// },
		],
		daysBeforeStart: null,
		daysBeforeEnd: null,
		id: null,
	};

	if (promotionType === PromoType.early_bird) {
		genData.daysBeforeStart = Number(`${data.early_booker_amount}365`);
		genData.daysBeforeEnd = Number(data.early_booker_amount);
	}

	if (promotionType === PromoType.last_minute) {
		genData.daysBeforeStart = Number(data.last_minute_amount_days);
		genData.daysBeforeEnd = 0;
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

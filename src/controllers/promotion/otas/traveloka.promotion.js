// const moment = require('moment');
const _ = require('lodash');

const { PromotionType } = require('@utils/const');
const { requestToTera } = require('@controllers/ota_api/utils');

const END_POINT = 'https://astiapi-public.ast.traveloka.com';
const MAX_RETRY = 2;

async function getRatePlans(otaConfig, propertyId) {
	const uri = `${END_POINT}/api/v1/rate-structure/room-rate-plans`;

	// const res = await fetchRetry(uri, null, otaInfo);

	const res = await requestToTera({
		url: uri,
		hotelId: propertyId,
		otaConfig,
	});

	const json = await res.json();

	return json.data;
}

async function findPromotion(data, retry = 0) {
	const { otaInfo, propertyId, name, type, startDate, endDate, discountAmount } = data;

	const uri = `${END_POINT}/api/v2/promo/summary`;
	const body = {
		fields: [],
		data: {
			count: 100,
			skip: 0,
			hotelId: propertyId,
		},
	};

	const res = await requestToTera({
		url: uri,
		hotelId: propertyId,
		options: {
			method: 'POST',
		},
		body,
		otaConfig: otaInfo,
	});

	const json = await res.json();

	const promotions = _.get(json, 'data.promoList') || [];

	promotions.sort((a, b) => +b.promotionId - +a.promotionId);

	const promotion = promotions.find(p => {
		const year = _.get(p.stayDateFrom, 'year');
		const month = _.get(p.stayDateFrom, 'month');
		const day = _.get(p.stayDateFrom, 'day');

		const tyear = _.get(p.stayDateTo, 'year');
		const tmonth = _.get(p.stayDateTo, 'month');
		const tday = _.get(p.stayDateTo, 'day');

		return (
			p.status === 'PUBLISH' &&
			discountAmount === Number(p.percentDiscount) &&
			p.promoName === name &&
			p.promoType === type &&
			startDate.year === Number(year) &&
			startDate.month === Number(month) &&
			startDate.day === Number(day) &&
			endDate.year === Number(tyear) &&
			endDate.month === Number(tmonth) &&
			endDate.day === Number(tday)
		);
	});

	if (!promotion) {
		if (retry <= MAX_RETRY) {
			await Promise.delay(2000);
			return findPromotion(data, retry + 1);
		}

		throw new Error(`traveloka findPromotion failed ${JSON.stringify(data)} ${JSON.stringify(json)}`);
	}

	return promotion.promotionId;
}

async function create({ otaInfo, data, propertyId, listingIds, ratePlanIds, rateIds }) {
	if (rateIds && rateIds.length) {
		const rooms = await getRatePlans(otaInfo, propertyId);

		_.forEach(rooms, room => {
			if (listingIds.includes(room.roomId.toString())) {
				room.ratePlans.forEach(ratePlan => {
					if (rateIds.includes(ratePlan.ratePlanId.toString())) {
						data.roomRatePlanIds = data.roomRatePlanIds || [];
						data.roomRatePlanIds.push(ratePlan.roomRatePlanId);
					}
				});
			}
		});

		if (!data.roomRatePlanIds) {
			throw new Error(`traveloka promotion not found roomRatePlanIds ${rateIds} ${JSON.stringify(rooms)}`);
		}
	}

	const body = {
		// context: otaInfo.other.context,
		// auth: otaInfo.other.auth,
		fields: [],
		data,
	};

	data.hotelId = propertyId;
	data.roomIds = listingIds;
	data.upsertPromoType = data.upsertPromoType || 'INSERT';
	data.promoShowSpec.startDate = getStayTime(data.promoShowSpec.startDate.timestamp, true);
	data.promoShowSpec.endDate = getStayTime(data.promoShowSpec.endDate.timestamp, true);
	data.promoStaySpec.startDate = getStayTime(data.promoStaySpec.startDate.timestamp, true);
	data.promoStaySpec.endDate = getStayTime(data.promoStaySpec.endDate.timestamp, true);

	const res = await requestToTera({
		url: `${END_POINT}/api/v2/promo/upsert`,
		hotelId: propertyId,
		options: {
			method: 'POST',
		},
		body,
		otaConfig: otaInfo,
	});

	if (!res.ok) {
		throw new Error(`traveloka create promotion error ${res.status} ${await res.text()}`);
	}

	const json = await res.json();

	if (!json.data || !json.data.status) {
		throw new Error(`traveloka create promotion failed! ${JSON.stringify(json)}`);
	}

	let promoId = data.promoId;

	if (!promoId) {
		await Promise.delay(500);

		promoId = await findPromotion({
			otaInfo,
			propertyId,
			name: data.promoName,
			type: data.promoType,
			startDate: data.promoStaySpec.startDate,
			endDate: data.promoStaySpec.endDate,
			discountAmount: data.promoDetailSpec.percentDiscount,
		});
	}

	return {
		data,
		meta: {
			propertyId,
			listingIds,
			ratePlanIds,
			rateIds,
			promoId,
		},
	};
}

async function update({ otaInfo, propertyId, listingIds, data, meta, ratePlanIds, rateIds }) {
	return await create({
		otaInfo,
		data: { ...data, upsertPromoType: 'UPDATE', promoId: meta.promoId },
		propertyId: propertyId || meta.propertyId,
		listingIds: listingIds || meta.listingIds,
		ratePlanIds,
		rateIds,
	});
}

async function set({ otaInfo, propertyId, listingIds, data, meta, ratePlanIds, rateIds }) {
	return await create({
		otaInfo,
		data: {
			...data,
			upsertPromoType: (!meta.promoId || Number(meta.promoId)) !== 1000 ? 'UPDATE' : 'INSERT',
			promoId: meta.promoId,
		},
		propertyId,
		listingIds: _.uniq(listingIds),
		ratePlanIds,
		rateIds,
	});
}

async function clear({ otaInfo, propertyId, data, meta }) {
	const uri = `${END_POINT}/api/v2/promo/delete`;
	const body = {
		// context,
		// auth: otaInfo.other.auth,
		data: {
			promoId: meta.promoId,
		},
	};

	const res = await requestToTera({
		url: uri,
		hotelId: propertyId || meta.propertyId,
		otaConfig: otaInfo,
		body,
		options: {
			method: 'POST',
		},
	});

	if (!res.ok) {
		throw new Error(`traveloka clear promotion error ${await res.text()}`);
	}

	const json = await res.json();
	if (!json.data || (!json.data.status && json.data.message !== 'Promotion does not exist')) {
		throw new Error(`traveloka clear promotion error ${JSON.stringify(json)}`);
	}

	return { data, meta: null }; // return meta for reuse ota promotion. traveloka delete permanently promotion
}

function getStayTime(datetime, isEqualToNow) {
	const date = isEqualToNow
		? _.max([new Date().zeroHours(), new Date(datetime).zeroHours()])
		: new Date(datetime).zeroHours();

	return {
		month: date.getMonth() + 1,
		day: date.getDate(),
		year: date.getFullYear(),
		timestamp: date.valueOf(),
	};
}

function getDays(days = '1111111') {
	return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].filter(
		(d, i) => days[i] === '1'
	);
}

const PromoType = {
	[PromotionType.Basic]: 'CUSTOMIZED_PROMOTION',
	[PromotionType.LastMinute]: 'LAST_MINUTE',
	[PromotionType.EarlyBird]: 'EARLY_BIRD',
	early_bird: 'EARLY_BIRD',
};

function generate(data) {
	const _hotelDistPromoType = PromoType[data.promoType];
	if (!_hotelDistPromoType) return;

	let maximumHoursPrior = null;
	let minimumHoursPrior = null;

	if (_hotelDistPromoType === PromoType.last_minute) {
		if (data.last_minute_unit === 1) {
			maximumHoursPrior = Number(data.last_minute_amount_days) * 24 + 12;
		} else {
			maximumHoursPrior = data.last_minute_amount_hours + 12;
		}
	} else if (_hotelDistPromoType === PromoType.early_bird) {
		minimumHoursPrior = Number(data.early_booker_amount) * 24;
	}

	const _hotelDistPromoDetailSpec = {
		percentDiscount: data.discount_amount,
		amountPerBooking: null,
		amountPerNight: null,
		specificNightOnFreeNight: null,
		isRecurring: false,
		specificDayOfWeeks: [],
		specificNights: [],
		promoApplyType: 'EVERY_NIGHT',
		promoDiscountType: 'DISCOUNT_PERCENT',
	};

	return {
		promoName: data.name,
		useDefaultHotelCancellationPolicy: true,
		// cancellationPolicyId: '118',
		cancellationPolicyId: null,
		allowMultiPromotion: false,
		// new api
		promoType: _hotelDistPromoType,
		promoShowSpec: {
			startDate: getStayTime(data.bookStartDate || data.startDate),
			endDate: getStayTime(data.bookEndDate || data.endDate),
			startTime: { minute: 0, hour: 0 },
			endTime: { minute: 59, hour: 23 },
			dayOfWeeks: getDays(data.bookDayOfWeeks),
			minimumHoursPrior,
			maximumHoursPrior,
			foreverShow: false,
			exclusionDates: null,
			inclusionDates: null,
		},
		promoDetailSpec: _hotelDistPromoDetailSpec,
		promoStaySpec: {
			minimumRoom: 1,
			maximumRoom: null,
			minimumStayDay: data.min_stay_through || 1,
			maximumStayDay: null,
			startDate: getStayTime(data.startDate),
			endDate: getStayTime(data.endDate),
			checkInDays: getDays(data.dayOfWeeks),
			inclusionDates: [],
			exclusionDates: [],
			foreverStay: false,
		},
		extraBenefitList: [],
		// roomIds: ['20352184', '20352185'],
		ratePlans: [
			'RETAIL',
			'MOBILE',
			'PRIVATESALE',
			'LAST_MINUTE',
			'PACKAGE',
			'CAMPAIGN',
			'CROSS_SELL',
			'CORPORATE',
			'AFFILIATE',
		],
		ratePlanGroup: 'EVERYONE',
		exclusionRPGMap: {},
		countries: ['AU', 'CN', 'HK', 'ID', 'IN', 'JP', 'KR', 'MY', 'PH', 'SG', 'TH', 'US', 'VN'],
		isOtherCountry: true,
		isUsingRTF: false,
		rtfConfig: null,
		upsertPromoType: 'INSERT',
	};
}

module.exports = {
	create,
	update,
	set,
	clear,
	generate,
};

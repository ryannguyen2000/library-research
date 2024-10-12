const moment = require('moment');
const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { PromotionType } = require('@utils/const');
const { logger } = require('@utils/logger');

function getHotelIds(otaListingId) {
	const str = otaListingId.split(',');
	return {
		hotelId: str[0] ? str[0].trim() : str[0],
		roomTypeId: str[1] ? str[1].trim() : str[1],
	};
}

const MetaFilterKeys = [
	'ID',
	'PromotionChannelIdList',
	'PromotionCustomerSegmentGroupIdList',
	'PromotionRateCategoryIdList',
	'PromotionHotelRoomTypeIdList',
	'CompetitorRates',
];

async function create({ otaInfo, data, propertyId, listingIds, rateIds, ratePlanIds }) {
	if (global.isDev) {
		// logger.info('Agoda create promotion', data);
		return {
			data,
			meta: {
				listingIds,
				propertyId,
				rateIds,
				ratePlanIds,
				other: {},
			},
		};
	}

	const { hotelId } = getHotelIds(listingIds[0]);

	let uri = `https://ycs.agoda.com/en-us/${hotelId}/kipp/api/HotelPromotionApi/SavePromotion?nha=1`;

	if (data.ID) {
		uri = `${uri}&pid=${data.ID}`;
	}

	try {
		[data.StayDateFrom, data.StayDateFromStr] = getStayTime(data.StayDateFrom, true);
		[data.StayDateTo, data.StayDateToStr] = getStayTime(data.StayDateTo, true);
		[data.BookDateFrom, data.BookDateFromStr] = getStayTime(data.BookDateFrom, true);
		[data.BookDateTo, data.BookDateToStr] = getStayTime(data.BookDateTo, true);

		const body = JSON.stringify({
			...data,
			PromotionRateCategoryIdList: _.chain(rateIds)
				.map(id => parseInt(id.split(',')[0]))
				.uniq()
				.map(HotelRateCategoryId => ({ HotelRateCategoryId }))
				.value(),
			PromotionHotelRoomTypeIdList: _.chain(listingIds)
				.map(id => parseInt(id.split(',')[1]))
				.uniq()
				.map(HotelRoomTypeId => ({ HotelRoomTypeId }))
				.value(),
		});

		const result = await fetchRetry(
			uri,
			{
				method: 'POST',
				body,
			},
			otaInfo
		);
		if (!result.ok) {
			const txt = await result.text();
			logger.error('agoda promotion', uri, body, result.status, txt);
			throw new Error(txt);
		}

		const newData = await result.json();
		const rule = newData.Data.HotelPromotionBrokenRule || {};

		const err = Object.keys(rule)
			.filter(k => rule[k])
			.map(k => `${k}: ${rule[k]}`)
			.join('\n');

		if (_.trim(err)) {
			throw new Error(err);
		}

		return {
			data,
			meta: {
				listingIds,
				propertyId,
				rateIds,
				ratePlanIds,
				other: Object.keys(newData.Data.HotelPromotionItemModel).reduce((meta, key) => {
					if (MetaFilterKeys.includes(key)) {
						meta[key] = newData.Data.HotelPromotionItemModel[key];
					}
					return meta;
				}, {}),
			},
		};
	} catch (err) {
		logger.error('agoda promotion', uri, JSON.stringify(data), err);
		throw new Error(`agoda create promotion json error: ${err}`);
	}
}

async function update({ otaInfo, data, meta, listingIds, propertyId, rateIds, ratePlanIds }) {
	return await create({
		otaInfo,
		data: { ...data, ...meta.other },
		propertyId: meta.propertyId || propertyId,
		listingIds: meta.listingIds || listingIds,
		rateIds: meta.rateIds || rateIds,
		ratePlanIds,
		edit: true,
	});
}

async function set({ otaInfo, propertyId, listingIds, rateIds, data, meta, ratePlanIds }) {
	return await create({
		otaInfo,
		data: {
			...data,
			...meta.other,
			IsActive: true,
		},
		propertyId,
		listingIds,
		rateIds,
		ratePlanIds,
	});
}

async function clear({ otaInfo, listingIds, data, meta }) {
	if (global.isDev) {
		// logger.info('Agoda clear promotion', meta);
		return { data, meta };
	}

	const { hotelId } = getHotelIds(listingIds[0]);

	const uri = `https://ycs.agoda.com/en-us/${hotelId}/kipp/api/HotelPromotionApi/SavePromotion?nha=1`;
	const body = JSON.stringify({
		...data,
		...meta.other,
		Status: 'Inactive',
		IsActive: false,
	});
	const results = await fetchRetry(
		uri,
		{
			method: 'POST',
			body,
		},
		otaInfo
	);
	if (!results.ok) {
		throw new Error(`agoda clear promotion error ${await results.text()}`);
	}

	return { data, meta }; // return meta for reuse ota promotion
}

function getStayTime(datetime, isEqualToNow) {
	const time = isEqualToNow
		? _.max([moment(datetime).startOf('day'), moment().startOf('day')])
		: moment(datetime).startOf('day');

	return [time.toJSON(), time.format('DD-MMM-YYYY')];
}

const PromoType = {
	[PromotionType.Basic]: 1,
	early_bird: 2,
	[PromotionType.EarlyBird]: 2,
	[PromotionType.LastMinute]: 3,
	[PromotionType.NightFlashSale]: 24,
};

function getAdvancedPurchase(data) {
	const type = PromoType[data.promoType];
	if (type === PromoType[PromotionType.Basic]) {
		return {
			MaxAdvancePurchase: -1,
			MinAdvancePurchase: -1,
		};
	}
	if (type === PromoType[PromotionType.EarlyBird]) {
		return {
			MaxAdvancePurchase: -1,
			MinAdvancePurchase: data.early_booker_amount,
		};
	}
	if (type === PromoType[PromotionType.LastMinute]) {
		let MaxAdvancePurchase;
		if (data.last_minute_unit === 1) {
			MaxAdvancePurchase = data.last_minute_amount_days;
		} else {
			MaxAdvancePurchase = Math.ceil(data.last_minute_amount_hours / 24);
		}
		return {
			MaxAdvancePurchase,
			MinAdvancePurchase: -1,
		};
	}
	if (type === PromoType[PromotionType.NightFlashSale]) {
		return {
			MinAdvancePurchase: -1,
			MaxAdvancePurchase: 0,
		};
	}

	return {};
}

function getDays(days) {
	const rs = ['1', '1', '1', '1', '1', '1', '1'];
	days.split('').forEach((d, i, o) => {
		const index = i + 1 >= o.length ? 0 : i + 1;
		rs[index] = d;
	});

	return rs.join('');
}

function generate(data) {
	if (!PromoType[data.promoType]) {
		return;
	}

	const [StayDateFrom, StayDateFromStr] = getStayTime(data.startDate);
	const [StayDateTo, StayDateToStr] = getStayTime(data.endDate);

	const [BookDateFrom, BookDateFromStr] = getStayTime(data.bookStartDate);
	const [BookDateTo, BookDateToStr] = getStayTime(data.bookEndDate);

	const { MaxAdvancePurchase, MinAdvancePurchase } = getAdvancedPurchase(data);

	const rs = {
		ID: 0,
		PromotionName: data.name,
		PromotionTypeID: PromoType[data.promoType],
		IsPromotionStack: false,
		IsBookDateForever: false,
		IsStayDateForever: false,
		MinNightsStay: 1,
		BookOn: getDays(data.bookDayOfWeeks),
		CheckInOn: '1111111',
		BookTimeFrom: '00:00:00',
		BookTimeFromStr: '00:00',
		BookTimeTo: '00:00:00',
		BookTimeToStr: '00:00',
		BookDateFrom,
		BookDateFromStr,
		BookDateTo,
		BookDateToStr,
		CancellationPolicyID: 975, // default cancel policy
		StayDateFrom,
		StayDateFromStr,
		StayDateTo,
		StayDateToStr,
		StayOn: getDays(data.dayOfWeeks),
		DiscountTypeID: 1,
		SpecificNight: 4,
		DiscountValueMon1: data.discount_amount,
		DiscountValueTue2: 0,
		DiscountValueWed3: 0,
		DiscountValueThu4: 0,
		DiscountValueFri5: 0,
		DiscountValueSat6: 0,
		DiscountValueSun7: 0,
		MinRooms: 1,
		IsRecurringBenefit: true,
		CompetitorRates: [{ IsSelf: true, Name: null, Price: null }],
		CreationDate: (data.data && data.data.CreationDate) || new Date().toJSON(),
		CurrencyCode: 'VND',
		IsActive: true,
		Status: 'Active',
		IsApplyChannelDiscount: true,
		IsBookDateFromChanged: false,
		IsBookDateToChanged: false,
		IsStayDateFromChanged: false,
		IsStayDateToChanged: false,
		IsIncludeChannelOptionEnabled: true,
		IsIncludeCustomerSegmentsOptionEnabled: true,
		IsIncludeRateplanOptionEnabled: true,
		IsIncludeRoomTypeOptionEnabled: true,
		MaxAdvancePurchase,
		MinAdvancePurchase,
		PromotionSourceTypeId: 2,
		PromotionChannelIdList: [
			{
				ChannelId: 0,
				ChannelName: null,
				HotelPromotionId: 0,
			},
		],
		PromotionCustomerSegmentGroupIdList: [
			{
				CustomerSegmentGroupId: 0,
				CustomerSegmentGroupName: null,
				HotelPromotionId: 0,
			},
		],
		PromotionHotelRoomTypeIdList: [],
		PromotionRateCategoryIdList: [],
	};

	if (data.promoType === PromotionType.NightFlashSale) {
		_.assign(rs, {
			// BookDateFrom: '2022-10-05T17:00:00.000Z',
			// BookDateFromStr: '06-Oct-2022',
			// BookDateTo: '2022-10-05T17:00:00.000Z',
			// BookDateToStr: '06-Oct-2022',
			BookTimeFrom: '20:00:00',
			BookTimeFromStr: '20:00',
			BookTimeTo: '23:59:00',
			BookTimeToStr: '23:59',
			// StayDateFrom: '2022-10-05T17:00:00.000Z',
			// StayDateFromStr: '06-Oct-2022',
			// StayDateTo: '2022-10-05T17:00:00.000Z',
			// StayDateToStr: '06-Oct-2022',
			IsShowSuggestedPromotion: false,
			PromotionVipSegmentGroupIdList: [],
			PromotionBlackoutList: null,
			IsShowChannelRestriciton: false,
			IsShowCustomerSegmentRestriction: false,
			IsShowVipSegmentRestriction: false,
			IsShowRateCategoryRestriction: false,
			IsShowHotelRoomTypeRestriction: false,
			IsShowBlackoutRestriction: false,
			IsShowCancellationRestriction: false,
			ExpiryDate: null,
			CreationDate: null,
			BookOn: '1111111',
			StayOn: '1111111',
			CheckInOn: '1111111',
			MaxNightsStay: 0,
			Status: null,
			CompetitorRates: [],
		});
	}

	return rs;
}

module.exports = {
	create,
	update,
	set,
	clear,
	generate,
};

const moment = require('moment');
const { logger } = require('@utils/logger');
const fetchRetry = require('@utils/fetchRetry');
const { PromotionType } = require('@utils/const');
const { removeAccents } = require('@utils/generate');
const headerHelper = require('@controllers/ota_api/header_helper');

const TZ_AFFIX = '[Asia/Bangkok]';

async function getRoomAndRates(otaInfo, propertyId, listingIds, rateIds = []) {
	const results = await fetchRetry(
		`https://apps.expediapartnercentral.com/lodging/promotions/getRoomAndRatePlanInfo.json?htid=${propertyId}`,
		null,
		otaInfo
	);

	if (results.ok) {
		const json = await results.json();

		return json.roomsAndRatesModelList
			.filter(
				r =>
					listingIds.includes(r.roomTypeKeyId.toString()) &&
					rateIds.some(ra => r.ratePlanKey.includes(ra.toString()))
			)
			.map(r => r.ratePlanKey);
	}

	logger.warn(`Expedia getRoomAndRates error`, await results.text());
	throw new Error(`expedia create promotion error`);
}

async function create({ otaInfo, data, listingIds, propertyId, rateIds, ratePlanIds }) {
	const newData = { ...data };

	if (!newData.offer.selectedRoomsAndRates) {
		newData.offer.selectedRoomsAndRates = await getRoomAndRates(otaInfo, propertyId, listingIds, rateIds);
		reCalcTimesData(newData);
	}

	const uri = `https://apps.expediapartnercentral.com/lodging/promotions/createStandardPromotion.json?htid=${propertyId}`;
	const body = JSON.stringify(newData);
	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			body,
		},
		otaInfo
	);

	if (res.ok) {
		const json = await res.json();
		return {
			data,
			meta: {
				propertyId,
				listingIds,
				promotionId: json.promotionId.id,
				ratePlanIds,
			},
		};
	}
	throw new Error(`expedia create promotion error ${await res.text()}`);
}

async function set({ otaInfo, propertyId, listingIds, rateIds, data, meta, start, end, ratePlanIds }) {
	if (!meta.promotionId) {
		const results = await create({ otaInfo, data, propertyId, listingIds, rateIds, ratePlanIds });
		Object.assign(meta, results.meta);
	} else if (meta.promotionId) {
		const results = await update({ otaInfo, propertyId, listingIds, rateIds, data, meta, start, end, ratePlanIds });
		Object.assign(meta, results.meta);
	}

	return { data, meta };
}

async function update({ otaInfo, propertyId, listingIds, rateIds, data, meta, ratePlanIds }) {
	const rates = await getRoomAndRates(otaInfo, propertyId || meta.propertyId, listingIds || meta.listingIds, rateIds);

	const newData = { ...data };
	newData.offer.selectedRoomsAndRates = rates;

	reCalcTimesData(newData);

	const uri = `https://apps.expediapartnercentral.com/lodging/promotions/editStandardPromotion.json?htid=${meta.propertyId}&promotionId=${meta.promotionId}`;
	const body = JSON.stringify(newData);
	const results = await fetchRetry(
		uri,
		{
			method: 'PUT',
			body,
		},
		otaInfo
	);

	if (!results.ok) {
		const json = await results.json();
		logger.error('expedia update promotion error', uri, json, body);
		if (json.errorCode === 90) {
			// promotion expired must create new one
			return create({ otaInfo, data: newData, propertyId, listingIds, rateIds, ratePlanIds });
		}
	}

	meta.ratePlanIds = ratePlanIds;
	meta.listingIds = listingIds;

	return { data: newData, meta };
}

async function clear({ otaInfo, propertyId, data, meta }) {
	const uri = `https://apps.expediapartnercentral.com/lodging/promotions/updatePromotionStatus.json?htid=${propertyId}`;
	const body = {
		promotionId: { promotionId: meta.promotionId, recurring: false },
		promotionStatus: 'PAUSED',
		promotionType: 'STANDARD',
	};
	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			headers: headerHelper.getExpediaHeader(
				otaInfo,
				{
					referer: `https://apps.expediapartnercentral.com/lodging/promotions/viewAnalyticsPage.html?htid=${propertyId}`,
				},
				uri
			),
			body: JSON.stringify(body),
		},
		otaInfo
	);

	if (!res.ok) {
		throw new Error(`expedia clear promotion error ${meta.promotionId} ${await res.text()}`);
	}

	return { data };
}

function getStayTime(datetime, isEnd) {
	const time = moment(datetime);

	let bookingDate;
	if (isEnd) {
		bookingDate = moment(time).hours(23).minutes(59).toJSON();
	} else {
		bookingDate = time.toJSON();
	}

	bookingDate += TZ_AFFIX;

	return bookingDate;
}

const RestrictionType = {
	[PromotionType.Basic]: 'basic',
	[PromotionType.LastMinute]: 'SAME_DAY',
	[PromotionType.EarlyBird]: 'EARLY_BOOKING',
};
const RestrictionDetailsName = {
	[PromotionType.LastMinute]: 'HOURS_BEFORE',
	[PromotionType.EarlyBird]: 'MIN',
};

function reCalcTimesData(data) {
	const today = new Date();
	const format = 'YYYY-MM-DD';

	if (moment(data.travelCalendar.travelDates.startDate).isBefore(today, 'day')) {
		data.travelCalendar.travelDates.startDate = moment(today).format(format);
	}

	if (
		data.bookingCalendar &&
		data.bookingCalendar.bookingDates &&
		moment(data.bookingCalendar.bookingDates.startDate.replace(TZ_AFFIX, '')).isBefore(today, 'day')
	) {
		data.bookingCalendar.bookingDates.startDate = getStayTime(today);
	}

	if (data.audience) {
		const earlyRetriction = data.audience.restrictions.find(
			r => r.restrictionType === RestrictionType[PromotionType.EarlyBird]
		);
		if (earlyRetriction && data.bookingCalendar.bookingDates) {
			const startDateCheck = moment(data.bookingCalendar.bookingDates.startDate.replace(TZ_AFFIX, '')).add(
				earlyRetriction.restrictionsDetails[0].value,
				'days'
			);
			if (startDateCheck.isAfter(data.travelCalendar.travelDates.startDate, 'days')) {
				data.travelCalendar.travelDates.startDate = startDateCheck.format(format);
			}

			const endDateCheck = moment(data.bookingCalendar.bookingDates.endDate.replace(TZ_AFFIX, '')).add(
				earlyRetriction.restrictionsDetails[0].value,
				'days'
			);
			if (endDateCheck.isAfter(data.travelCalendar.travelDates.endDate, 'days')) {
				data.travelCalendar.travelDates.endDate = endDateCheck.format(format);
			}
		}
	}

	return data;
}

function generate(data) {
	const restrictionType = RestrictionType[data.promoType];
	if (!restrictionType) return;

	const today = new Date();

	if (
		(data.bookEndDate && moment(data.bookEndDate).isBefore(today, 'day')) ||
		(data.endDate && moment(data.endDate).isBefore(today, 'day'))
	) {
		return;
	}

	const startBookingDate = getStayTime(data.bookStartDate || data.startDate);
	const endBookingDate = getStayTime(data.bookEndDate || data.endDate, true);

	const rs = {
		hasCorporateRatePlans: false,
		isEvergreen: false,
		internalUser: {
			internallyViewable: false,
			contracted: false,
		},
		offer: {
			adjustmentType: 'PERCENT',
			discountType: 'SINGLE',
			promotionStackingParameters: {},
			priceDiscount: data.discount_amount,
		},
		travelCalendar: {
			blackoutDates: [],
			travelDates: {
				startDate: moment(data.startDate).format('Y-MM-DD'),
				endDate: moment(data.endDate).format('Y-MM-DD'),
			},
		},
		promotionName: removeAccents(data.name, false),
		bookingCalendar: {
			type: 'ANY_DATE_TIME',
			bookingDates: {
				startDate: startBookingDate,
				endDate: endBookingDate,
			},
		},
	};

	if (restrictionType === 'SAME_DAY') {
		if (data.last_minute_amount_days !== 1) return;

		rs.bookingCalendar = {};
		rs.audience = {
			restrictions: [
				{
					restrictionType,
					restrictionsDetails: [
						{
							name: RestrictionDetailsName[data.promoType],
							value: '24',
						},
					],
				},
			],
		};
	} else if (restrictionType === 'EARLY_BOOKING') {
		rs.audience = {
			restrictions: [
				{
					restrictionType,
					restrictionsDetails: [
						{
							name: RestrictionDetailsName[data.promoType],
							value: data.early_booker_amount,
						},
					],
				},
			],
		};
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

const moment = require('moment');
const _ = require('lodash');

const fetchRetry = require('@utils/fetchRetry');
const { PromotionType } = require('@utils/const');
const URI = require('@utils/uri');
const { getBookingHeader } = require('@controllers/ota_api/header_helper');

const SPECIAL = {
	START_DATE: '2022-09-26',
	END_DATE: '2023-01-03',
	NAME: 'Late Escape',
	TYPE: 'preset',
	TYPE_ID: '35',
	CHANNEL: 318,
};

const PROMOTION_TYPE = {
	[PromotionType.Basic]: 'basic',
	[PromotionType.LastMinute]: 'last_minute',
	early_bird: 'early_bird',
	[PromotionType.EarlyBird]: 'early_booker',
	// [PromotionType.NightFlashSale]: 'flash',
};

function getDateTime(datetime) {
	const time = moment(datetime);
	const date = {
		day: time.get('dates'),
		month: time.get('months') + 1,
		year: time.get('years'),
	};

	const timestamp = time.unix() * 1000;
	return [date, timestamp, time.format('Y-MM-DD')];
}

async function callApi(url, data, otaInfo, method = 'POST') {
	const body = JSON.stringify(data);

	const result = await fetchRetry(
		url,
		{
			method,
			headers: {
				...getBookingHeader(otaInfo),
				'content-type': 'application/json',
			},
			body,
			redirect: 'manual',
		},
		otaInfo
	).then(res => res.json());

	if (result && result.success && result.data && result.data.success) {
		return result.data;
	}
	if (method === 'DELETE' && result.data.reason === 'promotion_not_found') {
		return null;
	}

	throw new Error(`booking callApi promotion error ${body} ${JSON.stringify(result)}`);
}

async function create({ otaInfo, data, propertyId, listingIds, rateIds, ratePlanIds }) {
	data.room_ids = listingIds.map(l => Number(l));
	data.parent_rates = rateIds;
	data.discount_amount = parseInt(data.discount_amount);
	data.state = data.promo_id ? 'update' : 'create';
	data.is_create = data.state !== 'update';

	const uri = URI('https://admin.booking.com/fresa/extranet/promotions/save', {
		ses: otaInfo.other.ses,
		lang: 'en',
		hotel_id: propertyId,
		hotel_account_id: otaInfo.other.accountId,
	});

	const meta = {
		propertyId,
		listingIds,
		ratePlanIds,
		room_ids: data.room_ids,
		parent_rates: data.parent_rates,
	};

	const result = await callApi(uri, data, otaInfo);
	meta.promo_id = result.vr_id || result.promo_id;

	return {
		data,
		meta,
	};
}

async function update({ otaInfo, propertyId, listingIds, rateIds, data, meta, ratePlanIds }) {
	return await create({
		otaInfo,
		data: { ...data, promo_id: meta.promo_id },
		propertyId: meta.propertyId || propertyId,
		listingIds: meta.room_ids || listingIds,
		rateIds: meta.parent_rates || rateIds,
		ratePlanIds,
		meta,
	});
}

async function set({ otaInfo, propertyId, listingIds, rateIds, data, meta, ratePlanIds }) {
	return await create({
		otaInfo,
		data: {
			...data,
			reactive: !!meta.promo_id,
			promo_id: meta.promo_id,
		},
		propertyId: meta.propertyId || propertyId,
		listingIds: _.uniq(listingIds),
		rateIds: _.uniq(rateIds),
		ratePlanIds,
		meta,
	});
}

async function clear({ otaInfo, data, meta }) {
	if (!meta.promo_id) {
		return {
			data,
		};
	}

	const uri = URI('https://admin.booking.com/fresa/extranet/pricing_hub/manage/deactivate', {
		ses: otaInfo.other.ses,
		hotel_id: meta.propertyId,
		hotel_account_id: otaInfo.other.accountId,
		lang: 'xu',
	});

	const rs = await callApi(uri, { promotion_id: `promotion_${meta.promo_id}` }, otaInfo, 'DELETE');
	if (meta.promo_getaway_id) {
		await callApi(uri, { promotion_id: `promotion_${meta.promo_getaway_id}` }, otaInfo, 'DELETE');
		delete meta.promo_getaway_id;
	}

	return { data, meta: data.type === SPECIAL.TYPE ? null : rs ? meta : null }; // return meta for reuse ota promotion
}

function getDay(days = '1111111') {
	return days
		.split('')
		.map((d, i) => (d === '1' ? i + 1 : null))
		.filter(d => d)
		.map(d => d.toString());
}

function generate(data) {
	if (!PROMOTION_TYPE[data.promoType]) {
		return;
	}

	const isSpec =
		data.promoType === PROMOTION_TYPE[PromotionType.Basic] &&
		data.isSpec &&
		moment().isBefore(SPECIAL.END_DATE, 'day');

	const [stay_date_start, stay_date_start_timestamp, stay_dates_from] = getDateTime(
		isSpec ? new Date() : data.startDate
	);
	const [stay_date_end, stay_date_end_timestamp, stay_dates_to] = getDateTime(
		isSpec ? SPECIAL.END_DATE : data.endDate
	);

	const [book_date_start, book_date_start_timestam, book_dates_from] = getDateTime(
		isSpec ? SPECIAL.START_DATE : data.bookStartDate
	);
	const [book_date_end, book_date_end_timestamp, book_dates_to] = getDateTime(
		isSpec ? SPECIAL.END_DATE : data.bookEndDate
	);

	const rate_name = isSpec ? data.name.replace('Basic', SPECIAL.NAME) : data.name;
	const target_channel = isSpec ? SPECIAL.CHANNEL : data.genius ? 5 : 0;
	const type = isSpec ? SPECIAL.TYPE : PROMOTION_TYPE[data.promoType];
	const early_booker_amount = isSpec ? 30 : data.early_booker_amount;

	const rs = {
		rate_name,
		target_channel,
		type,
		early_booker_amount,
		form_save_loading: true,
		active: true,
		promo_id: 0,
		activeStayDays: getDay(data.dayOfWeeks),
		use_non_refundable_policygroup: 0,
		min_stay_through: data.min_stay_through,
		is_secret_deal: data.genius,
		discount_amount: parseInt(data.discount_amount),
		discount_type: 1,
		hotel_currency: 'VND',
		last_minute_unit: data.last_minute_unit,
		last_minute_amount_days: data.last_minute_amount_days,
		last_minute_amount_hours: data.last_minute_amount_hours,
		parent_rates: [],
		required_fully_paid_nights: 1,
		room_ids: [],
		// validate: false,
		// loading: false,
		state: 'create',
		stay_date_start,
		stay_date_end,
		stay_date_start_timestamp,
		stay_date_end_timestamp,
		book_date_start,
		book_date_start_timestam,
		book_date_end,
		book_date_end_timestamp,
		source: 'ph',
	};

	if (data.promoType === PROMOTION_TYPE.NightFlashSale) {
		rs.flash_deal_agreed = true;
		rs.early_booker_amount = 30;
		rs.business_bookers_discount_active = 0;
		rs.business_bookers_discount_amount = 10;
		rs.book_dates_antecedence_amount = 1;
		rs.book_dates_are_early_flash_deal_dates = 1;
		rs.book_dates_type = 0;
		rs.happy_hours_enabled = 0;
		rs.length_of_stay_present = 'no';
		rs.nights_in_promotion = 1;
		rs.pre_defined_type = true;
		rs.target_channel = 0;
	}
	if (isSpec && SPECIAL.TYPE_ID) {
		rs.promotion_preset_id = SPECIAL.TYPE_ID;
		rs.fullyFlexibleAcknowledgement = false;
		rs.comissionWaiveAcknowledgement = false;
		rs.eligibilityAcknowledgement = false;
		rs.flash_deal_agreed = true;
		rs.stay_dates = {
			from: stay_dates_from,
			to: stay_dates_to,
		};
		rs.book_dates = {
			from: book_dates_from,
			to: book_dates_to,
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

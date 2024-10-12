const moment = require('moment');
const _ = require('lodash');
const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const { PromotionType, PromotionRuleSetType, OTAs } = require('@utils/const');
const { PROMOTION_MAP_TYPE } = require('@controllers/promotion/const');
const { AIRBNB_HOST } = require('@controllers/ota_api/header_helper');

function extractData(newData, ratePlanIds) {
	const { id, created_by_user_id } = newData;

	delete newData.id;
	delete newData.created_by_user_id;

	return {
		data: newData,
		meta: { id, created_by_user_id, ratePlanIds },
	};
}

function processData(data) {
	return {
		...data,
		// pricing_rules: data.pricing_rules.filter(rule => rule.rule_type === 'SEASONAL_ADJUSTMENT'),
	};
}

async function setRuleSet(otaInfo, data, ratePlanIds) {
	const url = `${AIRBNB_HOST}/api/v2/seasonal_rule_sets${data.id ? `/${data.id}` : ''}?key=${
		otaInfo.other.key
	}&_format=default`;

	const body = processData(data);
	delete body.id;
	const results = await fetchRetry(
		url,
		{
			method: data.id ? 'PUT' : 'POST',
			body: JSON.stringify(body),
		},
		otaInfo
	);
	if (results.ok) {
		const json = await results.json();
		return extractData(json.seasonal_rule_set, ratePlanIds);
	}

	const error = await results.text();
	logger.info('Airbnb setRuleSet error', url, body, error);
	throw new Error(`SetRuleSet error`);
}

// create promotion
async function create({ otaInfo, data, ratePlanIds }) {
	delete data.id;
	delete data.created_by_user_id;

	const newData = await setRuleSet(otaInfo, data, ratePlanIds);
	return newData;
}

// update promotion
async function update({ otaInfo, listingIds, data, meta, start, end, ratePlanIds }) {
	if (meta.start && meta.end && (meta.start !== start || meta.end !== end)) {
		if (listingIds.length > 0) {
			await set({ otaInfo, listingIds, data, meta, start, end });
		}
	}

	delete data.created_by_user_id;
	data.id = meta.id;
	const newData = await setRuleSet(otaInfo, data);
	newData.meta.start = start;
	newData.meta.end = end;
	newData.meta.ratePlanIds = ratePlanIds;

	return newData;
}

// set promotion
async function set({ otaInfo, listingIds, data, meta, start, end, ratePlanIds }) {
	delete data.created_by_user_id;

	if (meta.id) {
		data.id = meta.id;
		await setRuleSet(otaInfo, data, ratePlanIds);
	}

	const listing_ids = Array.isArray(listingIds) ? listingIds : [listingIds];
	const body = {
		listing_ids,
		start_date: moment(start).format('Y-MM-DD'),
		end_date: moment(end).format('Y-MM-DD'),
		seasonal_rule_group_id: meta.id,
	};

	const res = await fetchRetry(
		`${AIRBNB_HOST}/api/v2/bulk_set_listing_seasonal_rule_group_timelines?currency=USD&key=${otaInfo.other.key}&locale=en`,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaInfo
	);
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Airbnb set promotion error ${error}`);
	}

	meta.start = start;
	meta.end = end;
	meta.ratePlanIds = ratePlanIds;

	return { data, meta };
}

async function clear({ otaInfo, propertyId, listingIds, data, meta, start, end }) {
	await set({ otaInfo, propertyId, listingIds, data, meta: { ...meta, id: null }, start, end });
	return { data, meta }; // return meta for reuse ota promotion
}

async function remove({ otaInfo, data, meta }) {
	const url = `${AIRBNB_HOST}/api/v2/seasonal_rule_sets/${meta.id}?key=${otaInfo.other.key}&_format=default`;
	const res = await fetchRetry(
		url,
		{
			method: 'DELETE',
			body: '{}',
		},
		otaInfo
	);
	if (!res.ok) {
		const error = await res.text();
		throw new Error(`Airbnb clear promotion error ${error}`);
	}

	return { data }; // return meta for reuse ota promotion. airbnb delete permanently
}

function generate(data) {
	if (!data.activeOTAs.includes(OTAs.Airbnb)) {
		return;
	}

	const basic = _.find(data.airbnb.pricing_rules, p => p.rule_type === PROMOTION_MAP_TYPE[PromotionType.Basic]);

	const pricing_rules = data.airbnb.pricing_rules
		.filter(
			r =>
				r.rule_type !== PromotionRuleSetType.HOURLY_SALE &&
				r.rule_type !== PromotionRuleSetType.NIGHT_FLASH_SALE
		)
		.map(rule => {
			let { price_change, threshold_one } = rule;

			if (basic && rule.rule_type !== PROMOTION_MAP_TYPE[PromotionType.Basic]) {
				const diff = Math.abs(price_change) - Math.abs(basic.price_change);
				if (diff <= 0) return;

				const maxPromo = 1 - Math.abs(price_change) / 100;
				const basicPromo = 1 - Math.abs(basic.price_change) / 100;
				price_change = -_.round((1 - maxPromo / basicPromo) * 100);
			}

			return {
				...rule,
				threshold_one:
					rule.rule_type === PROMOTION_MAP_TYPE[PromotionType.EarlyBird]
						? Math.ceil(threshold_one / 30) * 30
						: threshold_one,
				price_change,
			};
		})
		.filter(p => p);

	if (!pricing_rules.length) {
		return;
	}

	return {
		...data.airbnb,
		pricing_rules,
	};
}

module.exports = {
	create,
	update,
	remove,
	set,
	clear,
	generate,
};

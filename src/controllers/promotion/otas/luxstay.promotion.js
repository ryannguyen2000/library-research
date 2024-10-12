// const moment = require('moment');
// const _ = require('lodash');
// const { logger } = require('@utils/logger');
// const fetchRetry = require('@utils/fetchRetry');
// const headerHelper = require('@controllers/ota_api/header_helper');

// function genBody(data, listingIds = []) {
// 	const today = moment();
// 	const start_date = moment(data.conditions.start_date);
// 	const end_date = moment(data.conditions.end_date);

// 	const valid_start_date = start_date.isSameOrBefore(today, 'day') ? today : start_date;
// 	const diff = end_date.diff(valid_start_date, 'day');
// 	if (diff > 90) {
// 		end_date.add(90 - diff - 1, 'day');
// 	}

// 	const body = {
// 		...data,
// 		conditions: {
// 			...data.conditions,
// 			start_date: valid_start_date.format('Y-MM-DD'),
// 			end_date: end_date.format('Y-MM-DD'),
// 			accommodation_ids: listingIds.map(l => parseInt(l)),
// 		},
// 	};

// 	return body;
// }

// async function createPromotion(otaInfo, data, listingIds) {
// 	const headers = headerHelper.getLuxstayHeader(otaInfo, {
// 		referer: 'https://host.luxstay.net/promotions/create/discount',
// 	});

// 	const body = JSON.stringify(genBody(data, listingIds));

// 	const results = await fetchRetry(
// 		`https://host.luxstay.net/api/discounts`,
// 		{
// 			method: 'POST',
// 			headers,
// 			body,
// 		},
// 		otaInfo
// 	);

// 	if (results.ok) {
// 		const json = await results.json();
// 		return json.data.id;
// 	}

// 	const text = await results.text();
// 	throw new Error(`luxstay create new promotion error ${text}`);
// }

// async function create(otaInfo, data, propertyId, listingIds, rateIds) {
// 	const id = await createPromotion(otaInfo, data, listingIds);
// 	const meta = { id, listingIds };
// 	return { data, meta };
// }

// async function update(otaInfo, propertyId, listingIds, ratePlans, data, meta, start, end) {
// 	// await clear(otaInfo, null, meta.listingIds, null, data, meta);
// 	// return await create(otaInfo, data, propertyId, listingIds, null);
// 	const body = JSON.stringify(genBody(data, listingIds));
// 	const uri = `https://host.luxstay.net/api/discounts/${meta.id}`;
// 	const results = await fetchRetry(uri, { method: 'PUT', body }, otaInfo);

// 	if (!results.ok) {
// 		const text = await results.text();
// 		logger.error('luxstay update promotion error', uri, text, body);
// 	}

// 	return { data, meta: { id: meta.id, listingIds } };
// }

// async function set(otaInfo, propertyId, listingIds, ratePlans, data, meta, start, end) {
// 	if (!meta.id) {
// 		const results = await create(otaInfo, data, propertyId, listingIds);
// 		Object.assign(meta, results.meta);
// 	} else if (meta.listingIds && meta.id && _.isEqual(meta.listingIds, listingIds) === false) {
// 		const listIds = _.uniq((meta.listingIds || []).concat(listingIds));
// 		const results = await update(otaInfo, propertyId, listIds, ratePlans, data, meta, start, end);
// 		Object.assign(meta, results.meta);
// 	}

// 	return { data, meta };
// }

// async function clear(otaInfo, propertyId, listingId, ratePlans, data, meta, start, end) {
// 	if (meta.id) {
// 		const res = await fetchRetry(
// 			`https://host.luxstay.net/api/discounts/${meta.id}/change_status`,
// 			{ method: 'PUT', body: JSON.stringify({ status: 'inactive' }) },
// 			otaInfo
// 		);
// 		if (!res.ok) {
// 			const text = await res.text();
// 			throw new Error(`luxstay clear promotion error ${meta.id} ${text}`);
// 		}
// 		// const listingIds = meta.listingIds.filter(id => !listingId.includes(id));
// 		// if (listingIds.length) {
// 		// 	return create(otaInfo, data, propertyId, listingIds);
// 		// }
// 	}

// 	return { data }; // return meta for reuse ota promotion
// }

// function getDay(days = '1111111') {
// 	return days
// 		.split('')
// 		.map((d, i, o) => (d === '1' ? (i >= o.length - 1 ? 0 : i + 1) : null))
// 		.filter(d => d !== null);
// }

// function generate(data) {
// 	return genBody({
// 		name: data.name,
// 		discount_type: 'percentage',
// 		value: _.round(data.discount_amount),
// 		status: 'active',
// 		conditions: {
// 			start_date: moment(data.startDate).format('Y-MM-DD'),
// 			end_date: moment(data.endDate).format('Y-MM-DD'),
// 			accommodation_ids: [],
// 			weekdays: getDay(data.dayOfWeeks),
// 		},
// 	});
// }

// module.exports = {
// 	create,
// 	update,
// 	set,
// 	clear,
// 	generate,
// };

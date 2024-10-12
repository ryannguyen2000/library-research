const moment = require('moment');
const _ = require('lodash');

const { PromotionType } = require('@utils/const');
const models = require('@models');

async function create({ data, listingIds, ratePlanIds, roomTypeIds }) {
	const promotion = await models.tbPromotion.create({ ...data, listingIds, ratePlanIds });

	await syncPromotionPrice(listingIds, ratePlanIds, data.startDate, data.endDate);

	const meta = {
		id: promotion._id,
		listingIds,
		ratePlanIds,
	};

	return { data, meta };
}

async function update({ listingIds, ratePlanIds, data, meta, isSet, roomTypeIds }) {
	if (meta.id) {
		data.active = true;

		const allListingIds = _.uniq([...listingIds, ...meta.listingIds]);
		const allRatePlanIds = _.uniq([...ratePlanIds, ...(meta.ratePlanIds || [])]);

		// if (isSet) {
		data.listingIds = listingIds;
		data.ratePlanIds = ratePlanIds;
		// } else {
		// 	data.listingIds = allListingIds;
		// 	data.ratePlanIds = allRatePlanIds;
		// }

		await models.tbPromotion.updateOne({ _id: meta.id }, { $set: data }, { upsert: true });

		await syncPromotionPrice(allListingIds, allRatePlanIds, data.startDate, data.endDate);

		return {
			data,
			meta: {
				...meta,
				listingIds: data.listingIds,
				ratePlanIds: data.ratePlanIds,
			},
		};
	}

	return await create({ data, listingIds, ratePlanIds });
}

async function set({ listingIds, ratePlanIds, data, meta, roomTypeIds }) {
	if (!meta || !meta.id) {
		const results = await create({ data, listingIds, ratePlanIds, roomTypeIds });

		meta = _.assign(meta, results.meta);
	} else {
		const results = await update({ listingIds, ratePlanIds, data, meta, roomTypeIds, isSet: true });

		Object.assign(meta, results.meta);
	}

	return { data, meta };
}

async function clear({ listingIds: removeListingIds, ratePlanIds, roomTypeIds, data, meta }) {
	await models.tbPromotion.updateOne({ _id: meta.id }, { active: false });

	await syncPromotionPrice(
		_.uniq([...removeListingIds, ...meta.listingIds]),
		_.uniq([...ratePlanIds, ...(meta.ratePlanIds || [])]),
		data.startDate,
		data.endDate
	);

	return {
		data,
		meta: null,
	};
}

function getStayTime(datetime) {
	return moment(datetime).toDate();
}

const PromoType = {
	basic: PromotionType.Basic,
	last_minute: PromotionType.LastMinute,
	early_bird: PromotionType.EarlyBird,
	early_booker: PromotionType.EarlyBird,
};

function generate(data) {
	if (data.promoType === PromotionType.NightFlashSale) {
		return;
	}

	const type = PromoType[data.promoType] || data.promoType;

	let last_minute_amount = null;
	let early_booker_amount = null;

	if (type === PromoType.last_minute) {
		if (data.last_minute_unit === 1) {
			last_minute_amount = Number(data.last_minute_amount_days) * 24;
		} else {
			last_minute_amount = data.last_minute_amount_hours;
		}
	} else if (type === PromoType.early_bird) {
		early_booker_amount = Number(data.early_booker_amount) * 24;
	}

	return {
		type,
		name: data.name,
		discount: data.discount_amount,
		discount_type: data.discount_type,
		additional_discount: data.additional_discount_amount,
		early_booker_amount,
		last_minute_amount,
		min_stay_through: data.min_stay_through,
		listingIds: [],
		startDate: getStayTime(data.startDate),
		endDate: getStayTime(data.endDate),
		dayOfWeeks: data.dayOfWeeks,
		bookStartDate: getStayTime(data.bookStartDate),
		bookEndDate: getStayTime(data.bookEndDate),
		bookDayOfWeeks: data.bookDayOfWeeks,
	};
}

async function syncPromotionPrice(otaListingIds, ratePlanIds, from, to) {
	const listings = await models.Listing.find({
		OTAs: {
			$elemMatch: {
				otaListingId: { $in: otaListingIds },
			},
		},
		roomTypeId: { $ne: null },
	})
		.select('roomTypeId')
		.lean();

	await listings.asyncMap(listing =>
		ratePlanIds.asyncMap(ratePlanId =>
			models.tbPrice.calcPromotionPrice({
				roomTypeId: listing.roomTypeId,
				ratePlanId,
				from,
				to,
			})
		)
	);
}

module.exports = {
	create,
	update,
	set,
	clear,
	generate,
};

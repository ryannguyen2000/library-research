// const _ = require('lodash');

// const { PromotionType, OTAs } = require('@utils/const');
// // const { logger } = require('@utils/logger');
// const models = require('@models');
// // const { syncPriceListing } = require('@controllers/ota_api/synchronize/grabhotel');

// async function create(otaInfo, data, propertyId, listingIds) {
// 	const promotion = await models.tbPromotion.create({ ...data, listingIds });

// 	const meta = {
// 		id: promotion._id,
// 		listingIds,
// 	};

// 	// syncPrices(listingIds, otaInfo, data.startDate, data.endDate);

// 	return { data, meta };
// }

// async function update(otaInfo, propertyId, listingIds, ratePlans, data, meta) {
// 	if (meta.id) {
// 		data.active = true;
// 		data.listingIds = meta.listingIds;

// 		const promotion = await models.tbPromotion.findByIdAndUpdate(meta.id, { $set: data }, { new: true });

// 		// syncPrices(data.listingIds, otaInfo, data.startDate, data.endDate);

// 		return {
// 			data,
// 			meta: {
// 				...meta,
// 				id: promotion._id,
// 				listingIds: promotion.listingIds,
// 			},
// 		};
// 	}

// 	return await create(otaInfo, data, propertyId, listingIds, null);
// }

// async function set(otaInfo, propertyId, listingIds, ratePlans, data, meta) {
// 	if (!meta.id) {
// 		const results = await create(otaInfo, data, propertyId, listingIds);
// 		Object.assign(meta, results.meta);
// 	} else if (meta.listingIds && meta.id && !_.isEqual(meta.listingIds, listingIds)) {
// 		meta.listingIds = _.uniq((meta.listingIds || []).concat(listingIds));

// 		const results = await update(otaInfo, propertyId, [], [], data, meta);
// 		Object.assign(meta, results.meta);
// 	}

// 	return { data, meta };
// }

// async function clear(otaInfo, propertyId, removeListingIds, ratePlans, data, meta) {
// 	const listingIds = meta.listingIds.filter(id => !removeListingIds.includes(id));
// 	if (listingIds.length) {
// 		await update(otaInfo, propertyId, [], [], data, { ...meta, listingIds });
// 		// syncPrices(
// 		// 	meta.listingIds.filter(id => removeListingIds.includes(id)),
// 		// 	otaInfo,
// 		// 	data.startDate,
// 		// 	data.endDate
// 		// );
// 		return;
// 	}

// 	await models.tbPromotion.findByIdAndDelete(meta.id);
// 	// syncPrices(meta.listingIds, otaInfo, data.startDate, data.endDate);

// 	return {
// 		data,
// 	};
// }

// function getStayTime(datetime) {
// 	return new Date(datetime);
// }

// const PromoType = {
// 	basic: PromotionType.Basic,
// 	last_minute: PromotionType.LastMinute,
// 	early_bird: PromotionType.EarlyBird,
// 	early_booker: PromotionType.EarlyBird,
// };

// function generate(data) {
// 	const type = PromoType[data.promoType];

// 	let last_minute_amount = null;
// 	let early_booker_amount = null;
// 	if (type === PromoType.last_minute) {
// 		if (data.last_minute_unit === 1) {
// 			last_minute_amount = Number(data.last_minute_amount_days) * 24;
// 		} else {
// 			last_minute_amount = data.last_minute_amount_hours;
// 		}
// 	} else if (type === PromoType.early_bird) {
// 		early_booker_amount = Number(data.early_booker_amount) * 24;
// 	}

// 	return {
// 		type: PromoType[data.promoType],
// 		name: data.name,
// 		discount: data.discount_amount,
// 		early_booker_amount,
// 		last_minute_amount,
// 		min_stay_through: data.min_stay_through,
// 		ota: OTAs.Grabhotel,
// 		listingIds: [],
// 		startDate: getStayTime(data.startDate),
// 		endDate: getStayTime(data.endDate),
// 		dayOfWeeks: data.dayOfWeeks,
// 		bookStartDate: getStayTime(data.bookStartDate),
// 		bookEndDate: getStayTime(data.bookEndDate),
// 		bookDayOfWeeks: data.bookDayOfWeeks,
// 	};
// }

// // function syncPrices(listingIds, otaInfo, from, to) {
// // 	setTimeout(async () => {
// // 		const listings = await models.Listing.find({
// // 			OTAs: { $elemMatch: { otaName: OTAs.Grabhotel, active: true, otaListingId: { $in: listingIds } } },
// // 		}).select('OTAs roomIds blockId');

// // 		logger.info('auto sync price grabhotel promotion', listingIds);

// // 		await listings.asyncForEach(async listing => {
// // 			await syncPriceListing({ listing, otaInfo, from, to }).catch(e =>
// // 				logger.error('auto sync price grabhotel promotion error', listing, from, to, e)
// // 			);
// // 		});
// // 	}, 3000);
// // }

// module.exports = {
// 	create,
// 	update,
// 	set,
// 	clear,
// 	generate,
// };

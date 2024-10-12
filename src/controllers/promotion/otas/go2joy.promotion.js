const _ = require('lodash');
const moment = require('moment');

const { PromotionType, PromotionChangeType, OTAs } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
// const { resyncListingPrice } = require('@controllers/ota_api/synchronize/go2joy');
const fetchRetry = require('@utils/fetchRetry');

const URL = `https://api-ha.go2joy.vn/api/v2`;
const URL_V1 = `https://api-ha.go2joy.vn/api/v1`;
const OTAName = OTAs.Go2joy;

async function request({ uri, otaInfo, ...options }) {
	const res = await fetchRetry(uri, options, otaInfo);

	if (!res.ok) {
		logger.error('go2joy promotion request error', uri, options.body, await res.text());
		throw new Error(`go2joy promotion request error`);
	}

	const json = await res.json();

	if (json.code !== 1) {
		logger.error('go2joy promotion request error', uri, options.body, json);
		throw new Error(`go2joy promotion request error`);
	}

	return json.data;
}

function getRoomDetail({ data, otaInfo }) {
	const body = JSON.stringify(data);

	return request({
		uri: `${URL}/web/ha/directDiscount/getHotelForDirectDiscountList`,
		method: 'POST',
		body,
		otaInfo,
	});
}

function generateDiscounts({ promoType, discount, discount_type, additional_discount, roomDetail }) {
	const rs = {};

	if (discount_type === PromotionChangeType.VALUE) {
		if (promoType === PromotionType.Basic) {
			// if (roomDetail.priceOvernightOrigin) {
			// 	rs.priceOvernightAfterDiscount = roomDetail.priceOvernightOrigin - discount;
			// 	rs.overnightPercent = _.round((discount / roomDetail.priceOvernightOrigin) * 100);
			// }
			if (roomDetail.priceOneDayOrigin) {
				rs.priceOneDayAfterDiscount = roomDetail.priceOneDayOrigin - discount;
				rs.oneDayPercent = _.round((discount / roomDetail.priceOneDayOrigin) * 100);
			}
		}

		if (promoType === PromotionType.HourlySale) {
			if (roomDetail.priceFirstHoursOrigin) {
				rs.priceFirstHoursAfterDiscount = roomDetail.priceFirstHoursOrigin - discount;
				rs.firstHoursPercent = _.round((discount / roomDetail.priceFirstHoursOrigin) * 100);
			}
			if (roomDetail.priceAdditionHoursOrigin) {
				rs.priceAdditionHoursAfterDiscount = roomDetail.priceAdditionHoursOrigin - additional_discount;
				rs.additionHoursPercent = _.round((additional_discount / roomDetail.priceAdditionHoursOrigin) * 100);
			}
		}
	} else {
		const discountRate = 1 - discount / 100;

		if (promoType === PromotionType.Basic) {
			// if (roomDetail.priceOvernightOrigin) {
			// 	rs.priceOvernightAfterDiscount = _.round(discountRate * roomDetail.priceOvernightOrigin);
			// 	rs.overnightPercent = discount;
			// }
			if (roomDetail.priceOneDayOrigin) {
				rs.priceOneDayAfterDiscount = _.round(discountRate * roomDetail.priceOneDayOrigin);
				rs.oneDayPercent = discount;
			}
		}

		if (promoType === PromotionType.HourlySale) {
			if (roomDetail.priceFirstHoursOrigin) {
				rs.priceFirstHoursAfterDiscount = _.round(discountRate * roomDetail.priceFirstHoursOrigin);
				rs.firstHoursPercent = discount;
			}
			if (roomDetail.priceAdditionHoursOrigin) {
				const addDiscountRate = 1 - additional_discount / 100;

				rs.priceAdditionHoursAfterDiscount = _.round(addDiscountRate * roomDetail.priceAdditionHoursOrigin);
				rs.additionHoursPercent = additional_discount;
			}
		}
	}

	return rs;
}

async function createFlashSale({ data, propertyId, otaInfo, listingIds, ratePlanIds, meta }) {
	meta = _.assign(meta, {
		propertyId,
		listingIds,
		ratePlanIds,
		dayOfWeeks: data.dayOfWeeks,
		startDate: data.startDate,
		endDate: data.endDate,
		startTime: moment().format('HH:mm'),
	});

	if (data.dayOfWeeks) {
		let dindex = new Date().getDay();
		dindex = dindex === 0 ? 6 : dindex - 1;

		if (data.dayOfWeeks[dindex] === '0') return { meta, data };
	}

	await listingIds.asyncForEach(async listingId => {
		const flashSaleData = await request({
			uri: `${URL_V1}/web/ha/room-types/${listingId}/flash-sale`,
			method: 'GET',
			otaInfo,
		});

		if (flashSaleData.applyFlashSale) {
			await request({
				uri: `${URL_V1}/web/ha/room-types/${listingId}/flash-sale/cancel?_method=PUT`,
				method: 'POST',
				otaInfo,
			});
		}

		const lockStatus = await request({
			uri: `${URL_V1}/web/ha/room-types/${listingId}/flash-sale/lock-room-setting-check`,
			method: 'GET',
			otaInfo,
		});

		if (lockStatus === false) {
			flashSaleData.numOfRoom = data.numOfRoom;
			flashSaleData.startTime = meta.startTime;

			if (data.discount_type === PromotionChangeType.VALUE) {
				flashSaleData.priceFlashSale = _.round(flashSaleData.overnightOrigin - data.discount);
			} else {
				const discountRate = 1 - data.discount / 100;

				flashSaleData.priceFlashSale = _.round(discountRate * flashSaleData.overnightOrigin);
			}

			await request({
				uri: `${URL_V1}/web/ha/room-types/${listingId}/flash-sale?_method=PUT`,
				method: 'POST',
				body: JSON.stringify(flashSaleData),
				otaInfo,
			});
		}
	});

	return {
		data,
		meta,
	};
}

async function createGo2joyPromotion({ otaInfo, data, propertyId, listingIds }) {
	const { discount, discount_type, additional_discount, dayOfWeeks, startDate, endDate, promoType, ...bodyData } =
		data;

	const body = {
		...bodyData,
		...getDates({ startDate, endDate }),
		...getDays(dayOfWeeks),
		hotelSnList: [Number(propertyId)],
	};

	const [roomDetail] = await getRoomDetail({ data: body, otaInfo });

	const uri = `${URL}/web/ha/directDiscount/createDirectDiscount`;

	body.roomList = roomDetail.children
		.map(l => {
			const activeListing = listingIds.find(listingId => listingId === l.id.toString());

			if (!activeListing) return;

			const rs = {
				...l,
				isEdit: false,
				isUpdate: !!activeListing,
			};

			if (activeListing) {
				_.assign(
					rs,
					generateDiscounts({
						promoType,
						discount,
						discount_type,
						additional_discount,
						roomDetail: l,
					})
				);
			}

			return rs;
		})
		.filter(l => l);

	const g2jPromotion = await request({
		uri,
		method: 'POST',
		body: JSON.stringify(body),
		otaInfo,
	});

	return g2jPromotion;
}

async function create({ data, propertyId, otaInfo, listingIds, ratePlanIds, meta, promotion }) {
	if (data.promoType === PromotionType.NightFlashSale) {
		return createFlashSale({ data, propertyId, otaInfo, listingIds, ratePlanIds, meta });
	}

	const propertyPromotion = await models.Promotion.findOne({
		active: true,
		activeOTAs: OTAName,
		startDate: { $lte: new Date(data.endDate) },
		endDate: { $gte: new Date(data.startDate) },
		otaIds: {
			$elemMatch: { propertyId, 'meta.promotionId': { $ne: null }, 'meta.listingIds': { $in: listingIds } },
		},
		_id: { $ne: promotion._id },
	});

	meta = _.assign(meta, {
		propertyId,
		listingIds,
		ratePlanIds,
		startDate: data.startDate,
		endDate: data.endDate,
		dayOfWeeks: data.dayOfWeeks,
	});

	if (propertyPromotion) {
		const otaId = propertyPromotion.otaIds.find(o => o.propertyId === propertyId && o.meta.promotionId);

		await updateGo2joyPromotion({
			otaInfo,
			promotionId: otaId.meta.promotionId,
			listingIds,
			data,
		});

		meta.promotionId = otaId.meta.promotionId;

		return {
			data,
			meta,
		};
	}

	const g2jPromotion = await createGo2joyPromotion({
		otaInfo,
		data,
		propertyId,
		listingIds,
	});

	meta.promotionId = g2jPromotion.sn;

	return { data, meta };
}

async function updateGo2joyPromotion({ otaInfo, promotionId, listingIds, prevListingIds, data }) {
	const detail = await request({
		uri: `${URL}/web/ha/directDiscount/getDirectDiscountDetail?sn=${promotionId}`,
		method: 'GET',
		otaInfo,
	});

	const uri = `${URL}/web/ha/directDiscount/updateDirectDiscount`;

	const { promoType, discount, discount_type, additional_discount } = data;

	listingIds = _.uniq(listingIds);

	const roomList = listingIds
		.map(listingId => {
			const roomDetail = detail.hotelList[0].children.find(c => c.id.toString() === listingId);
			if (!roomDetail) return;

			const rs = {
				...roomDetail,
				isEdit: false,
				isUpdate: true,
				isCanDefault: true,
			};

			_.assign(
				rs,
				generateDiscounts({
					promoType,
					discount,
					discount_type,
					additional_discount,
					roomDetail,
				})
			);

			return rs;
		})
		.filter(r => r);

	if (prevListingIds) {
		prevListingIds = prevListingIds.filter(l => !listingIds.includes(l));

		prevListingIds.forEach(listingId => {
			const roomDetail = detail.hotelList[0].children.find(c => c.id.toString() === listingId);
			if (!roomDetail) return;

			const rs = {
				...roomDetail,
				isEdit: false,
				isUpdate: true,
				isCanDefault: true,
			};

			_.assign(
				rs,
				generateDiscounts({
					promoType,
					discount: 0,
					additional_discount: 0,
					roomDetail,
				})
			);

			roomList.push(rs);
		});
	}

	const body = JSON.stringify({
		sn: promotionId,
		hotelListSnFirstTime: [],
		hotelSnRemoveList: [],
		roomList,
	});

	await request({
		uri,
		method: 'PUT',
		body,
		otaInfo,
	});
}

async function update({ propertyId, listingIds, otaInfo, data, meta, ratePlanIds, promotion }) {
	if (meta && meta.promotionId) {
		const { dayOfWeeks, startDate, endDate } = data;
		const { startDate: newStartDate, endDate: newEndDate } = getDates({ startDate, endDate });

		if (
			(newStartDate !== new Date().toDateMysqlFormat() &&
				newStartDate !== new Date(meta.startDate).toDateMysqlFormat()) ||
			newEndDate !== new Date(meta.endDate).toDateMysqlFormat() ||
			dayOfWeeks !== meta.dayOfWeeks
		) {
			await clear({ otaInfo, data, meta, listingIds, promotion });
			return await create({ propertyId, listingIds, data, otaInfo, ratePlanIds, promotion });
		}

		await updateGo2joyPromotion({
			otaInfo,
			promotionId: meta.promotionId,
			listingIds,
			prevListingIds: meta.listingIds,
			data,
		});

		return {
			data,
			meta: {
				...meta,
				listingIds,
				ratePlanIds,
			},
		};
	}

	return await create({ propertyId, listingIds, data, otaInfo, ratePlanIds, meta, promotion });
}

async function set(data) {
	if (!data.meta.id) {
		const results = await create(data);
		Object.assign(data.meta, results.meta);
	} else {
		const results = await update(data);
		Object.assign(data.meta, results.meta);
	}

	return { data, meta: data.meta };
}

async function clear({ otaInfo, data, meta, listingIds, promotion }) {
	if (data.promoType === PromotionType.NightFlashSale) {
		await listingIds.asyncForEach(listingId =>
			request({
				uri: `${URL_V1}/web/ha/room-types/${listingId}/flash-sale/cancel?_method=PUT`,
				method: 'POST',
				otaInfo,
			})
		);

		return { data, meta };
	}

	if (!meta.promotionId) {
		return {
			data,
			meta: null,
		};
	}

	const propertyPromotion = await models.Promotion.findOne({
		active: true,
		activeOTAs: OTAName,
		startDate: { $lte: new Date(data.endDate) },
		endDate: { $gte: new Date(data.startDate) },
		otaIds: {
			$elemMatch: {
				propertyId: meta.propertyId,
				'meta.promotionId': { $ne: null },
				'meta.listingIds': { $in: meta.listingIds },
			},
		},
		_id: { $ne: promotion._id },
	});

	if (propertyPromotion) {
		await updateGo2joyPromotion({
			otaInfo,
			promotionId: meta.promotionId,
			listingIds,
			data: { promoType: data.promoType, discount: 0, additional_discount: 0 },
		});

		return { data, meta: null };
	}

	await request({
		uri: `${URL}/web/ha/directDiscount/deleteDirectDiscount?sn=${meta.promotionId}`,
		method: 'PUT',
		otaInfo,
	});

	return { data, meta: null };
}

function getDays(days) {
	const rs = {
		monday: 0,
		tuesday: 0,
		wednesday: 0,
		thursday: 0,
		friday: 0,
		saturday: 0,
		sunday: 0,
	};

	const arr = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

	days.split('').forEach((d, i) => {
		if (d === '1') {
			rs[arr[i]] = 1;
		}
	});

	return rs;
}

function getDates(data) {
	const startDate = _.max([new Date(data.startDate), new Date()]);
	const endDate = _.min([new Date(data.endDate), moment(startDate).add(1, 'year').subtract(1, 'day').toDate()]);

	return {
		startDate: startDate.toDateMysqlFormat(),
		endDate: endDate.toDateMysqlFormat(),
	};
}

function generate(data) {
	if (data.promoType === PromotionType.NightFlashSale) {
		return {
			name: data.name,
			startTime: moment().format('HH:mm'),
			startDate: moment().format('YYYY-MM-DD'),
			endDate: moment().format('YYYY-MM-DD'),
			numOfRoom: data.numOfRoom || 1,
			discount: data.discount_amount,
			dayOfWeeks: data.dayOfWeeks,
			promoType: data.promoType,
			discount_type: data.discount_type,
		};
	}

	if (data.promoType === PromotionType.Basic || data.promoType === PromotionType.HourlySale) {
		return {
			name: data.name,
			startTime: '',
			endTime: '',
			...getDates(data),
			specialDate: [],
			typeApply: 1,
			hotelSnList: [],
			isHotelGroup: true,
			discount: _.round(data.discount_amount),
			discount_type: data.discount_type,
			additional_discount: _.round(data.additional_discount_amount),
			// monday: 1,
			// tuesday: 1,
			// wednesday: 1,
			// thursday: 1,
			// friday: 1,
			// saturday: 1,
			// sunday: 1,
			...getDays(data.dayOfWeeks),
			dayOfWeeks: data.dayOfWeeks,
			typeHourly: 0,
			promoType: data.promoType,
			roomList: [
				// {
				// 	id: 7679,
				// 	label: 'One-bedroom Apartment',
				// 	priceFirstHoursOrigin: 0,
				// 	priceAdditionHoursOrigin: 0,
				// 	priceOvernightOrigin: 728000,
				// 	priceOneDayOrigin: 910000,
				// 	priceFirstHoursAfterDiscount: 0,
				// 	priceAdditionHoursAfterDiscount: 0,
				// 	priceOvernightAfterDiscount: 582400,
				// 	priceOneDayAfterDiscount: 728000,
				// 	firstHoursPercent: 0,
				// 	additionHoursPercent: 0,
				// 	overnightPercent: 20,
				// 	oneDayPercent: 20,
				// 	disabled: false,
				// 	status: null,
				// 	isEdit: false,
				// 	isUpdate: true,
				// },
			],
		};
	}
}

// const debouceCache = {};
// const timeout = 1000 * 15;

// const reSyncPrice = (key, ...args) => {
// 	if (debouceCache[key]) {
// 		clearTimeout(debouceCache[key]);
// 	}

// 	debouceCache[key] = setTimeout(() => {
// 		delete debouceCache[key];
// 		syncPrice(...args);
// 	}, timeout);
// };

// async function syncPrice(otaListingIds, from, to) {
// 	const otaName = OTAs.Go2joy;

// 	const listings = await models.Listing.find({
// 		roomIds: { $ne: [] },
// 		OTAs: { $elemMatch: { otaName, active: true, otaListingId: { $in: otaListingIds } } },
// 	}).select('OTAs roomIds blockId roomTypeId');

// 	await listings.asyncForEach(listing => {
// 		return resyncListingPrice(listing, from, to, [Services.Day]).catch(e =>
// 			logger.error(`reSyncPrice promotion price ${otaName} error`, listing._id, from, to, e)
// 		);
// 	});
// }

module.exports = {
	create,
	update,
	set,
	clear,
	generate,
};

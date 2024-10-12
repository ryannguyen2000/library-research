const moment = require('moment');
const _ = require('lodash');
// const mongoose = require('mongoose');

const { createCache } = require('@utils/cache');
const fetch = require('@utils/fetch');
const { OTAs } = require('@utils/const');
// const { rangeDate } = require('@utils/date');
// const { logger } = require('@utils/logger');
const { getGo2joyHeader } = require('@controllers/ota_api/header_helper');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const OTAName = OTAs.Go2joy;
const MAX_DAY = 10;
// const DAY_TO_SYNC_PRICE = 10;
const API_URL = 'https://api-ha.go2joy.vn/api/v1/web';
// const API_URL2 = 'https://api-ha.go2joy.vn/api/v2/web';
const LOCK_TYPE = {
	ALL: 0,
	HOUR: 1,
	NIGHT: 2,
	DAY: 3,
};
const MIN_START_TIME = '08:00';
const MAX_END_TIME = '23:00';

async function request({ uri, body, method = 'POST', otaConfig }) {
	const headers = {
		...getGo2joyHeader(otaConfig),
	};
	const result = await fetch(uri, {
		method,
		body,
		headers,
	});
	if (result.status !== 200) {
		throw new Error(
			`${OTAName} request API error ${method} ${uri} ${body} ${await result.text()} ${JSON.stringify(headers)}`
		);
	}
	const json = await result.json();
	if (json.code !== 1) {
		throw new Error(
			`${OTAName} request API error ${method} ${uri} ${body} ${JSON.stringify(json)} ${JSON.stringify(headers)}`
		);
	}
	return json.data;
}

function synchronizeSchedule(propertyId, otaListing, from, to, available, otaConfig, syncId, listing, hours) {
	if (!otaConfig || moment().add(MAX_DAY, 'day').isBefore(from, 'day')) return;

	const calendars = addCalendar(syncId);

	const roomTypeId = otaListing.otaListingId;
	calendars[roomTypeId] = calendars[roomTypeId] || {
		otaConfig,
		propertyId,
		dates: {},
	};

	calendars[roomTypeId].dates[from.toDateMysqlFormat()] = available !== 0;
	_.set(calendars, [roomTypeId, 'hours', from.toDateMysqlFormat()], hours || []);
}

async function getRoomTypeLocks(hotelSn, roomSn, otaConfig) {
	const data = await request({
		// uri: `${API_URL}/ha/room-types/lockRoomSetting/getHistoryLockDateHotel`,
		uri: `https://api-ha.go2joy.vn/api/v1/roomType/getLockList`,
		otaConfig,
		body: JSON.stringify({
			hotelSn,
			roomTypeSnList: [0, roomSn],
			lockTypeList: [LOCK_TYPE.HOUR, LOCK_TYPE.NIGHT, LOCK_TYPE.DAY],
			limit: 100,
			page: 1,
		}),
	});

	return _.get(data, 'lockList') || [];
}

async function syncDone(syncId) {
	const calendars = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);
	const today = new Date().toDateMysqlFormat();

	await _.entries(calendars)
		.filter(([key]) => key !== 'createdAt')
		.asyncForEach(async ([roomTypeId, data]) => {
			if (!data) return;
			const locks = await getRoomTypeLocks(data.propertyId, roomTypeId, data.otaConfig);
			const deleteLocks = locks.filter(l => l.endDate < today || data.dates[l.startDate]);

			// clear locks
			await deleteLocks.asyncMap(lock =>
				request({
					uri: `${API_URL}/ha/room-types/lockRoomSetting/deleteLockDateHotel`,
					otaConfig: data.otaConfig,
					body: JSON.stringify({
						hotelSn: data.propertyId,
						lockId: lock.lockId,
						lockType: lock.lockType,
					}),
				})
			);

			const newLocks = _.entries(data.dates)
				.filter(([date, available]) => !available)
				.map(([date]) => date);

			// Create new locks
			await newLocks.asyncForEach(async date => {
				// Lock Day
				await request({
					uri: `${API_URL}/ha/room-types/lockRoomSetting/createLockDateHotel`,
					otaConfig: data.otaConfig,
					body: JSON.stringify({
						hotelSn: data.propertyId,
						roomTypeSn: roomTypeId,
						startDate: date,
						endDate: date,
						startTime: '',
						endTime: '',
						lockType: LOCK_TYPE.DAY,
						cancelFS: 1,
					}),
				});
				// Lock night
				await request({
					uri: `${API_URL}/ha/room-types/lockRoomSetting/createLockDateHotel`,
					otaConfig: data.otaConfig,
					body: JSON.stringify({
						hotelSn: data.propertyId,
						roomTypeSn: roomTypeId,
						startDate: date,
						endDate: date,
						startTime: '',
						endTime: '',
						lockType: LOCK_TYPE.NIGHT,
						cancelFS: 1,
					}),
				});
			});

			// New hour locks
			const hourNewLocks = [];
			_.entries(data.hours).forEach(([date, _hours]) => {
				_.forEach(_hours, hour => {
					const fromHour = _.max([hour.fromHour, MIN_START_TIME]);
					const toHour = _.min([hour.toHour, MAX_END_TIME]);

					if (toHour > fromHour) {
						hourNewLocks.push({
							date,
							toHour,
							fromHour,
						});
					}
				});
			});

			await hourNewLocks.asyncForEach(lock =>
				request({
					uri: `${API_URL}/ha/room-types/lockRoomSetting/createLockDateHotel`,
					otaConfig: data.otaConfig,
					body: JSON.stringify({
						hotelSn: data.propertyId,
						roomTypeSn: roomTypeId,
						startDate: lock.date,
						endDate: lock.date,
						startTime: lock.fromHour,
						endTime: lock.toHour,
						lockType: LOCK_TYPE.HOUR,
						cancelFS: 0,
					}),
				})
			);
		});
}

// function getBookingSn({ otaBookingId, other }) {
// 	return _.get(other, 'sn') || `${Number(otaBookingId) - 100000}`;
// }

// async function syncCheckin({ booking, otaConfig }) {
// 	await request({
// 		uri: `${API_URL}/ha/user-bookings/${getBookingSn(booking)}/confirm`,
// 		method: 'PUT',
// 		otaConfig,
// 	});
// }

// function getDirectDiscounts(keyword, otaConfig) {
// 	return request({
// 		uri: `${API_URL2}/ha/directDiscount/getDirectDiscountList?keyword=${encodeURIComponent(
// 			keyword
// 		)}&status=1&limit=500&page=1`,
// 		method: 'GET',
// 		otaConfig,
// 	});
// }

// function getRoomDetail(otaPropertyId, dates, otaConfig) {
// 	const body = JSON.stringify({
// 		specialDate: dates,
// 		typeApply: 2,
// 		hotelSnList: [otaPropertyId],
// 		isHotelGroup: true,
// 		monday: 0,
// 		tuesday: 0,
// 		wednesday: 0,
// 		thursday: 0,
// 		friday: 0,
// 		saturday: 0,
// 		sunday: 0,
// 		typeHourly: 0,
// 	});

// 	return request({
// 		uri: `${API_URL2}/ha/directDiscount/getHotelForDirectDiscountList`,
// 		method: 'POST',
// 		body,
// 		otaConfig,
// 	});
// }

// async function addDiscount(data, otaConfig) {
// 	const body = JSON.stringify({
// 		startDate: '',
// 		endDate: '',
// 		startTime: '',
// 		endTime: '',
// 		monday: 0,
// 		tuesday: 0,
// 		wednesday: 0,
// 		thursday: 0,
// 		friday: 0,
// 		saturday: 0,
// 		sunday: 0,
// 		typeHourly: 0,
// 		typeApply: 2,
// 		isHotelGroup: true,
// 		...data,
// 	});
// 	// console.log('addDiscount', data);

// 	return request({
// 		uri: `${API_URL2}/ha/directDiscount/createDirectDiscount`,
// 		method: 'POST',
// 		otaConfig,
// 		body,
// 	});
// }

// function deleteDiscount(id, otaConfig) {
// 	return request({
// 		uri: `${API_URL2}/ha/directDiscount/deleteDirectDiscount?sn=${id}`,
// 		method: 'PUT',
// 		otaConfig,
// 	});
// }

// function updateDiscount(body, otaConfig) {
// 	// console.log('updateDiscount', body);

// 	return request({
// 		uri: `${API_URL2}/ha/directDiscount/updateDirectDiscount`,
// 		method: 'PUT',
// 		body: JSON.stringify({
// 			hotelListSnFirstTime: [],
// 			hotelSnRemoveList: [],
// 			...body,
// 		}),
// 		otaConfig,
// 	});
// }

// function detailDiscount(id, otaConfig) {
// 	return request({
// 		uri: `${API_URL2}/ha/directDiscount/getDirectDiscountDetail?sn=${id}`,
// 		method: 'GET',
// 		otaConfig,
// 	});
// }

// const dayMapper = {
// 	1: 'sunday',
// 	2: 'monday',
// 	3: 'tuesday',
// 	4: 'wednesday',
// 	5: 'thursday',
// 	6: 'friday',
// 	7: 'saturday',
// };

// async function synchronizePrice({
// 	propertyId,
// 	otaListing,
// 	from,
// 	to,
// 	price,
// 	otaConfig,
// 	daysOfWeek,
// 	ratePlanId,
// 	...otherData
// }) {
// 	const today = new Date();

// 	const ffrom = _.max([from, today]);
// 	const tto = _.min([to, moment().add(DAY_TO_SYNC_PRICE, 'day').toDate()]);

// 	const appliedDates = {};

// 	const promotions = price
// 		? await mongoose.model('tbPromotion').findPromotionsForListing(otaListing.otaListingId, ratePlanId, OTAName)
// 		: [];

// 	rangeDate(ffrom, tto)
// 		.toArray()
// 		.forEach(date => {
// 			const day = (date.getDay() + 1).toString();
// 			if (daysOfWeek && daysOfWeek.length && !daysOfWeek.includes(day)) return;

// 			const dateStr = date.toDateMysqlFormat();

// 			if (price) {
// 				const { discount = 0 } =
// 					_.maxBy(
// 						promotions.filter(p => p.isMatchDate(date)),
// 						'discount'
// 					) || {};

// 				const promotionPrice = discount ? Math.ceil(price * (1 - discount / 100)) : price;

// 				_.set(appliedDates, [dateStr, 'priceOneDay'], promotionPrice);
// 			}

// 			const priceFirstHours = _.get(otherData, 'promotionPriceFirstHours') || _.get(otherData, 'priceFirstHours');
// 			if (priceFirstHours) {
// 				_.set(appliedDates, [dateStr, 'priceFirstHours'], priceFirstHours);
// 			}
// 			const priceAdditionalHours =
// 				_.get(otherData, 'promotionPriceAdditionalHours') || _.get(otherData, 'priceAdditionalHours');
// 			if (priceAdditionalHours) {
// 				_.set(appliedDates, [dateStr, 'priceAdditionalHours'], priceAdditionalHours);
// 			}
// 		});

// 	const dates = _.keys(appliedDates);
// 	if (!dates.length) return;

// 	const [hotelDetail] = await getRoomDetail(propertyId, _.take(dates, 1), otaConfig);
// 	const currentDiscounts = await getDirectDiscounts(hotelDetail.label, otaConfig);

// 	const prevData = {};

// 	currentDiscounts.directDiscountList.forEach(discountData => {
// 		const override = discountData.specialDate.some(sd => appliedDates[sd]);
// 		if (override) {
// 			prevData[discountData.specialDate[0]] = prevData[discountData.specialDate[0]] || [];
// 			prevData[discountData.specialDate[0]].push(discountData);
// 		}
// 	});

// 	let hasUpdated = false;

// 	await _.entries(appliedDates).asyncForEach(async ([date, prices]) => {
// 		const prevDiscounts = prevData[date];
// 		let hDetail;
// 		let detail;

// 		if (prevDiscounts) {
// 			const details = await prevDiscounts.asyncMap(d => detailDiscount(d.sn, otaConfig));
// 			detail = details.find(d =>
// 				d.hotelList.some(h => h.children.find(c => _.toString(c.id) === otaListing.otaListingId))
// 			);
// 			if (detail) {
// 				hDetail = _.head(detail.hotelList);
// 			}
// 		}
// 		if (!hDetail) {
// 			hDetail = hotelDetail;
// 		}

// 		let current = hDetail.children.find(c => _.toString(c.id) === otaListing.otaListingId);
// 		if (!current) {
// 			current = hotelDetail.children.find(c => _.toString(c.id) === otaListing.otaListingId);
// 		}
// 		if (!current) {
// 			throw new Error('Not found roomtype', otaListing.otaListingId);
// 		} else {
// 			current = _.cloneDeep(current);
// 		}

// 		if (prices.priceOneDay && prices.priceOneDay < current.priceOneDayOrigin) {
// 			current.isUpdate = true;
// 			current.priceOneDayAfterDiscount = prices.priceOneDay;
// 			current.oneDayPercent = _.round((1 - current.priceOneDayAfterDiscount / current.priceOneDayOrigin) * 100);
// 		}
// 		if (prices.priceOneDay && prices.priceOneDay < current.priceOvernightOrigin) {
// 			current.isUpdate = true;
// 			current.priceOvernightAfterDiscount = prices.priceOneDay;
// 			current.overnightPercent = _.round(
// 				(1 - current.priceOvernightAfterDiscount / current.priceOvernightOrigin) * 100
// 			);
// 		}
// 		if (prices.priceFirstHours && prices.priceFirstHours < current.priceFirstHoursOrigin) {
// 			current.isUpdate = true;
// 			current.priceFirstHoursAfterDiscount = prices.priceFirstHours;
// 			current.firstHoursPercent = _.round(
// 				(1 - current.priceFirstHoursAfterDiscount / current.priceFirstHoursOrigin) * 100
// 			);
// 		}
// 		if (prices.priceAdditionalHours && prices.priceAdditionalHours < current.priceAdditionHoursOrigin) {
// 			current.isUpdate = true;
// 			current.priceAdditionHoursAfterDiscount = prices.priceAdditionalHours;
// 			current.additionHoursPercent = _.round(
// 				(1 - current.priceAdditionHoursAfterDiscount / current.priceAdditionHoursOrigin) * 100
// 			);
// 		}

// 		if (current.isUpdate) {
// 			hasUpdated = true;
// 			if (detail) {
// 				current.isCanDefault = true;
// 				await updateDiscount(
// 					{
// 						sn: detail.sn,
// 						roomList: [current],
// 					},
// 					otaConfig
// 				);
// 			} else {
// 				const roomList = hotelDetail.children.map(c => (c.id === current.id ? current : c));
// 				await addDiscount(
// 					{
// 						hotelSnList: [propertyId],
// 						specialDate: [date],
// 						roomList,
// 						name: hotelDetail.label,
// 					},
// 					otaConfig
// 				);
// 			}
// 		}
// 	});

// 	if (hasUpdated) {
// 		await Promise.delay(1000);
// 	}
// }

// async function resyncListingPrice(listing, from, to, serviceTypes) {
// 	const otaListing = listing.getOTA(OTAName);
// 	if (!otaListing) return;

// 	const today = new Date();
// 	from = _.min([from || today, today]);
// 	to = to || moment(from).add(DAY_TO_SYNC_PRICE, 'day').toDate();

// 	const propertyId = await mongoose
// 		.model('Block')
// 		.getPropertyIdOfABlock(listing.blockId, OTAName, otaListing.account);

// 	if (!propertyId) {
// 		return Promise.reject(`Not found propertyId ${listing.blockId} ${OTAName} ${otaListing.account}`);
// 	}

// 	const [otaConfig] = await mongoose.model('OTAManager').findByName(OTAName, otaListing.account);
// 	if (!otaConfig) {
// 		return Promise.reject(`Not found otaConfig  ${OTAName} ${otaListing.account}`);
// 	}

// 	const ratePlans = await mongoose.model('RatePlan').findParentRates({
// 		_id: _.map(otaListing.rates, 'ratePlanId'),
// 		serviceType: { $in: serviceTypes },
// 	});

// 	await ratePlans.asyncForEach(async ratePlan => {
// 		const prices = await mongoose.model('PriceHistory').getPrices({
// 			blockId: listing.blockId,
// 			roomTypeId: listing.roomTypeId,
// 			ratePlanId: ratePlan._id,
// 			from,
// 			to,
// 			ota: OTAName,
// 		});

// 		await prices.reverse().asyncForEach(pre => {
// 			return synchronizePrice({
// 				propertyId,
// 				otaListing,
// 				ratePlanId: ratePlan._id,
// 				from,
// 				to,
// 				otaConfig,
// 				..._.pick(pre, [
// 					'daysOfWeek',
// 					'price',
// 					'priceFirstHours',
// 					'promotionPriceFirstHours',
// 					'priceAdditionalHours',
// 					'promotionPriceAdditionalHours',
// 				]),
// 			}).catch(e => {
// 				logger.error('resyncListingPrice.synchronizePrice', e);
// 			});
// 		});
// 	});
// }

module.exports = {
	synchronizeSchedule,
	syncDone,
	// syncCheckin,
	// synchronizePrice,
	// resyncListingPrice,
};

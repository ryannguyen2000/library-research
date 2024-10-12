/* eslint-disable prefer-destructuring */
/* eslint-disable guard-for-in */
const _ = require('lodash');
const moment = require('moment');

// const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const { createCache } = require('@utils/cache');
const { OTA_ACCOUNT_TYPE, Currency, CurrencyConvert } = require('@utils/const');
const { groupDates } = require('@utils/date');
const { requestToCtrip } = require('@controllers/ota_api/utils');

// const headerHelper = require('@controllers/ota_api/header_helper');
const CM_API = require('./cm_api/ctrip');

const URL = 'https://ebooking.trip.com';
const MAX_DAY = 365;

const { addCalendar, deleteCalendar, getCalendar } = createCache();

/**
 * Synchronize schedule
 * @param {string} otaListingId
 * @param {Date} from
 * @param {Date} to
 * @param {Object} otaInfo
 * @param {Number} available
 * @param {otaInfo} otaInfo
 */
function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaInfo, syncId) {
	if (moment().add(MAX_DAY, 'day').toDate().zeroHours() < from) return;

	const calendars = addCalendar(syncId);
	const listingId = otaListing.otaListingId.toString();

	if (!calendars[otaPropertyId]) {
		calendars[otaPropertyId] = {};
	}
	if (!calendars[otaPropertyId][otaInfo.account]) {
		calendars[otaPropertyId][otaInfo.account] = { listingIds: {}, otaInfo };
	}

	if (!calendars[otaPropertyId][otaInfo.account].listingIds[listingId]) {
		calendars[otaPropertyId][otaInfo.account].listingIds[listingId] = [];
	}

	calendars[otaPropertyId][otaInfo.account].listingIds[listingId].push({
		date: from,
		available,
		rateIds: _.map(otaListing.rates, 'rateId'),
	});
}

async function syncDone(syncId) {
	const calendars = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	for (const hotelID in calendars) {
		if (hotelID === 'createdAt') continue;

		for (const account in calendars[hotelID]) {
			const { otaInfo, listingIds } = calendars[hotelID][account];

			const items = [];

			for (const listingId in listingIds) {
				_.forEach(_.groupBy(listingIds[listingId], 'available'), (group, available) => {
					available = parseInt(available);

					groupDates(group.map(item => item.date)).forEach(([from, to]) => {
						items.push({
							available,
							start: from.toDateMysqlFormat(),
							end: to.toDateMysqlFormat(),
							roomTypeId: listingId,
							rateIds: group[0].rateIds,
						});
					});
				});
			}

			if (otaInfo.other.account_type === OTA_ACCOUNT_TYPE.CM_API) {
				await CM_API.updateSchedule(otaInfo, hotelID, items);
			} else {
				await items.asyncMap(item => updateSchedule(otaInfo, hotelID, item));
			}
		}
	}
}

async function updateSchedule(otaInfo, hotelID, data) {
	const uri = `${URL}/ebkovsroom/api/inventory/setbatchroombookablestatus`;

	const { available, roomTypeId, start, end } = data;

	const body = {
		hotelRoomInfoDtoList: [
			{
				hotelID,
				roomTypeID: roomTypeId,
			},
		],
		dateItemInfoDtoList: [
			{
				startDate: start,
				endDate: end,
			},
		],
		roomStatus: available ? 'G' : 'N',
		pageType: 'F',
		weekDayIndex: '1111111',
		processType: 3,
		noBookReason: '',
		bedStatus: '',
		bookable: '',
	};

	if (available) {
		Object.assign(body, {
			checkType: '',
			contractAllotmentType: '',
			contractAllotmentNum: 0,
			remainingRoomType: 'Set',
			remainingRoomNum: available,
			fsType: '',
			alltomentTimeFlag: 'N',
			restorable: 'N',
			restorableFlag: 'N',
			tempallotment: '',
			totalQuantityNum: 0,
			totalQuantityType: '',
			limitSaleType: 'L',
		});
	}

	const bodyStr = JSON.stringify(body);

	const res = await requestToCtrip({
		url: uri,
		options: {
			method: 'POST',
			body: bodyStr,
		},
		otaConfig: otaInfo,
		hotelId: hotelID,
	});

	if (!res.ok) {
		throw new Error(`Ctrip updateSchedule error: ${roomTypeId} ${bodyStr} ${await res.text()}`);
	}

	const json = await res.json();

	if (json.code !== 200) {
		throw new Error(`Ctrip updateSchedule error: ${roomTypeId} ${bodyStr} ${JSON.stringify(json)}`);
	}
}

/**
 * Synchronize price schedule
 * @param {string} otaListingId
 * @param {Date} from
 * @param {Date} to
 * @param {Object} otaInfo
 * @param {Object} ratePlans
 * @param {otaInfo} otaInfo
 */

function getDaysString(daysOfWeek) {
	const arrTemp = new Array(7).fill('0');
	daysOfWeek.forEach(d => {
		const num = parseInt(d);
		if (num === 1) arrTemp[arrTemp.length - 1] = '1';
		else arrTemp[num - 2] = '1';
	});
	return arrTemp.join('');
}

async function synchronizePrice({ propertyId, otaListing, from, to, price, otaConfig, daysOfWeek, rateIds }) {
	if (!otaConfig) return;

	if (otaListing.currency && otaListing.currency !== Currency.VND) {
		otaListing.currency = otaListing.currency || Currency.USD;
		price /= CurrencyConvert[otaListing.currency] || 1;
		price = parseInt(price);
	}

	if (otaConfig.other.account_type === OTA_ACCOUNT_TYPE.CM_API) {
		await CM_API.synchronizePrice({ propertyId, otaListing, from, to, price, otaConfig, daysOfWeek, rateIds });
		return;
	}

	const uri = `${URL}/ebkovsroom/api/inventory/batchsetroompricev2`;
	const costPrice = price * 0.85;
	const body = {
		// hotelID: parseInt(otaPropertyId),
		roomPriceInfoList: [
			{
				roomTypeID: otaListing.otaListingId,
				hotelID: propertyId,
				payType: 'PP',
				weekDayIndex: daysOfWeek ? getDaysString(daysOfWeek) : '1111111',
				costPrice,
				currency: 'VND',
				salePrice: price,
				commissionRate: 0.15,
				commissionValue: price - costPrice,
				mealNum: -100,
				serviceFeeRate: 0,
				person: 0,
				// mealNum: -100,
				refRoomIDs: [],
			},
		],
		dateRangeInfo: [
			{
				startDate: from.toDateMysqlFormat(),
				endDate: to.toDateMysqlFormat(),
			},
		],
		operateType: 1,
		pageType: 'S',
		checkIllegalCommission: 'T',
		priceChangeMode: 2,
		uniformlyIncreaseAndDecreaseRate: false,
		weekend: '1100',
	};

	const response = await requestToCtrip({
		url: uri,
		options: {
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaConfig,
		hotelId: propertyId,
	});

	if (!response.ok) {
		throw new Error(
			`Ctrip synchronizePrice -> error ${propertyId} ${otaListing.otaListingId} ${JSON.stringify(response)}`
		);
	}

	const result = await response.json();

	if (!result || result.code !== 200) {
		throw new Error(
			`Ctrip synchronizePrice -> error ${propertyId} ${otaListing.otaListingId} ${JSON.stringify(result)}`
		);
	}
	return result;
}

async function fetchRoomsToSell({ propertyId, otaListingInfo, from, to, otaInfo }) {
	if (!otaInfo || otaInfo.other.account_type === OTA_ACCOUNT_TYPE.CM_API) return;

	const uri = `${URL}/ebkovsroom/api/inventory/roomstatus`;

	const data = {
		hotelRoomInfoDtoList: [
			{
				hotelID: propertyId,
				roomTypeID: otaListingInfo.otaListingId,
				roomClass: otaListingInfo.otaListingId,
				payType: 'PP',
			},
		],
		startDate: from.toDateMysqlFormat(),
		endDate: to.toDateMysqlFormat(),
	};
	const rs = {};

	try {
		const result = await requestToCtrip({
			url: uri,
			options: {
				method: 'POST',
				body: JSON.stringify(data),
			},
			otaConfig: otaInfo,
			hotelId: propertyId,
		}).then(res => res.json());

		if (result.code === 200 && result.data) {
			result.data.forEach(item => {
				rs[item.effectDate] = item.roomStatus === 'N' ? 0 : item.canUsedQuantity;
			});
		} else {
			logger.error('Ctrip fetchRoomsToSell Error', result);
		}
		return rs;
	} catch (e) {
		logger.error('Ctrip fetchRoomsToSell Error', e);
		return rs;
	}
}

module.exports = {
	synchronizeSchedule,
	synchronizePrice,
	fetchRoomsToSell,
	syncDone,
};

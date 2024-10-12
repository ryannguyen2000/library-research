const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');

const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const { createCache } = require('@utils/cache');
const { rangeDate } = require('@utils/date');
const { getAgodaHeader } = require('@controllers/ota_api/header_helper');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const SyncUri = 'https://ycs.agoda.com/en-us/Calendar/Save//';
const SyncUriv2 = 'https://ycs.agoda.com/homes/en-us/api/v2/calendar?p=';
const SyncMultiRoomUri = 'https://ycs.agoda.com/en-us/{hotelId}/kipp/api/AvailabilityRatesApi/Save?';

const MAX_DAY = 365;

function getHotelIds(otaListingId) {
	const str = otaListingId.split(',');
	return { hotelId: str[0] ? str[0].trim() : str[0], roomTypeId: str[1] ? str[1].trim() : str[1] };
}

const TIMEOUT = 8000;
const TIMEOUT_LONG = 120 * 1000;

async function scheduleApi1(otaPropertyId, otaListing, from, to, available, otaConfig, isMuti) {
	const { hotelId, roomTypeId } = getHotelIds(otaListing.otaListingId);
	const uri = SyncUri + hotelId;

	const headers = getAgodaHeader(otaConfig, {
		'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
		referer: 'https://ycs.agoda.com/homes/en-us/hostManage',
	});
	const requestBody = {
		HotelID: hotelId,
		RoomTypeID: roomTypeId,
		StartDateStr: from.toDateMysqlFormat(),
		EndDateStr: to.toDateMysqlFormat(),
		IsBasic: false,
		IsNHA: true,
		DaysOfWeek: null,
		RoomAllotmentList: [
			{
				RoomTypeID: roomTypeId,
				Closeout: available === 0 ? 1 : 0,
				Regular: available,
				Guaranteed: -1,
				CloseoutArrival: 2,
				CloseoutDeparture: 2,
			},
		],
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(requestBody),
			headers,
			timeout: isMuti ? TIMEOUT : TIMEOUT_LONG,
		},
		otaConfig
	);
	if (result && result.status !== 200) {
		const data = await result.text();
		throw new Error(`Agoda scheduleApi1 ${hotelId} ${roomTypeId} ${data}`);
	}
}

async function scheduleApi2(otaPropertyId, otaListing, from, to, available, otaConfig, isMuti) {
	const { hotelId, roomTypeId } = getHotelIds(otaListing.otaListingId);
	const uri = SyncMultiRoomUri.replace('{hotelId}', hotelId);

	const headers = getAgodaHeader(otaConfig, {
		referer: 'https://ycs.agoda.com/homes/en-us/hostManage',
	});
	const requestBody = {
		HotelID: hotelId,
		RoomTypeID: roomTypeId,
		StartDateStr: from.toDateMysqlFormat(),
		EndDateStr: to.toDateMysqlFormat(),
		IsBasic: true,
		IsNHA: false,
		DaysOfWeek: null,
		RoomAllotmentList: [
			{
				RoomTypeID: roomTypeId,
				Closeout: available === 0 ? 1 : 0,
				Regular: available,
				Guaranteed: -1,
				CloseoutArrival: 2,
				CloseoutDeparture: 2,
			},
		],
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(requestBody),
			headers,
			timeout: isMuti ? TIMEOUT : TIMEOUT_LONG,
		},
		otaConfig
	).then(res => res.json());

	if (!result || !result.IsSuccess) {
		throw new Error(`Agoda scheduleApi2 ${hotelId} ${roomTypeId} ${JSON.stringify(result, '', 2)}`);
	}
}

async function syscheduleApiV2(otaPropertyId, otaListing, from, to, available, otaConfig, price, isMuti) {
	const uri = SyncUriv2 + otaListing.otaListingId;

	const headers = getAgodaHeader(otaConfig, {
		referer: 'https://ycs.agoda.com/homes/en-us/hostManage',
	});
	const requestBody = {
		rates: { singleAndDouble: price, full: 0 },
		isAvailable: available,
		dateRange: {
			startDate: from.toDateMysqlFormat(),
			endDate: to.toDateMysqlFormat(),
		},
		maxOccupency: 2,
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(requestBody),
			headers,
			timeout: isMuti ? TIMEOUT : TIMEOUT_LONG,
		},
		otaConfig
	);

	if (result && result.status !== 200) {
		const data = await result.text();
		throw new Error(`Agoda syscheduleApiV2 ${otaListing.otaListingId} ${available} ${data}`);
	}
	const json = await result.json();
	if (json.success === false) {
		throw new Error(`Agoda syscheduleApiV2 ${otaListing.otaListingId} ${available} ${JSON.stringify(json)}`);
	}
}

/**
 * Synchronize schedule
 * @param {string} otaListingId
 * @param {Date} from
 * @param {Date} to
 * @param {Object} otaInfo
 * @param {Number} available
 * @param {otaInfo} otaInfo
 */
function synchronizeSchedule(
	otaPropertyId,
	otaListing,
	from,
	to,
	available,
	otaInfo,
	syncId,
	listing,
	unavailableHours,
	isMuti
) {
	if (!otaInfo) return;

	if (moment().add(MAX_DAY, 'day').toDate().zeroHours() < from) return;

	const calendars = addCalendar(syncId);

	calendars.properties = calendars.properties || {};
	if (!calendars.properties[otaPropertyId]) {
		calendars.properties[otaPropertyId] = { data: [] };
	}

	const data = [];
	if (from.getTime() === to.getTime()) {
		data.push({
			available,
			otaListing,
			date: from,
			isMuti,
		});
	} else {
		for (const date of rangeDate(from, to, true)) {
			data.push({
				available,
				date,
				otaListing,
				isMuti,
			});
		}
	}

	calendars.properties[otaPropertyId].data = [...calendars.properties[otaPropertyId].data, ...data];
	calendars.properties[otaPropertyId].otaPropertyId = otaPropertyId;
	calendars.properties[otaPropertyId].otaInfo = otaInfo;
}

async function getRoomDetail(otaListingId, otaConfig) {
	const { hotelId, roomTypeId } = getHotelIds(otaListingId);

	const uri = `https://ycs.agoda.com/en-us/${hotelId}/kipp/api/roomtype/GetRoomType?roomTypeId=${roomTypeId}`;
	const headers = getAgodaHeader(otaConfig);
	const result = await fetchRetry(
		uri,
		{
			headers,
		},
		otaConfig
	)
		.then(res => res.json())
		.catch(() => null);

	return _.get(result, 'Data.Room');
}

function getDiscountByOccupancy(maxOcc) {
	const DiscountByOccupancy = {};
	new Array(maxOcc || 2).fill('').forEach((n, index) => {
		DiscountByOccupancy[index + 1] = 0;
	});
	return DiscountByOccupancy;
}

async function getOccupancy(listingId, otaListing, otaConfig) {
	const listing = await mongoose.model('Listing').findById(listingId).select('info roomIds');

	let maxOcc = listing.info.maxOccupancy;

	if (!maxOcc || maxOcc !== listing.roomIds.length) {
		const roomDetail = await getRoomDetail(otaListing.otaListingId, otaConfig);
		if (roomDetail && roomDetail.MaxOccupancy) {
			maxOcc = roomDetail.MaxOccupancy;
			// listing.set('info.maxOccupancy', maxOcc);
			// await listing.save();

			await mongoose.model('Listing').updateOne(
				{
					_id: listing._id,
				},
				{
					'info.maxOccupancy': maxOcc,
				}
			);
		} else {
			maxOcc = maxOcc || listing.roomIds.length;
		}
	}

	return maxOcc;
}

async function priceApi1(otaPropertyId, otaListing, from, to, rateIds, price, otaConfig, DaysOfWeek, listingId) {
	const { hotelId, roomTypeId } = getHotelIds(otaListing.otaListingId);
	const uri = SyncUri + hotelId;

	const headers = getAgodaHeader(otaConfig, {
		'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
		referer: 'https://ycs.agoda.com/homes/en-us/hostManage',
	});

	const maxOcc = await getOccupancy(listingId, otaListing, otaConfig);

	const DiscountByOccupancy = getDiscountByOccupancy(maxOcc);

	const body = JSON.stringify({
		HotelID: hotelId,
		RoomTypeID: roomTypeId,
		StartDateStr: from.toDateMysqlFormat(),
		EndDateStr: to.toDateMysqlFormat(),
		IsBasic: false,
		IsNHA: true,
		DaysOfWeek: DaysOfWeek || null,
		RoomRateList: rateIds.map(rateId => [
			{
				RoomTypeID: roomTypeId,
				RateCategoryID: rateId,
				OccupancyRate: price,
				OccupancyRateOri: price,
				Closeout: 0,
				HasLinked: false,
				LinkedRateCategoryID: 0,
				SingleRate: price,
				DoubleRate: price,
				FullRate: price,
				ExtraBedRate: -1,
				MinStay: -2,
				MaxStay: -2,
				MinNightsStayThrough: -2,
				MaxNightsStayThrough: -2,
				MaxOfMinStay: 1,
				DiscountByOccupancy,
				MinOfFullRate: null,
				MaxOfFullRate: null,
				MinOfDoubleRate: null,
				MaxOfDoubleRate: null,
				MaxOfSingleRate: null,
			},
		]),
	});

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body,
			headers,
		},
		otaConfig
	);

	if (result && result.status !== 200) {
		const data = await result.text();
		throw new Error(`Agoda priceApi1 error ${body} ${JSON.stringify(data)}`);
	}

	const json = await result.json();
	if (!json.IsSuccess) {
		throw new Error(`Agoda priceApi1 error ${body} ${JSON.stringify(json)}`);
	}
}

async function priceApi2(otaPropertyId, otaListing, from, to, rateIds, price, otaConfig, DaysOfWeek, listingId) {
	const { hotelId, roomTypeId } = getHotelIds(otaListing.otaListingId);
	const uri = SyncMultiRoomUri.replace('{hotelId}', hotelId);

	const maxOcc = await getOccupancy(listingId, otaListing, otaConfig);

	const DiscountByOccupancy = getDiscountByOccupancy(maxOcc);
	const body = JSON.stringify({
		HotelID: hotelId,
		RoomTypeID: roomTypeId,
		StartDateStr: from.toDateMysqlFormat(),
		EndDateStr: to.toDateMysqlFormat(),
		IsBasic: true,
		IsNHA: false,
		DaysOfWeek: DaysOfWeek || null,
		RoomAllotmentList: [],
		RoomRateList: rateIds.map(rateId => ({
			RoomTypeID: roomTypeId,
			RateCategoryID: rateId,
			OccupancyRate: price,
			OccupancyRateOri: price,
			Closeout: 0,
			HasLinked: false,
			LinkedRateCategoryID: 0,
			SingleRate: -1,
			DoubleRate: -1,
			FullRate: -1,
			ExtraBedRate: -1,
			MinStay: -2,
			MaxStay: -2,
			MinNightsStayThrough: -2,
			MaxNightsStayThrough: -2,
			IsPriceChanged: true,
			DeviationType: 'F',
			DefaultDeviation: 0,
			DiscountByOccupancy,
		})),
	});

	const headers = getAgodaHeader(otaConfig);
	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body,
			headers,
		},
		otaConfig
	);

	if (result.status !== 200) {
		const text = await result.text();
		throw new Error(`Agoda priceApi2 error ${body} ${text}`);
	}
	const json = await result.json();
	if (!json.IsSuccess) {
		throw new Error(`Agoda priceApi2 error ${body} ${JSON.stringify(json)}`);
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
async function synchronizePrice({
	propertyId,
	otaListing,
	from,
	to,
	rateIds,
	price,
	otaConfig,
	daysOfWeek,
	listingId,
}) {
	if (!otaConfig) return;
	if (!rateIds.length) {
		return;
	}

	if (otaConfig.other && otaConfig.other.isNHA) {
		await priceApi1(propertyId, otaListing, from, to, rateIds, price, otaConfig, daysOfWeek, listingId);
	} else {
		await priceApi2(propertyId, otaListing, from, to, rateIds, price, otaConfig, daysOfWeek, listingId);
	}
}

async function fetchRoomsToSell({ propertyId, otaListingInfo, from, to, otaInfo }) {
	if (!otaInfo) return;

	const { hotelId, roomTypeId } = getHotelIds(otaListingInfo.otaListingId);
	const uri = `https://ycs.agoda.com/en-us/${propertyId}/kipp/api/AvailabilityRatesApi/Search?`;

	const headers = getAgodaHeader(otaInfo);
	const req = {
		language: 'en-us',
		hotelId,
		RoomTypeId: roomTypeId,
		StartDate: from.toDateMysqlFormat(),
		EndDate: to.toDateMysqlFormat(),
	};
	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(req),
			headers,
		},
		otaInfo
	)
		.then(r => r.json())
		.catch(err => logger.error(err));

	if (result && result.IsSuccess) {
		return result.Data.AllotmentList.reduce((obj, v) => {
			obj[v.Date] = v.Total;
			return obj;
		}, {});
	}

	return {};
}

async function updatePropertyCalendar(propertyData) {
	const group = _.groupBy(propertyData.data, t => `${t.otaListing.otaListingId}|${t.available}`);
	const updateData = [];

	_.keys(group).forEach(k => {
		const [{ available, otaListing, isMuti }] = group[k];
		let prevTo;

		let data = group[k]
			.sort((a, b) => a.date.getTime() - b.date.getTime())
			.reduce((arr, t) => {
				if (prevTo && moment(t.date).diff(moment(prevTo), 'days') === 1) {
					arr[arr.length - 1].to = t.date;
				} else {
					arr.push({ from: t.date, to: t.date, available, otaListing, isMuti });
				}

				prevTo = t.date;

				return arr;
			}, []);

		updateData.push(..._.flatten(data));
	});

	const { otaPropertyId, otaInfo } = propertyData;

	await updateData.asyncForEach(data => {
		const { from, to, available, otaListing, isMuti } = data;
		const { roomTypeId } = getHotelIds(otaListing.otaListingId);

		if (roomTypeId) {
			if (otaInfo.other && otaInfo.other.isNHA) {
				return scheduleApi1(otaPropertyId, otaListing, from, to, available, otaInfo, isMuti);
			}
			return scheduleApi2(otaPropertyId, otaListing, from, to, available, otaInfo, isMuti);
		}

		if (otaListing.ratePlans && otaListing.ratePlans.length > 0) {
			return syscheduleApiV2(
				otaPropertyId,
				otaListing,
				from,
				to,
				available,
				otaInfo,
				otaListing.ratePlans[0].defaultPrice,
				isMuti
			);
		}
	});
}

async function syncDone(syncId) {
	const calendars = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	await _.values(calendars.properties).asyncForEach(updatePropertyCalendar);
}

async function markNoShow({ otaConfig, propertyId, otaBookingId }) {
	const uri = `https://ycs.agoda.com/en-us/${propertyId}/kipp/api/hotelBookingApi/ConfirmNoSow`;

	const headers = getAgodaHeader(otaConfig, {
		'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
		referer: `https://ycs.agoda.com/en-us/HotelBookings/Index/${propertyId}`,
	});

	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			redirect: 'manual',
			body: `bookingId=${otaBookingId}`,
			headers,
		},
		otaConfig
	);

	const json = await res.json();
	if (!json.IsSuccess) {
		return Promise.reject(json);
	}
}

module.exports = {
	synchronizeSchedule,
	synchronizePrice,
	fetchRoomsToSell,
	syncDone,
	markNoShow,
};

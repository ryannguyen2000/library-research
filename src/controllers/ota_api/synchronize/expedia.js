const _ = require('lodash');
// const mongoose = require('mongoose');
const moment = require('moment');

const fetchRetry = require('@utils/fetchRetry');
const { createCache } = require('@utils/cache');
const { logger } = require('@utils/logger');
const Uri = require('@utils/uri');
const { groupDates } = require('@utils/date');
// const { OTAs } = require('@utils/const');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const SyncPriceUri =
	'https://apps.expediapartnercentral.com/lodging/roomsandrates/updateBulkInventoryRatesAndRestrictions-React.json';

const MAX_DAY = 720;

function synchronizeSchedule(propertyId, otaListing, from, to, available, otaConfig, syncId) {
	if (moment().add(MAX_DAY, 'day').toDate().zeroHours() < from) return;

	const calendars = addCalendar(syncId);

	const roomTypeId = otaListing.otaListingId;
	calendars[propertyId] = calendars[propertyId] || {};
	calendars[propertyId][roomTypeId] = calendars[propertyId][roomTypeId] || {
		data: [],
		otaConfig,
	};
	calendars[propertyId][roomTypeId].data.push({
		date: from,
		available,
	});
}

async function syncDone(syncId) {
	const schedules = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	for (const propertyId in schedules) {
		if (propertyId === 'createdAt') continue;
		for (const roomTypeId in schedules[propertyId]) {
			await updateSchedule(propertyId, roomTypeId, schedules[propertyId][roomTypeId]);
		}
	}
}

async function updateInventory(otaConfig, propertyId, data) {
	const uri = `https://apps.expediapartnercentral.com/lodging/ratesandinventory/updateBulkInventoryRatesAndRestrictions-React.json?htid=${propertyId}`;

	const body = JSON.stringify({
		submitStatus: 'POSTING',
		updateType: data.roomTypeId ? 'inventory' : 'rate',
		daysOfWeek: [],
		errorList: false,
		// roomTypeId: Number(roomTypeId),
		// bookable: updates.inventory !== '0',
		// ...updates,
		...data,
	});
	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body,
			redirect: 'manual',
		},
		otaConfig
	).then(r => r.json());

	if (!result || !result.successful) {
		throw new Error(
			`Expedia synchronizeSchedule error ${propertyId} ${JSON.stringify(data)} ${JSON.stringify(result)}`
		);
	}
}

async function updateSchedule(propertyId, roomTypeId, data) {
	// const uri = `https://apps.expediapartnercentral.com/lodging/ratesandinventory/updateBulkInventoryRatesAndRestrictions-React.json?htid=${propertyId}`;

	const ranges = [];

	_.forEach(_.groupBy(data.data, 'available'), (group, inventory) => {
		const range = groupDates(group.map(item => item.date)).map(([from, to]) => ({
			startDate: from.toDateMysqlFormat(),
			endDate: to.toDateMysqlFormat(),
			inventory,
		}));
		ranges.push(...range);
	});

	// const rates = await mongoose
	// 	.model('Rate')
	// 	.find({
	// 		_id: data.rateIds,
	// 		otaName: OTAs.Expedia,
	// 		isOtaChildRate: false,
	// 	})
	// 	.select('rateId');

	await ranges.asyncForEach(async updates => {
		const bookable = updates.inventory !== '0';

		await updateInventory(data.otaConfig, propertyId, {
			...updates,
			roomTypeId: Number(roomTypeId),
			bookable,
		});

		// if (rates.length) {
		// 	await updateInventory(data.otaConfig, propertyId, {
		// 		...updates,
		// 		rateUpdates: [],
		// 		ratePlanId: Number(rates[0].rateId),
		// 		bookable,
		// 		inventory: undefined,
		// 	});
		// }
		// const body = JSON.stringify({
		// 	submitStatus: 'POSTING',
		// 	updateType: 'inventory',
		// 	daysOfWeek: [],
		// 	roomTypeId: Number(roomTypeId),
		// 	errorList: false,
		// 	bookable: updates.inventory !== '0',
		// 	...updates,
		// });
		// const result = await fetchRetry(
		// 	uri,
		// 	{
		// 		method: 'POST',
		// 		body,
		// 		redirect: 'manual',
		// 	},
		// 	data.otaConfig
		// ).then(r => r.json());

		// if (!result || !result.successful) {
		// 	throw new Error(`Expedia synchronizeSchedule error ${propertyId} ${roomTypeId} ${JSON.stringify(result)}`);
		// }
	});
}

function getDaysOfWeek(daysOfWeek) {
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	if (!daysOfWeek) return days;
	return days.filter((d, index) => daysOfWeek.includes((index + 1).toString()));
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
async function synchronizePrice({ propertyId, from, to, rateIds, price, otaConfig, daysOfWeek }) {
	if (!otaConfig) return;

	const uri = Uri(SyncPriceUri, { htid: propertyId });

	await rateIds.asyncForEach(async rateId => {
		const body = {
			submitStatus: 'POSTING',
			updateType: 'rate',
			startDate: from.toDateMysqlFormat(),
			endDate: to.toDateMysqlFormat(),
			daysOfWeek: getDaysOfWeek(daysOfWeek),
			ratePlanId: parseInt(rateId),
			rateUpdates: [{ occupancy: 1, rate: price }],
			maxLengthOfStay: '',
		};
		const bodyStr = JSON.stringify(body);
		const result = await fetchRetry(
			uri,
			{
				method: 'POST',
				body: bodyStr,
				redirect: 'manual',
			},
			otaConfig
		);

		const rs = await result.json();
		if (!rs.successful) {
			throw new Error(`Expedia synchronizeSchedule error ${propertyId} ${rateId} ${JSON.stringify(rs)}`);
		}
	});
}

async function synchronizeRoomToSell(otaPropertyId, otaListing, from, to, rooms, otaInfo) {
	if (!otaInfo) return;

	const uri = Uri(SyncPriceUri, { htid: otaPropertyId });
	const body = {
		endDate: to.toDateMysqlFormat(),
		inventory: rooms.toString(),
		roomTypeId: parseInt(otaListing.otaListingId),
		startDate: from.toDateMysqlFormat(),
		submitStatus: 'POSTING',
		updateType: 'inventory',
	};
	const bodyStr = JSON.stringify(body);

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: bodyStr,
			redirect: 'manual',
		},
		otaInfo
	);

	if (result && result.status !== 200) {
		const data = await result.text();
		throw new Error(`Expedia synchronizeRoomToSell ${otaPropertyId} ${otaListing.otaListingId} ${data}`);
	}
}

async function fetchRoomsToSell({ propertyId, otaListingInfo, from, to, otaInfo, rateIds }) {
	if (!otaInfo) return;

	const uri = `https://apps.expediapartnercentral.com/lodging/roomsandrates/ratesAndAvailGetModel-React.json?htid=${propertyId}`;
	const roomTypeIds = [parseInt(otaListingInfo.otaListingId)];
	const ratePlanIds = rateIds.map(r => parseInt(r));
	const bodyStr = JSON.stringify({
		startDate: from.toDateMysqlFormat(),
		numberOfDays: from.diffDays(to) + 1,
		ratePlanIds,
		roomTypeIds,
		isFilterOutComplexRates: false,
		rateTiers: null,
		roomAndRatePlanSummaryModel: {
			maxOccupancyForAllRoomTypeIds: 2,
			roomTypeIds,
			connectedRoomTypeIds: [],
			lengthOfStayPricingRoomTypeIds: [],
			dayOfArrivalPricingRoomTypeIds: [],
			iCalConnectedRoomTypeIds: [],
			ratePlanIds,
			corporateRatePlanIds: [],
			wholesaleRatePlanIds: [],
			hasConnectedRoomTypeIds: false,
			hasNonConnectedRoomTypeIds: true,
			hasLengthOfStayPricingSubModels: false,
			hasDayOfArrivalPricingSubModels: false,
			hasStandaloneRatePlanIds: true,
			hasPackageRatePlanIds: true,
			hasCorporateRatePlanIds: false,
			hasWholesaleRatePlanIds: false,
			hasUnknownPricingSubModels: true,
		},
		currencyCode: 'VND',
		rateUIPreferences: {
			selectedLOS: 1,
			selectedOBP: 1,
			isShowAllOBPLevelsEnabled: true,
		},
	});

	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: bodyStr,
			redirect: 'manual',
		},
		otaInfo
	);

	const result = await res.json();
	const rs = {};

	if (result && result.successful) {
		const data = result.ratesRestrictionsAndInventory.roomMap[roomTypeIds[0]];
		if (data) {
			_.forEach(data.inventoryDateMap, (value, date) => {
				const { sellState, inventoryAvailable } = value.inventoryInformationModel;
				rs[date] = sellState === 'StopSell' ? 0 : inventoryAvailable;
			});
		}
	} else {
		logger.warn('Expedia fetchRoomsToSell fail', roomTypeIds, ratePlanIds, JSON.stringify(result));
	}

	return rs;
}

module.exports = {
	synchronizeSchedule,
	synchronizePrice,
	syncDone,
	synchronizeRoomToSell,
	fetchRoomsToSell,
};

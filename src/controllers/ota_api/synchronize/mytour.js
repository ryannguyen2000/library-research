const _ = require('lodash');
const moment = require('moment');

const fetchRetry = require('@utils/fetchRetry');
const { createCache } = require('@utils/cache');
const { OTAs } = require('@utils/const');
const { groupDates } = require('@utils/date');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const OTA = OTAs.Mytour;
const URI = `https://gate.mytour.vn`;
const DEFAULT_RATE_TYPE = 1;
const MAX_DAY = 365;

function formatDate(date) {
	return moment(date).format('DD-MM-Y');
}

function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaInfo, syncId, listing) {
	if (moment().add(MAX_DAY, 'day').toDate().zeroHours() < from) return;

	const calendars = addCalendar(syncId);
	const listingId = otaListing.otaListingId.toString();

	if (!calendars[otaPropertyId]) {
		calendars[otaPropertyId] = {};
	}
	if (!calendars[otaPropertyId][listingId]) {
		calendars[otaPropertyId][listingId] = { data: [], listing, otaInfo };
	}
	calendars[otaPropertyId][listingId].data.push({
		date: from,
		available,
	});
}

async function updateSchedule(hotelId, otaListingId, { data, otaInfo }) {
	const ranges = [];
	const groups = _.groupBy(data, 'available');
	_.forEach(groups, (group, available) => {
		available = parseInt(available);
		const range = groupDates(group.map(item => item.date)).map(([from, to]) => ({
			timeFrom: formatDate(from),
			timeTo: formatDate(to),
			number: available || -1,
		}));
		ranges.push(...range);
	});

	if (ranges.length) {
		const uri = `${URI}/hms-premium/rooms/allotment/update-and-rebuild/v2?rateTypeId=${DEFAULT_RATE_TYPE}&roomId=${otaListingId}`;
		const response = await fetchRetry(
			uri,
			{
				method: 'POST',
				body: JSON.stringify({
					commitType: 'NON_COMMIT',
					ranges,
				}),
			},
			otaInfo
		).then(res => res.json());
		if (response.code !== 200) {
			throw new Error(`${OTA} updateSchedule error ${otaListingId} ${response.message}`);
		}
	}
}

async function syncDone(syncId) {
	const schedules = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	for (const otaPropertyId in schedules) {
		if (otaPropertyId === 'createdAt') continue;
		for (const otaListingId in schedules[otaPropertyId]) {
			await updateSchedule(otaPropertyId, otaListingId, schedules[otaPropertyId][otaListingId]);
		}
	}
}

function getDaysOfWeek(daysOfWeek) {
	const daysMapping = {
		2: 'MONDAY',
		3: 'TUESDAY',
		4: 'WEDNESDAY',
		5: 'THURSDAY',
		6: 'FRIDAY',
		7: 'SATURDAY',
		1: 'SUNDAY',
	};
	if (!daysOfWeek) return _.values(daysMapping);
	return daysOfWeek.map(d => daysMapping[d]);
}

function getValueEachDay(daysOfWeek, price) {
	const rs = {};
	const daysMapping = {
		2: 1,
		3: 2,
		4: 3,
		5: 4,
		6: 5,
		7: 6,
		1: 7,
	};
	if (!daysOfWeek) {
		_.values(daysMapping).forEach(d => {
			rs[d] = price;
		});
	} else {
		_.values(daysMapping).forEach(d => {
			rs[d] = null;
		});
		daysOfWeek.forEach(d => {
			rs[daysMapping[d]] = price;
		});
	}
	return rs;
}

async function synchronizePrice({ propertyId, otaListing, from, to, rateIds, price, otaConfig, daysOfWeek }) {
	const uri = `${URI}/hms-premium/rooms/rates/multi?hotelId=${propertyId}`;

	const body = {
		limitDayOfWeeks: getDaysOfWeek(daysOfWeek),
		dates: [{ timeFrom: formatDate(from), timeTo: formatDate(to) }],
		prices: rateIds.map(rateId => ({
			roomId: Number(otaListing.otaListingId),
			ratePlanId: Number(rateId),
			valueEachDay: getValueEachDay(daysOfWeek, price),
		})),
		adultExtra: [],
		childrenExtra: [],
		commitType: 'NON_COMMIT',
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaConfig
	).then(res => res.json());

	if (!result || result.code !== 200) {
		throw new Error(
			`${OTA} synchronizePrice error ${propertyId} ${otaListing.otaListingId} ${rateIds} ${result.message}`
		);
	}
}

async function synchronizeRoomToSell(otaPropertyId, otaListing, from, to, rooms, otaInfo) {
	const body = JSON.stringify({
		commitType: 'NON_COMMIT',
		ranges: [{ timeFrom: formatDate(from), timeTo: formatDate(to), number: null }],
	});

	const result = await fetchRetry(
		`${URI}/hms-premium/rooms/allotment/update-and-rebuild/v2?rateTypeId=${DEFAULT_RATE_TYPE}&roomId=${otaListing.otaListingId}`,
		{
			method: 'POST',
			body,
		},
		otaInfo
	);
	if (result && result.status !== 200) {
		const data = await result.text();
		throw new Error(`${OTA} synchronizeRoomToSell error ${otaListing.otaListingId} ${data}`);
	}
}

async function fetchRoomsToSell({ propertyId, otaListingInfo, from, to, otaInfo }) {
	if (!otaInfo) return;

	const uri = `${URI}/hms-premium/rooms/allotment/all-in-range/v2?hotelId=${propertyId}`;
	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify({
				timeFrom: moment(from).format('DD-MM-Y'),
				timeTo: moment(to).format('DD-MM-Y'),
			}),
		},
		otaInfo
	).then(res => res.json());

	const rs = {};
	if (result && result.data) {
		const currentRoom = _.get(result, [
			'data',
			'roomAvailability',
			otaListingInfo.otaListingId,
			'rateTypes',
			DEFAULT_RATE_TYPE,
		]);
		const ranges = _.get(currentRoom, 'ranges');
		const availability = _.get(currentRoom, 'availability');
		const closing = _.filter(availability, a => a.status === 0).map(a => ({
			...a,
			timeFrom: moment(a.timeFrom, 'DD-MM-Y').format('Y-MM-DD'),
			timeTo: moment(a.timeTo, 'DD-MM-Y').format('Y-MM-DD'),
		}));

		_.forEach(ranges, (available, date) => {
			date = moment(date, 'DD-MM-Y').format('Y-MM-DD');
			const closed = closing.find(a => a.timeFrom <= date && a.timeTo >= date);
			rs[date] = closed ? 0 : available || 0;
		});
	}

	return rs;
}

module.exports = {
	synchronizeSchedule,
	synchronizePrice,
	syncDone,
	fetchRoomsToSell,
	synchronizeRoomToSell,
};

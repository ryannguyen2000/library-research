const _ = require('lodash');
const moment = require('moment');
const { v4: uuid } = require('uuid');
// const mongoose = require('mongoose');

const fetchRetry = require('@utils/fetchRetry');
const { createCache } = require('@utils/cache');
const { OTAs, Currency } = require('@utils/const');
const { groupDates } = require('@utils/date');
const { logger } = require('@utils/logger');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const OTA = OTAs.Tiket;
const MAX_DAY = 365;

function formatDate(date) {
	return moment(date).format('Y-MM-DD');
}

function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaInfo, syncId) {
	if (moment().add(MAX_DAY, 'day').toDate().zeroHours() < from) return;

	const calendars = addCalendar(syncId);
	const listingId = otaListing.otaListingId.toString();

	if (!calendars[otaPropertyId]) {
		calendars[otaPropertyId] = {};
	}
	if (!calendars[otaPropertyId][listingId]) {
		calendars[otaPropertyId][listingId] = { data: [], otaInfo, rates: _.map(otaListing.rates, 'rateId') };
	}
	calendars[otaPropertyId][listingId].data.push({
		date: from,
		available,
	});
}

async function updateSchedule(hotelId, otaListingId, { data, otaInfo, rates }) {
	const inventories = [];
	const restrictions = [];

	// const rates = await mongoose
	// 	.model('Rate')
	// 	.find({
	// 		_id: rateIds,
	// 		otaName: OTA,
	// 	})
	// 	.select('rateId');

	const groups = _.groupBy(data, 'available');

	_.forEach(groups, (group, available) => {
		available = parseInt(available);

		groupDates(group.map(item => item.date)).forEach(([from, to]) => {
			inventories.push({
				StatusApplicationControl: {
					_Start: formatDate(from),
					_End: formatDate(to),
					_InvTypeCode: otaListingId,
				},
				InvCounts: {
					InvCount: [
						{
							_Count: available,
							_CountType: 2,
						},
					],
				},
			});
			rates.forEach(rateId => {
				restrictions.push({
					StatusApplicationControl: {
						_Start: formatDate(from),
						_End: formatDate(to),
						_InvTypeCode: otaListingId,
						_RatePlanCode: rateId,
					},
					RestrictionStatus: {
						_Restriction: 'Master',
						_Status: available > 0 ? 'Open' : 'Close',
					},
				});
			});
		});
	});

	if (!inventories.length) return;

	const body = {
		OTA_HotelInvCountNotifRQ: {
			_Version: '2.0',
			_TimeStamp: new Date().toISOString(),
			_AltLangID: null,
			_EchoToken: uuid(),
			_PrimaryLangID: null,
			POS: {
				Source: {
					RequestorID: {
						_ID: otaInfo.other.RequestorID,
					},
				},
			},
			Inventories: {
				_HotelCode: hotelId,
				Inventory: inventories,
			},
		},
	};

	const response = await fetchRetry(
		`${otaInfo.other.uri}/b2b-gateway/tix-hotel-channel-manager/tix-connect/v2/update-inventories`,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaInfo
	).then(res => res.json());

	if (!response.OTA_HotelInvCountNotifRS || !response.OTA_HotelInvCountNotifRS.Success) {
		throw new Error(`${OTA} updateSchedule error ${otaListingId} ${JSON.stringify(response)}`);
	}

	if (restrictions.length) {
		const availBody = {
			OTA_HotelAvailNotifRQ: {
				_Version: '2.0',
				_TimeStamp: new Date().toISOString(),
				_AltLangID: null,
				_EchoToken: uuid(),
				_PrimaryLangID: null,
				POS: {
					Source: {
						RequestorID: {
							_ID: otaInfo.other.RequestorID,
						},
					},
				},
				AvailStatusMessages: {
					_HotelCode: hotelId,
					AvailStatusMessage: restrictions,
				},
			},
		};

		const rresponse = await fetchRetry(
			`${otaInfo.other.uri}/b2b-gateway/tix-hotel-channel-manager/tix-connect/v2/update-restriction`,
			{
				method: 'POST',
				body: JSON.stringify(availBody),
			},
			otaInfo
		).then(res => res.json());

		if (!rresponse.OTA_HotelAvailNotifRS.Success) {
			throw new Error(`${OTA} updateSchedule error ${otaListingId} ${JSON.stringify(rresponse)}`);
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
		2: '_Mon',
		3: '_Tue',
		4: '_Weds',
		5: '_Thur',
		6: '_Fri',
		7: '_Sat',
		1: '_Sun',
	};
	const rs = {};

	_.entries(daysMapping).forEach(([k, v]) => {
		rs[v] = !daysOfWeek || daysOfWeek.includes(k) ? 1 : 0;
	});

	return rs;
}

async function synchronizePrice({ propertyId, otaListing, from, to, rateIds, price, otaConfig, daysOfWeek }) {
	const uri = `${otaConfig.other.uri}/b2b-gateway/tix-hotel-channel-manager/tix-connect/v2/update-room-rates`;

	// const amount = _.round(price / CurrencyConvert.IDR);
	const amount = price;

	const body = {
		OTA_HotelRateAmountNotifRQ: {
			_EchoToken: uuid(),
			_TimeStamp: new Date(),
			_Version: '2.0',
			POS: {
				Source: {
					RequestorID: {
						_ID: otaConfig.other.RequestorID,
					},
				},
			},
			RateAmountMessages: {
				_HotelCode: propertyId,
				RateAmountMessage: rateIds.map(rateId => ({
					StatusApplicationControl: {
						_Start: formatDate(from),
						_End: formatDate(to),
						_InvTypeCode: otaListing.otaListingId,
						_RatePlanCode: rateId,
					},
					Rates: {
						Rate: [
							{
								_CurrencyCode: Currency.VND,
								...getDaysOfWeek(daysOfWeek),
								BaseByGuestAmts: {
									BaseByGuestAmt: [
										{
											_AmountAfterTax: amount,
										},
									],
								},
							},
						],
					},
				})),
			},
		},
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaConfig
	).then(res => res.json());

	if (!result.OTA_HotelRateAmountNotifRS || !result.OTA_HotelRateAmountNotifRS.Success) {
		logger.error(`${OTA} synchronizePrice`);
		logger.error(JSON.stringify(body, '', 4));
		logger.error(JSON.stringify(result, '', 4));
		throw new Error(`${OTA} synchronizePrice error ${propertyId} ${otaListing.otaListingId} ${rateIds}`);
	}
}

async function fetchRoomsToSell({ propertyId, otaListingInfo, from, to, otaInfo }) {
	if (!otaInfo) return;

	const uri = `${otaInfo.other.uri}/b2b-gateway/tix-hotel-channel-manager/tix-connect/v2/get-inventories`;

	const body = {
		OTA_HotelInvCountRQ: {
			_Version: '2.0',
			_TimeStamp: new Date(),
			_EchoToken: uuid(),
			POS: {
				Source: {
					RequestorID: {
						_ID: otaInfo.other.RequestorID,
					},
				},
			},
			HotelInvCountRequests: {
				HotelInvCountRequest: [
					{
						HotelRef: {
							_HotelCode: propertyId,
						},
						DateRange: {
							_Start: formatDate(from),
							_End: formatDate(to),
						},
						// RatePlanCandidates: {
						// 	RatePlanCandidate: rateIds.map(rateId => ({ _RatePlanCode: rateId })),
						// },
						RoomTypeCandidates: {
							RoomTypeCandidate: [
								{
									_RoomTypeCode: otaListingInfo.otaListingId,
								},
							],
						},
					},
				],
			},
		},
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'POST',
			body: JSON.stringify(body),
		},
		otaInfo
	).then(res => res.json());

	const rs = {};

	const data = result.OTA_HotelInvCountRS.Inventories;
	if (data && data.Inventory) {
		data.Inventory.forEach(inventory => {
			rs[inventory.StatusApplicationControl._Start] = inventory.InvCounts.InvCount[0]._Count;
		});
	}

	return rs;
}

module.exports = {
	synchronizeSchedule,
	synchronizePrice,
	syncDone,
	fetchRoomsToSell,
};

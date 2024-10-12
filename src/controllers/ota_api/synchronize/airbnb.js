const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');

const fetchRetry = require('@utils/fetchRetry');
const { createCache } = require('@utils/cache');
const { logger } = require('@utils/logger');
const { rangeDate } = require('@utils/date');
const { Currency, CurrencyConvert, OTAs } = require('@utils/const');
const { btoa } = require('@utils/func');
const { AIRBNB_HOST } = require('@controllers/ota_api/header_helper');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const MAX_DAY = 365;

async function request(uri, body, otaInfo) {
	body = JSON.stringify(body);

	const res = await fetchRetry(
		uri,
		{
			method: 'POST',
			body,
			redirect: 'manual',
		},
		otaInfo
	);
	if (!res.ok) {
		throw new Error(`Airbnb synchronize error ${uri} ${body} ${await res.text()}`);
	}
	const result = await res.json();
	if (!_.get(result, 'data.patek.updateCalendarsForHost.success')) {
		throw new Error(`Airbnb synchronize error ${uri} ${body} ${JSON.stringify(result)}`);
	}
}

async function withdraw(otaInfo, threadId) {
	const id = btoa(`MessageThread:${threadId}`);
	const actionId = 'WITHDRAW_SPECIAL_OFFER';

	const result = await fetchRetry(
		`${AIRBNB_HOST}/api/v3/HostReservationDetailMutation?operationName=HostReservationDetailMutation&locale=en&currency=USD`,
		{
			method: 'POST',
			body: JSON.stringify({
				operationName: 'HostReservationDetailMutation',
				variables: {
					input: {
						actionId,
						screenId: actionId,
						resourceIds: [id],
						mutations: [],
					},
					id,
					sectionIds: null,
					entryPoint: 'MessageThread',
					disableDeferredLoading: false,
				},
				extensions: {
					persistedQuery: {
						version: 1,
						sha256Hash: otaInfo.other.sha256Approve,
					},
				},
			}),
		},
		otaInfo
	);

	if (!result.ok) {
		const data = await result.text();
		return Promise.reject(data);
	}
}

async function onFullCalendar(otaInfo, otaListingId, dates) {
	const filter = {
		otaName: OTAs.Airbnb,
		otaListingId,
		otaBookingId: null,
		approved: true,
		withdrawn: { $ne: true },
		$or: dates.map(date => ({
			'inquiryDetails.from': { $lte: date },
			'inquiryDetails.to': { $gt: date },
		})),
	};

	const Message = mongoose.model('Messages');
	const messages = await Message.find(filter).select('threadId');

	await messages.asyncMap(message => {
		return withdraw(otaInfo, message.threadId)
			.then(() => Message.updateOne({ _id: message._id }, { withdrawn: true }))
			.catch(e => {
				logger.error('Aribnb withdraw', message.threadId, e);
			});
	});
}

function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaInfo, syncId) {
	if (moment().add(MAX_DAY, 'day').toDate().zeroHours() < from) return;

	const calendars = addCalendar(syncId);

	const { account } = otaInfo;

	const listingId = otaListing.otaListingId.toString();
	if (!calendars[account]) calendars[account] = { otaInfo, listingIds: {} };
	if (!calendars[account].listingIds[listingId]) calendars[account].listingIds[listingId] = { on: [], off: [] };
	calendars[account].listingIds[listingId][available > 0 ? 'on' : 'off'].push(from.toDateMysqlFormat());
}

async function updateSchedule({ otaInfo, listingIds }) {
	await _.entries(listingIds).asyncForEach(async ([listingId, data]) => {
		const uri = `${AIRBNB_HOST}/api/v3/UpdateCalendarsForHost?operationName=UpdateCalendarsForHost&locale=en&currency=USD`;
		const dailyAttributesList = [];

		if (data.on && data.on.length) {
			dailyAttributesList.push({
				dates: _.uniq(data.on).sort(),
				availableFlag: 'AVAILABLE',
			});
		}
		if (data.off && data.off.length) {
			dailyAttributesList.push({
				dates: _.uniq(data.off).sort(),
				availableFlag: 'UNAVAILABLE_PERSISTENT',
			});
			onFullCalendar(otaInfo, listingId, data.off);
		}

		if (!dailyAttributesList.length) return;

		return request(
			uri,
			{
				operationName: 'UpdateCalendarsForHost',
				variables: {
					request: {
						listingIds: [listingId],
						dailyAttributesList,
						calendarFieldsForResponse: [
							// 'AVAILABILITY'
						],
						isShadowWrite: false,
					},
				},
				extensions: {
					persistedQuery: {
						version: 1,
						sha256Hash: otaInfo.other.sha256HashCalendar,
					},
				},
			},
			otaInfo
		);
	});
}

async function syncDone(syncId) {
	const calendars = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	await Object.keys(calendars)
		.filter(k => k !== 'createdAt')
		.asyncForEach(async account => {
			await updateSchedule(calendars[account]);
		});
}

async function synchronizePrice({ otaListing, from, to, price, otaConfig, daysOfWeek }) {
	if (!otaConfig) return;

	const dates = rangeDate(from, to)
		.toArray()
		.filter(date => !daysOfWeek || daysOfWeek.includes((date.getDay() + 1).toString()));

	if (otaListing.currency !== Currency.VND) {
		otaListing.currency = otaListing.currency || Currency.USD;
		price /= CurrencyConvert[otaListing.currency] || 1;
		price = parseInt(price);
	}

	const uri = `${AIRBNB_HOST}/api/v3/UpdateCalendarsForHost?operationName=UpdateCalendarsForHost&locale=en&currency=USD`;
	await request(
		uri,
		{
			operationName: 'UpdateCalendarsForHost',
			variables: {
				request: {
					listingIds: [otaListing.otaListingId],
					dailyAttributesList: [
						{
							dates: dates.map(date => date.toDateMysqlFormat()),
							customDailyPrice: price,
							smartPricingOverridden: true,
						},
					],
					calendarFieldsForResponse: [],
					isShadowWrite: false,
				},
			},
			extensions: {
				persistedQuery: {
					version: 1,
					sha256Hash: otaConfig.other.sha256HashCalendar,
				},
			},
		},
		otaConfig
	);
}

// async function fetchRoomsToSell({ otaListingInfo, from, to, otaInfo }) {
// 	const uri = Uri(SyncUri, {
// 		key: otaInfo.other.key,
// 		currency: 'VND',
// 		locale: 'en',
// 		start_date: from.toDateMysqlFormat(),
// 		end_date: to.toDateMysqlFormat(),
// 		'listing_ids[]': otaListingInfo.otaListingId,
// 	});

// 	const headers = {
// 		Cookie: otaInfo.cookie,
// 		accept: 'application/json',
// 		'content-type': 'application/json',
// 	};

// 	const result = await fetch(uri, {
// 		method: 'GET',
// 		headers,
// 	})
// 		.then(r => r.json())
// 		.catch(err => logger.error(err));

// 	if (result) {
// 		const data = result.calendars.find(r => String(r.listing_id) === String(otaListingInfo.otaListingId));
// 		if (data) {
// 			return data.days.reduce((obj, v) => {
// 				obj[v.date] = v.available ? 1 : 0;
// 				return obj;
// 			}, {});
// 		}
// 	}
// 	return {};
// }

module.exports = {
	synchronizeSchedule,
	synchronizePrice,
	// synchronizePriceDone,
	syncDone,
	// fetchRoomsToSell,
};

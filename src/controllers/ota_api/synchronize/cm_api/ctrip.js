/* eslint-disable prefer-destructuring */
// const { createCache } = require('@utils/cache');
const _ = require('lodash');
const moment = require('moment');
// const xml2js = require('xml2js');
// const { logger } = require('@utils/logger');
// const models = require('@models');

const fetchDebugerApi = require('@utils/fetchDebugerApi');
const { groupDates, rangeDate } = require('@utils/date');
const ThrowReturn = require('@core/throwreturn');

const { generateXMLRequest } = require('../../utils');
const { CTRIP_REQUEST_TYPE } = require('../../const');

async function getRequestXMLRate({ hotelID, roomTypeID, rateIds, ranges, currency, price }) {
	// const listingRates = await models.Rate.find({
	// 	rateId: rates.map(item => item.rateId),
	// }).select('rateId maxOccupancy maxAdultOccupancy maxChildOccupancy');

	// const otaRateId = _.keyBy(listingRates, 'rateId');

	const msgs = rateIds.map(rateId => {
		// const maxOccupancy = _.get(otaRateId, [rate.rateId, 'maxOccupancy']);

		// const numberOfGuests = maxOccupancy ? `NumberOfGuests="${maxOccupancy}" ` : '';

		const numberOfGuests = '';

		const ratesXml = ranges.map(([from, to]) =>
			`
				<Rate Start='${from.toDateMysqlFormat()}' End='${to.toDateMysqlFormat()}'>
					<BaseByGuestAmts>
						<BaseByGuestAmt ${numberOfGuests}AmountAfterTax='${price}' CurrencyCode='${currency}' />
					</BaseByGuestAmts>
				</Rate>`.trim()
		);

		const baseMessage = `
			<RateAmountMessage>
				<StatusApplicationControl InvTypeCode='${roomTypeID}' RatePlanCode='${rateId}' />
				<Rates>
					${ratesXml.join('\n')}
				</Rates>
			</RateAmountMessage>`.trim();

		return baseMessage;
	});

	let result = `
		<RateAmountMessages HotelCode="${hotelID}" >
			${msgs.join('\n')}
		</RateAmountMessages>`.trim();

	return result;
}

async function synchronizePrice({ propertyId, otaListing, from, to, price, otaConfig, daysOfWeek, rateIds }) {
	if (!otaConfig) return;

	if (!rateIds || !rateIds.length) {
		return Promise.reject('Ctrip cm synchronizePrice rateIds empty');
	}

	const { otaListingId, currency } = otaListing;
	const url = `${otaConfig.other.url}/OTA_HotelRateAmountNotif`;

	const xmlRequest = {
		id: otaConfig.other.connectivityUserName,
		messagePassword: otaConfig.other.connectivityPassword,
		codeContext: otaConfig.other.codeContext,
		elementName: CTRIP_REQUEST_TYPE.OTA_HOTELRATEAMOUNTNOTIFRQ.requestElement,
		time: moment().toISOString(),
		mainElement: '',
	};

	const dates = rangeDate(from, to)
		.toArray()
		.filter(date => !daysOfWeek || daysOfWeek.includes((date.getDay() + 1).toString()));

	const ranges = groupDates(dates);

	const dataRequest = await getRequestXMLRate({
		hotelID: propertyId,
		roomTypeID: otaListingId,
		rateIds,
		// from: from.toDateMysqlFormat(),
		// to: to.toDateMysqlFormat(),
		ranges,
		currency: currency || 'VND',
		price,
	});
	xmlRequest.mainElement = dataRequest;
	const requestXml = generateXMLRequest(xmlRequest);

	// logger.info('Post price request: ', requestXml);

	const data = await fetchDebugerApi(
		url,
		{
			method: 'POST',
			body: requestXml,
			headers: { 'Content-Type': 'application/xml' },
		},
		{ otaConfig, responseElement: 'OTA_HotelRateAmountNotifRS' }
	);
	// if (_.get(data, 'OTA_HotelRateAmountNotifRS.Success')) {
	// 	logger.info('Synchronize price to CM API Ctrip Success', data);
	// }

	if (_.get(data, 'OTA_HotelRateAmountNotifRS.Errors')) {
		const shortText = _.get(data, 'OTA_HotelRateAmountNotifRS.Errors[0].Error[0].$.ShortText', 'Error');
		throw new ThrowReturn(shortText);
	}
}

function getRequestXMLAvailable({ hotelID, roomsData }) {
	let result = `<AvailStatusMessages HotelCode="${hotelID}">\n`;

	roomsData.forEach(roomData => {
		const { available, start, end, roomTypeId, rateIds } = roomData;
		const status = available ? 'Open' : 'Close';
		// const restriction = status === 'Close' ? 'Arrival' : 'Master';
		const restriction = 'Departure';

		// First message with BookingLimitMessageType and BookingLimit
		result += `
			<AvailStatusMessage BookingLimitMessageType="SetLimit" BookingLimit="${available}">
				<StatusApplicationControl Start="${start}" End="${end}" InvTypeCode="${roomTypeId}" />
			</AvailStatusMessage>\n`;

		if (rateIds && rateIds.length > 0) {
			rateIds.forEach(rateId => {
				result += `
					<AvailStatusMessage>
						<StatusApplicationControl RatePlanCode="${rateId}" Start="${start}" End="${end}" InvTypeCode="${roomTypeId}" />
						<RestrictionStatus MinAdvancedBookingOffset="-P7D" MaxAdvancedBookingOffset="P23988D" Restriction="${restriction}" Status="${status}" />
					</AvailStatusMessage>\n`;
				result += `
					<AvailStatusMessage>
						<StatusApplicationControl RatePlanCode="${rateId}" Start="${start}" End="${end}" InvTypeCode="${roomTypeId}" />
						<LengthsOfStay>
            				<LengthOfStay MinMaxMessageType="SetMinLOS" Time="1" TimeUnit="Day"/>
            				<LengthOfStay MinMaxMessageType="SetMaxLOS" Time="90" TimeUnit="Day"/>
            			</LengthsOfStay>
					</AvailStatusMessage>\n`;
			});
		}
	});

	result += '</AvailStatusMessages>';

	return result;
}
async function updateSchedule(otaInfo, hotelID, roomsData) {
	const url = `${otaInfo.other.url}/OTA_HotelAvailNotif`;

	const xmlRequest = {
		id: otaInfo.other.connectivityUserName,
		messagePassword: otaInfo.other.connectivityPassword,
		codeContext: otaInfo.other.codeContext,
		elementName: CTRIP_REQUEST_TYPE.OTA_HOTELAVAILNOTIFRQ.requestElement,
		time: moment().toISOString(),
		mainElement: '',
	};

	const mainElement = getRequestXMLAvailable({ hotelID, roomsData });
	xmlRequest.mainElement = mainElement;
	const requestXml = generateXMLRequest(xmlRequest);

	// logger.info('Availability and inventory push:\n', requestXml);

	const data = await fetchDebugerApi(
		url,
		{
			method: 'POST',
			body: requestXml,
			headers: { 'Content-Type': 'application/xml' },
		},
		{ otaConfig: otaInfo, responseElement: 'OTA_HotelAvailNotifRS' }
	);

	// if (_.get(data, 'OTA_HotelAvailNotifRS.Success')) {
	// 	logger.info('Synchronize schedule to CM API Ctrip Success', data);
	// }

	if (_.get(data, 'OTA_HotelAvailNotifRS.Errors')) {
		const shortText = _.get(data, 'OTA_HotelAvailNotifRS.Errors[0].Error[0].$.ShortText', 'Error');
		throw new ThrowReturn(shortText);
	}
}

// async function syncDone(syncId) {
// 	const calendars = _.cloneDeep(getCalendar(syncId));
// 	deleteCalendar(syncId);
// 	for (const hotelID in calendars) {
// 		if (hotelID === 'createdAt') continue;
// 		const { otaInfo } = calendars[hotelID];
// 		for (const roomTypeID in calendars[hotelID].rooms) {
// 			for (const available in calendars[hotelID].rooms[roomTypeID]) {
// 				await updateSchedule(
// 					calendars[hotelID].rooms[roomTypeID][available],
// 					hotelID,
// 					roomTypeID,
// 					available,
// 					otaInfo
// 				);
// 			}
// 		}
// 	}
// }

module.exports = {
	synchronizePrice,
	updateSchedule,
	// synchronizeSchedule,
	// fetchRoomsToSell,
	// syncDone,
};

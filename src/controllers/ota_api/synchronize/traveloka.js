/* eslint-disable no-loop-func */
const moment = require('moment');
const _ = require('lodash');
const mongoose = require('mongoose');

// const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const { OTAs, BookingStatus } = require('@utils/const');
const { createCache } = require('@utils/cache');
const { rangeDate } = require('@utils/date');
// const { changeHotelSession } = require('@controllers/ota_api/headers/traveloka');

const { requestToTera } = require('@controllers/ota_api/utils');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const CHUNK_SIZE = 31;
const MAX_DAY = 365;

const DOMAIN = 'https://astcnt-public.ast.traveloka.com';
const DOMAIN_V2 = 'https://astari.ast.traveloka.com';
const DOMAIN_V3 = 'https://astiapi-public.ast.traveloka.com';

function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaConfig, syncId, listing) {
	if (moment().add(MAX_DAY, 'day').toDate().zeroHours() < from) return;

	const calendars = addCalendar(syncId);
	const roomTypeId = otaListing.otaListingId;

	if (!calendars[otaPropertyId])
		calendars[otaPropertyId] = {
			otaConfig,
			rooms: {},
		};

	if (!calendars[otaPropertyId].rooms[roomTypeId]) {
		calendars[otaPropertyId].rooms[roomTypeId] = {
			dates: [],
			data: {
				rateIds: _.compact(_.map(otaListing.rates, 'rateId')),
				total: listing.roomIds.length,
				staticRooms: otaListing.staticRooms,
				listingId: listing._id,
			},
		};
	}

	calendars[otaPropertyId].rooms[roomTypeId].dates.push({
		date: from.toDateMysqlFormat(),
		available,
	});
}

async function syncDone(syncId) {
	const calendars = _.cloneDeep(getCalendar(syncId));
	deleteCalendar(syncId);

	for (const otaPropertyId in calendars) {
		if (otaPropertyId === 'createdAt') continue;

		const { otaConfig, rooms } = calendars[otaPropertyId];
		// await changeHotelSession(otaConfig, otaPropertyId);

		for (const roomTypeId in rooms) {
			const { data, dates } = rooms[roomTypeId];

			if (data.rateIds.length) {
				const roomRates = await getRoomRates(otaConfig, otaPropertyId, roomTypeId);

				await _.values(_.groupBy(dates, r => `${r.available}`)).asyncForEach(gdates => {
					return updateRateSchedule({
						otaConfig,
						dates: _.map(gdates, 'date'),
						propertyId: otaPropertyId,
						roomTypeId,
						available: gdates[0].available,
						roomRates,
					});
				});

				await _.values(_.groupBy(dates, r => !r.available)).asyncForEach(gdates => {
					return updateRateSchedule({
						otaConfig,
						dates: _.map(gdates, 'date'),
						propertyId: otaPropertyId,
						roomTypeId,
						closeOut: !gdates[0].available,
						allotment: false,
						roomRates,
					});
				});
			} else {
				const calendarData = _.sortBy(dates, ['date']);

				await _.chunk(calendarData, CHUNK_SIZE).asyncForEach(async cdates => {
					await updateSchedule(otaPropertyId, roomTypeId, data, cdates, otaConfig);
				});
			}

			if (data.staticRooms) {
				await syncStaticSchedules({ otaConfig, roomTypeId, propertyId: otaPropertyId, data, dates });
			}
		}
	}
}

async function updateRateSchedule({
	otaConfig,
	dates,
	propertyId,
	roomTypeId,
	available,
	closeOut,
	roomRates,
	allotment = true,
}) {
	let action;
	let data;

	if (allotment) {
		action = 'allotments';

		data = {
			allotments: {
				MASTER: {
					allotment: {
						allotmentReference: 'DEFAULT',
						allotmentRemaining: available,
					},
				},
			},
		};

		if (roomRates.length) {
			data.rateLimits = {};

			const limitData = {
				limit: {
					limitReference: 'ROOM',
					limitRemaining: null,
				},
			};

			roomRates.forEach(roomRate => {
				data.rateLimits[roomRate.roomRatePlanId] = limitData;
				roomRate.derivedRatePlans.forEach(derivedRatePlan => {
					data.rateLimits[derivedRatePlan.roomRatePlanId] = limitData;
				});
			});
		}
	} else {
		action = 'availabilityOptions';

		const availability = {
			availability: {
				closeOut,
			},
		};

		data = {
			allotments: {
				MASTER: availability,
			},
		};

		if (!closeOut && roomRates.length) {
			data.rateLimits = {};

			roomRates.forEach(roomRate => {
				data.rateLimits[roomRate.roomRatePlanId] = availability;
				roomRate.derivedRatePlans.forEach(derivedRatePlan => {
					data.rateLimits[derivedRatePlan.roomRatePlanId] = availability;
				});
			});
		}
	}

	let rooms = {
		[roomTypeId]: data,
	};

	const allotmentBody = {
		// context: otaConfig.other.context,
		// auth: otaConfig.other.auth,
		data: {
			listOfDates: dates,
			rooms,
		},
	};

	// const allotmentResult = await fetchRetry(
	// 	`${DOMAIN_V3}/api/v1/rate-structure/ari-setups/bulk-update/${action}`,
	// 	{
	// 		method: 'POST',
	// 		body: allotmentBody,
	// 	},
	// 	otaConfig
	// ).then(res => res.json());

	const allotmentResult = await requestToTera({
		url: `${DOMAIN_V3}/api/v1/rate-structure/ari-setups/bulk-update/${action}`,
		hotelId: propertyId,
		options: {
			method: 'POST',
		},
		body: allotmentBody,
		otaConfig,
	}).then(res => res.json());

	if (!allotmentResult.data || !allotmentResult.data.success) {
		throw new Error(
			`Traveloka updateRateSchedule ${action} error ${allotmentBody} ${JSON.stringify(allotmentResult)}`
		);
	}
}

async function updateSchedule(otaPropertyId, roomTypeId, data, dates, otaConfig) {
	const body = {
		// context: otaConfig.other.context,
		// auth: otaConfig.other.auth,
		data: {
			hotelId: otaPropertyId,
			mode: 'ALLOTMENT',
			roomTypeId,
			roomTypeIds: [roomTypeId],
			startDate: moment(_.first(dates).date).format('DD-MM-Y'),
			endDate: moment(_.last(dates).date).format('DD-MM-Y'),
			_updateHotelRoomInventoryRegularAllotmentSpecs: dates.map(item => ({
				hotelRoomId: roomTypeId,
				date: moment(item.date).format('DD-MM-Y'),
				dayAndDate: moment(item.date).format('ddd, D MMM Y'),
				regularAllotmentQty: data.total,
				guaranteedAllotmentQty: '0',
				remainingGuaranteedAllotment: '0',
				allotmentAllocation: '1',
				isGuaranteedAllotmentCloseOut: false,
				remainingRegularAllotment: item.available,
				usedRegularAllotment: '0',
				isRegularCloseOut: !item.available,
				isRegularNoCheckIn: false,
				isRegularNoCheckOut: false,
				remainingGuaranteedQty: 0,
				totalAvailability: item.available,
				usedPayAtHotelRegularAllotment: '0',
				isPayAtHotelRegularCloseOut: !item.available,
				isPayAtHotelRegularNoCheckIn: false,
				isPayAtHotelRegularNoCheckOut: false,
				remainingPayAtHotelAllotment: item.available,
				isExtrabedCloseOut: !item.available,
			})),
		},
	};

	// const result = await fetchRetry(
	// 	`${DOMAIN}/api/v2/room/saveHotelRoomRegularInventoryAllotment`,
	// 	{
	// 		method: 'POST',
	// 		body: JSON.stringify(body),
	// 	},
	// 	otaConfig
	// ).then(res => res.json());

	const result = await requestToTera({
		url: `${DOMAIN}/api/v2/room/saveHotelRoomRegularInventoryAllotment`,
		options: {
			method: 'POST',
		},
		body,
		otaConfig,
		hotelId: otaPropertyId,
	}).then(res => res.json());

	if (!result || result.status !== 'SUCCESS') {
		throw new Error(`Traveloka synchronizeSchedule error ${otaPropertyId} ${roomTypeId} ${JSON.stringify(result)}`);
	}
}

async function fetchRoomsToSell({ otaListingInfo, from, to, otaInfo, propertyId }) {
	if (!otaInfo) return;

	const uri = `${DOMAIN}/v1/room/getHotelRoomInventoryAllotment`;
	// const context = await changeHotelSession(otaInfo, propertyId);

	const body = {
		// context,
		// auth: otaInfo.other.auth,
		data: {
			roomTypeId: otaListingInfo.otaListingId,
			endDate: moment(to).format('DD-MM-Y'),
			startDate: moment(from).format('DD-MM-Y'),
			dayOfWeek: ['FRIDAY', 'MONDAY', 'SATURDAY', 'SUNDAY', 'THURSDAY', 'TUESDAY', 'WEDNESDAY'],
		},
	};

	const rs = {};
	try {
		// const response = await fetchRetry(
		// 	uri,
		// 	{
		// 		method: 'POST',
		// 		body: JSON.stringify(body),
		// 		redirect: 'manual',
		// 	},
		// 	otaInfo
		// );

		const response = await requestToTera({
			url: uri,
			options: {
				method: 'POST',
			},
			body,
			hotelId: propertyId,
			otaConfig: otaInfo,
		});

		const result = await response.json();

		if (result.status === 'SUCCESS' && result.data._hotelRoomInventoryAllotmentSummaries) {
			result.data._hotelRoomInventoryAllotmentSummaries.forEach(({ date, remainingRegularAllotment }) => {
				const time = moment(parseInt(date.timestamp));
				if (time.isValid()) rs[`${time.format('Y-MM-DD')}`] = parseInt(remainingRegularAllotment);
			});
		} else {
			throw new Error(JSON.stringify(result));
		}
	} catch (e) {
		logger.error('Traveloka fetchRoomsToSell Error', e);
	}
	return rs;
}

async function synchronizePrice({ propertyId, otaListing, from, to, price, otaConfig, daysOfWeek, rateIds }) {
	const roomTypeId = otaListing.otaListingId;
	const listOfDates = [];

	for (const date of rangeDate(from, to, true)) {
		if (!daysOfWeek || daysOfWeek.includes((date.getDay() + 1).toString())) {
			listOfDates.push(moment(date).format('YYYY-MM-DD'));
		}
	}

	// const context = await changeHotelSession(otaConfig, propertyId);

	if (rateIds && rateIds.length) {
		await syncRatePrice({ otaConfig, roomTypeId, rateIds, listOfDates, price, propertyId });
	} else {
		const fromDate = moment(from).format('DD-MM-Y');
		const toDate = moment(to).format('DD-MM-Y');

		await _.chunk(listOfDates, CHUNK_SIZE).asyncForEach(async dates => {
			const requestBody = {
				data: {
					_hotelRoomInventoryRateSummaries: dates.map(date => ({
						hotelRoomId: roomTypeId,
						date: moment(date).format('DD-MM-Y'),
						selectedLocale: '',
						isNoPromotion: null,
						minimumSellingPrice: {
							amount: '200000',
							currency: 'VND',
						},
						maximumSellingPrice: {
							amount: '150000000',
							currency: 'VND',
						},
						sellPrice: {
							amount: String(price),
							currency: 'VND',
						},
						sellPriceSingle: {
							amount: String(price),
							currency: 'VND',
						},
						extraBedPrice: {
							amount: '0',
							currency: 'VND',
						},
					})),
					roomTypeId,
					startDate: fromDate,
					endDate: toDate,
					hotelId: propertyId,
					roomTypeIds: [roomTypeId],
					mode: 'RATE',
				},
				// context,
				// auth: otaConfig.other.auth,
			};
			await syncPrice(requestBody, otaConfig, propertyId);
		});
	}
}

async function getRoomRates(otaConfig, propertyId, roomTypeId) {
	const url = `${DOMAIN_V3}/api/v1/rate-structure/ari-setups/rate-plans?roomId=${roomTypeId}`;

	const result = await requestToTera({
		url,
		otaConfig,
		hotelId: propertyId,
	}).then(res => res.json());

	if (!result.data.result) {
		logger.error('getRoomRates not found', propertyId, roomTypeId, JSON.stringify(result));
	}

	return result.data.result;
}

async function syncRatePrice({ otaConfig, roomTypeId, rateIds, listOfDates, price, propertyId }) {
	const rateLimits = {};

	const roomRates = await getRoomRates(otaConfig, propertyId, roomTypeId);

	rateIds.forEach(rateId => {
		const roomRate = roomRates.find(r => r.ratePlanId.toString() === rateId);
		if (!roomRate) return;

		rateLimits[roomRate.roomRatePlanId] = {
			rates: {
				RETAIL: {
					actualRate: price,
					rateReference: 'DEFAULT',
				},
				SINGLE: {
					actualRate: null,
					rateReference: 'RETAIL',
				},
			},
		};

		if (roomRate.derivedRatePlans && roomRate.derivedRatePlans.length) {
			roomRate.derivedRatePlans.forEach(derivedRatePlan => {
				rateLimits[derivedRatePlan.roomRatePlanId] = {
					rates: {
						RETAIL: {
							actualRate: null,
							rateReference: 'DERIVED',
						},
						SINGLE: {
							actualRate: null,
							rateReference: 'DERIVED',
						},
					},
				};
			});
		}
	});

	if (_.isEmpty(rateLimits)) {
		throw new Error(
			`Traveloka syncRatePrice empty rateLimits ${roomTypeId} ${rateIds} ${JSON.stringify(roomRates)}`
		);
	}

	const requestBody = {
		// context: otaConfig.other.context,
		// auth: otaConfig.other.auth,
		data: {
			listOfDates,
			rooms: {
				[roomTypeId]: {
					rateLimits,
				},
			},
		},
	};

	const uri = `${DOMAIN_V3}/api/v1/rate-structure/ari-setups/bulk-update/rates`;
	// const body = JSON.stringify(requestBody);

	// const result = await fetchRetry(
	// 	uri,
	// 	{
	// 		method: 'POST',
	// 		body,
	// 		redirect: 'manual',
	// 	},
	// 	otaConfig
	// );

	const result = await requestToTera({
		url: uri,
		options: {
			method: 'POST',
		},
		otaConfig,
		hotelId: propertyId,
		body: requestBody,
	});

	if (result && result.status !== 200) {
		const data = await result.text();
		throw new Error(`Traveloka syncRatePrice error ${uri} ${data}`);
	}

	const rs = await result.json();
	if (!rs.data.success) {
		throw new Error(`Traveloka syncRatePrice error ${uri} ${JSON.stringify(rs)}`);
	}
}

async function syncPrice(requestBody, otaConfig, propertyId) {
	const uri = `${DOMAIN}/api/v2/room/saveHotelRoomInventoryRate`;
	// const body = JSON.stringify(requestBody);

	// const result = await fetchRetry(
	// 	uri,
	// 	{
	// 		method: 'POST',
	// 		body,
	// 		redirect: 'manual',
	// 	},
	// 	otaConfig
	// );

	const result = await requestToTera({
		url: uri,
		options: {
			method: 'POST',
		},
		otaConfig,
		hotelId: propertyId,
		body: requestBody,
	});

	if (result && result.status !== 200) {
		const data = await result.text();
		throw new Error(`Traveloka syncPrice error ${uri} ${data}`);
	}
	const rs = await result.json();
	if (rs.status !== 'SUCCESS') {
		throw new Error(`Traveloka syncPrice error ${uri} ${JSON.stringify(rs)}`);
	}
}

async function markNoShow({ otaConfig, propertyId, otaBookingId }) {
	const uri = `https://astbapi-public.ast.traveloka.com/api/v2/reservation/createReservationClaim`;

	// const context = await changeHotelSession(otaConfig, propertyId);
	const body = {
		// context,
		// auth: otaConfig.other.auth,
		data: {
			hotelId: propertyId,
			reservationId: otaBookingId,
			type: 'NO_SHOW',
		},
	};

	const res = await requestToTera({
		url: uri,
		options: {
			method: 'POST',
		},
		otaConfig,
		hotelId: propertyId,
		body,
	});

	if (res && res.status !== 200) {
		const data = await res.text();
		return Promise.reject(data);
	}
	const rs = await res.json();
	if (rs.status !== 'SUCCESS') {
		return Promise.reject(rs);
	}
}

async function getStaticContacts({ propertyId, otaConfig }) {
	const uri = `${DOMAIN_V2}/api/v2/inventory/contracts/get`;
	const body = {
		// context: otaConfig.other.context,
		// auth: otaConfig.other.auth,
		data: {
			startYear: null,
			type: 'STATIC',
		},
	};

	const res = await requestToTera({
		url: uri,
		options: {
			method: 'POST',
		},
		otaConfig,
		hotelId: propertyId,
		body,
	});

	if (res.status !== 200) {
		const data = await res.text();
		return Promise.reject(data);
	}

	const rs = await res.json();
	if (rs.status !== 'SUCCESS') {
		return Promise.reject(rs);
	}

	// adpContract: null;
	// contractDocumentLink: 'https://tera.traveloka.com/v2/room/rateContract/';
	// contractEntity: 'SG02';
	// contractId: '20047877';
	// hotelId: '20047877';
	// inventoryModel: 'CONSIGNMENT';
	// isActive: true;
	// rateContractId: '1778608665407807120';
	// rateStructureType: 'STATIC';

	return rs.data.entries.filter(
		e =>
			e.isActive &&
			`${e.validEndDate.year}-${e.validEndDate.month}-${e.validEndDate.day}` >= new Date().toDateMysqlFormat()
	);
}

async function getStaticRates({ otaConfig, rateContractId, roomId, propertyId }) {
	const uri = `${DOMAIN_V2}/api/v2/inventory/categories/get/byContractIdAndRoomId`;
	const body = {
		// context: otaConfig.other.context,
		// auth: otaConfig.other.auth,
		data: {
			contractId: rateContractId,
			roomId,
		},
	};

	const res = await requestToTera({
		url: uri,
		options: {
			method: 'POST',
		},
		otaConfig,
		hotelId: propertyId,
		body,
	});

	const json = await res.json();
	if (json.status !== 'SUCCESS') {
		return Promise.reject(json);
	}

	// b2bTargetedSourceMarket: [];
	// b2cTargetedSourceMarket: [];
	// bookLeadTime: 0;
	// bookingEndDate: null;
	// bookingStartDate: null;
	// cancellationRule: '121';
	// disableB2B: false;
	// inclusions: [];
	// isActive: true;
	// isAlwaysAllowedB2C: true;
	// minimumRate: null;
	// rateCategoryId: '1778608751300868110';
	// rateCategoryName: 'Oct-Dec.2023';
	// rateContractId: '1778608665407807120';
	// rateTypeFlagging: ['REGULAR'];
	// roomIds: ['20253581'];
	// status: 'NOT_SET';

	return json.data.entries.filter(e => e.isActive);
}

async function findStaticsRes(listingId, items) {
	const bookings = await mongoose
		.model('Booking')
		.find({
			otaName: OTAs.Traveloka,
			status: BookingStatus.CONFIRMED,
			listingId,
			from: { $lte: new Date(_.last(items).date).zeroHours() },
			to: { $gt: new Date(_.head(items).date).zeroHours() },
			'rateDetail.ratePlanType': 'STATIC',
		})
		.select('from to amount');

	const rs = {};

	bookings.forEach(booking => {
		rangeDate(booking.from, booking.to, false)
			.toArray()
			.forEach(date => {
				const formatD = date.toDateMysqlFormat();
				rs[formatD] = rs[formatD] || 0;
				rs[formatD] += booking.amount || 1;
			});
	});

	return rs;
}

async function syncStaticSchedules({ otaConfig, roomTypeId, propertyId, data, dates }) {
	const contracts = await getStaticContacts({ propertyId, otaConfig });

	const entries = [];

	await contracts.asyncForEach(async contact => {
		const contractEndDate = `${contact.validEndDate.year}-${contact.validEndDate.month}-${contact.validEndDate.day}`;
		const items = dates.filter(item => item.date <= contractEndDate);

		if (!items.length) return;

		const rates = await getStaticRates({
			otaConfig,
			rateContractId: contact.rateContractId,
			roomId: roomTypeId,
			propertyId,
		});

		const booked = await findStaticsRes(data.listingId, items);

		rates.forEach(rate => {
			items.forEach(item => {
				const sold = booked[item.date] || 0;
				const allotment = Math.max(0, Math.min(item.available, item.staticRooms) - sold);

				entries.push({
					allotment,
					dayOfWeeks: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
					startDate: item.date,
					endDate: item.date,
					rateCode: `${rate.rateContractId}#${rate.rateCategoryId}#${roomTypeId}`,
					isCloseOut: allotment === 0,
					isNoCheckIn: null,
					isNoCheckOut: null,
				});
			});
		});
	});

	if (entries.length) {
		const uri = `${DOMAIN_V2}/api/v2/inventory/allotment/update/bulk/byDateRangeAndDOW`;
		const body = {
			// context: otaConfig.other.context,
			// auth: otaConfig.other.auth,
			data: {
				entries,
			},
		};

		// const res = await fetchRetry(
		// 	uri,
		// 	{
		// 		method: 'POST',
		// 		redirect: 'manual',
		// 		body: JSON.stringify(body),
		// 	},
		// 	otaConfig
		// );
		const res = await requestToTera({
			url: uri,
			options: {
				method: 'POST',
			},
			otaConfig,
			hotelId: propertyId,
			body,
		});

		const json = await res.json();

		if (json.status !== 'SUCCESS') {
			return Promise.reject(json);
		}
	}
}

module.exports = {
	synchronizeSchedule,
	fetchRoomsToSell,
	syncDone,
	synchronizePrice,
	markNoShow,
};

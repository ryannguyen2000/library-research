const moment = require('moment');
const _ = require('lodash');
const FormData = require('form-data');

const { createCache } = require('@utils/cache');
const fetchRetry = require('@utils/fetchRetry');
const { OTAs } = require('@utils/const');
const { logger } = require('@utils/logger');
const { getQuickstayHeader } = require('@controllers/ota_api/header_helper');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

const URI = 'https://quickstay.vn/api/partner/room/update';

async function request({ uri, body, method = 'POST', headers = null, otaConfig }) {
	const result = await fetchRetry(
		uri,
		{
			method,
			body,
			headers: {
				...getQuickstayHeader(otaConfig),
				...headers,
			},
		},
		otaConfig
	);
	if (!result.ok) {
		logger.error(`${OTAs.Quickstay} request API error`, method, body, await result.text());
	}
	return result.json();
}

function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaConfig, syncId) {
	const now = new Date();
	if (from.toDateMysqlFormat() !== now.toDateMysqlFormat()) return;

	const calendars = addCalendar(syncId);
	const { account } = otaConfig;
	const { otaListingId } = otaListing;

	if (!calendars[account])
		calendars[account] = {
			otaConfig,
			listings: {},
		};

	const isWeekend = [5, 6].includes(now.getDay());

	calendars[account].listings[otaListingId] = {
		is_active_hour: available > 0 && moment().format('HH:mm') < '16:00' && !isWeekend,
		is_active_overnight: available > 0 && !isWeekend,
	};
}

async function syncDone(syncId) {
	const calendars = getCalendar(syncId);

	await Object.keys(calendars)
		.filter(k => k !== 'createdAt')
		.asyncForEach(async account => {
			const { listings, otaConfig } = calendars[account];
			const rooms = await getHotelRooms(otaConfig);
			if (!rooms) return;

			await Object.keys(listings).asyncForEach(async otaListingId => {
				const room = rooms.find(r => r.id.toString() === otaListingId.toString());
				if (!room) return;

				const body = new FormData();
				const data = listings[otaListingId];

				body.append(
					'data',
					JSON.stringify({
						...room,
						images: getImages(room.images),
						services: false,
						is_active_hour: data.is_active_hour,
						is_active_overnight: data.is_active_overnight,
					})
				);

				await request({
					uri: URI,
					body,
					otaConfig,
					headers: {
						'content-type': body.getHeaders()['content-type'],
					},
				});
			});
		});

	deleteCalendar(syncId);
}

function getImages(imagesEncodeJSON) {
	try {
		const decode = typeof imagesEncodeJSON === 'string' ? JSON.parse(imagesEncodeJSON) : imagesEncodeJSON;
		return decode;
	} catch (e) {
		return [];
	}
}

async function getHotelRooms(otaConfig) {
	const data = await request({
		uri: 'https://quickstay.vn/api/partner/hotel',
		method: 'GET',
		otaConfig,
	});
	return _.get(data, 'data.hotel.rooms');
}

async function syncCheckin({ booking, message, otaConfig }) {
	await request({
		uri: `https://quickstay.vn/api/partner/v2/order/using`,
		body: JSON.stringify({
			order_code: booking.otaBookingId,
			order_id: parseInt(message.inquiryPostId),
		}),
		otaConfig,
	});
}

async function syncCheckout({ message, otaConfig }) {
	await request({
		uri: `https://quickstay.vn/api/partner/v2/order/done`,
		body: JSON.stringify({
			order_id: parseInt(message.inquiryPostId),
		}),
		otaConfig,
	});
}

module.exports = {
	synchronizeSchedule,
	syncDone,
	syncCheckin,
	syncCheckout,
};

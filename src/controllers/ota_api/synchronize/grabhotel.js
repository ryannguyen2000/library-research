// const moment = require('moment');
// const _ = require('lodash');
// const mongoose = require('mongoose');

// const { createCache } = require('@utils/cache');
// const fetchRetry = require('@utils/fetchRetry');
// const { OTAs } = require('@utils/const');
// const { rangeDate } = require('@utils/date');
// // const { logger } = require('@utils/logger');

// const { addCalendar, deleteCalendar, getCalendar } = createCache();

// // https://admin.grabhotel.net

// const URI = 'https://apiv2.grabhotel.net';
// const SYNC_PRICE_URI = `${URI}/price-setting/setting`;
// const SYNC_URI = `${URI}/rooms-quantity/setting`;
// const CHUNK_SIZE = 90;
// const OTAName = OTAs.Grabhotel;

// async function updateSchedule(items, otaConfig) {
// 	const body = JSON.stringify({
// 		settings_data: items,
// 	});

// 	const result = await fetchRetry(
// 		SYNC_URI,
// 		{
// 			method: 'PUT',
// 			body,
// 		},
// 		otaConfig
// 	);
// 	if (result && result.status !== 200) {
// 		const data = await result.text();
// 		throw new Error(`Grabhotel synchronizeSchedule error ${body} ${data}`);
// 	}
// }

// function synchronizeSchedule(otaPropertyId, otaListing, from, to, available, otaConfig, syncId) {
// 	const calendars = addCalendar(syncId);

// 	const { account } = otaConfig;

// 	if (!calendars[account]) calendars[account] = { data: [], otaConfig };
// 	calendars[account].data.push({
// 		applicable_date: from.toDateMysqlFormat(),
// 		quantity: available,
// 		room_id: otaListing.otaListingId,
// 	});
// }

// async function updateDates({ data, otaConfig }) {
// 	await _.chunk(data, CHUNK_SIZE).asyncForEach(item => updateSchedule(item, otaConfig));
// }

// async function syncDone(syncId) {
// 	const calendars = _.cloneDeep(getCalendar(syncId));
// 	deleteCalendar(syncId);

// 	await Object.keys(calendars)
// 		.filter(k => k !== 'createdAt')
// 		.asyncForEach(account => updateDates(calendars[account]));
// }

// async function getServiceId(otaListing, otaConfig) {
// 	let service_id = _.get(otaListing, 'other.service_id');
// 	if (service_id) return service_id;

// 	const result = await fetchRetry(`${URI}/service/list?room_id=${otaListing.otaListingId}`, null, otaConfig).then(
// 		res => res.json()
// 	);
// 	service_id = (_.get(result, 'data.rows', []).find(r => r.type === 3) || {}).id;
// 	if (service_id) {
// 		_.set(otaListing, 'other.service_id', service_id);
// 		await mongoose
// 			.model('Listing')
// 			.updateOne({ OTAs: { $elemMatch: otaListing } }, { $set: { 'OTAs.$.other': { service_id } } });
// 	}

// 	return service_id;
// }

// async function synchronizePrice(otaPropertyId, otaListing, from, to, rateId, price, otaConfig, smartPrice, daysOfWeek) {
// 	const today = new Date();
// 	if (moment(to).isBefore(today, 'day')) return;
// 	if (moment(from).isBefore(today, 'day')) from = today;

// 	const service_id = await getServiceId(otaListing, otaConfig);
// 	if (!service_id) return;

// 	const promotions = await mongoose
// 		.model('tbPromotion')
// 		.findPromotionsForListing(otaListing.otaListingId, OTAName);

// 	const settings_data = [];
// 	rangeDate(from, to)
// 		.toArray()
// 		.forEach(date => {
// 			if (daysOfWeek && daysOfWeek.length && !daysOfWeek.includes((date.getDay() + 1).toString())) return;

// 			const { discount = 0 } =
// 				_.maxBy(
// 					promotions.filter(p => p.isMatchDate(date)),
// 					'discount'
// 				) || {};

// 			const promotion_price = discount ? Math.ceil(price * (1 - discount / 100)) : price;

// 			settings_data.push({
// 				hotel_id: otaPropertyId,
// 				date_apply: date.toDateMysqlFormat(),
// 				price,
// 				promotion_price,
// 				service_id,
// 			});
// 		});

// 	await _.chunk(settings_data, CHUNK_SIZE).asyncForEach(async items => {
// 		const result = await fetchRetry(
// 			SYNC_PRICE_URI,
// 			{
// 				method: 'PUT',
// 				body: JSON.stringify({ settings_data: items }),
// 			},
// 			otaConfig
// 		);
// 		if (result && result.status !== 200) {
// 			const data = await result.text();
// 			throw new Error(`Grabhotel synchronizePrice error ${otaListing.otaListingId} ${JSON.stringify(data)}`);
// 		}
// 	});
// }

// // async function resyncListingPrice(listing, from, to, serviceTypes) {
// // 	const otaListing = listing.getOTA(OTAName);
// // 	if (!otaListing) return;

// // 	const now = new Date();
// // 	from = from || now;
// // 	if (from < now) {
// // 		from = now;
// // 	}
// // 	to = to || moment(from).add(30, 'day').toDate();

// // 	const otaPropertyId = await mongoose
// // 		.model('Block')
// // 		.getPropertyIdOfABlock(listing.blockId, OTAName, otaListing.account);
// // 	if (!otaPropertyId) return;

// // 	const otaConfig = await mongoose.model('OTAManager').findByName(OTAName, otaListing.account);
// // 	if (!otaConfig) return;

// // 	const room = await mongoose.model('Room').findById(listing.roomIds[0]).select('info.name');
// // 	const roomType = room.info.name;
// // 	serviceTypes = serviceTypes || otaListing.serviceTypes;

// // 	await serviceTypes.asyncForEach(async serviceType => {
// // 		const prices = await mongoose.model('PriceHistory').getPrices({
// // 			blockId: listing.blockId,
// // 			from,
// // 			to,
// // 			roomType,
// // 			ota: OTAName,
// // 			serviceType,
// // 		});

// // 		await prices.reverse().asyncForEach(pre => {
// // 			// const price = _.find(_.get(pre, ['prices', roomType, OTAName]), o => o.price);
// // 			// if (!price) return;

// // 			return synchronizePrice(
// // 				otaPropertyId.propertyId,
// // 				otaListing,
// // 				from,
// // 				to,
// // 				null,
// // 				pre.price,
// // 				otaConfig,
// // 				null,
// // 				pre.daysOfWeek
// // 			).catch(e => {
// // 				logger.error(e);
// // 			});
// // 		});
// // 	});
// // }

// module.exports = {
// 	synchronizeSchedule,
// 	synchronizePrice,
// 	syncDone,
// 	// resyncListingPrice,
// };

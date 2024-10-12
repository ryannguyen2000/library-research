const _ = require('lodash');
const { batch } = require('@services/facebook/commerce');
const moment = require('moment');

const models = require('@models');
const { logger } = require('@utils/logger');
const { createCache } = require('@utils/cache');

const { addCalendar, deleteCalendar, getCalendar } = createCache();

function getAvailableState(available) {
	return available > 0 ? 'in stock' : 'out of stock';
}

async function synchronizePrice({ propertyId, otaListing, from, listing, ratePlanId }) {
	if (moment().isBefore(from, 'day')) return;
	const otaListingId = _.get(otaListing, 'otaListingId');

	if (!propertyId) {
		logger.warn(`Facebook synchronize price for otaListingId (${otaListingId}): facebook catalogId does not exist`);
		return;
	}

	const cozrumPrice = await models.CozrumPrice.findOne({
		otaListingId,
		roomTypeId: listing.roomTypeId,
		ratePlanId,
		date: from,
	}).lean();

	if (!cozrumPrice) {
		logger.warn(`Facebook synchronize price for otaListingId (${otaListingId}): price does not exist`);
		return;
	}

	const data = {
		id: otaListingId,
		price: `${cozrumPrice.price} VND`,
		sale_price: cozrumPrice.promotionPrice ? `${cozrumPrice.promotionPrice} VND` : '',
	};
	const requests = [{ method: 'UPDATE', data }];
	await batch(propertyId, requests);
}

function synchronizeSchedule(propertyId, otaListing, from, to, available, otaConfig, syncId, listing) {
	const today = new Date().toDateMysqlFormat();
	const isToday = today === from.toDateMysqlFormat();
	if (!isToday) return;

	const calendar = addCalendar(syncId);
	const data = {
		availability: getAvailableState(available),
		retailerId: _.get(otaListing, 'otaListingId', ''),
		catalogId: propertyId,
	};
	Object.assign(calendar, data);
}

async function syncDone(syncId) {
	const calendar = getCalendar(syncId);
	if (!calendar) return;

	const { catalogId, retailerId, availability } = calendar;
	if (!catalogId) {
		logger.warn('Facebook synchronize schedule: catalogId does not exist');
		return;
	}

	const requests = [
		{
			method: 'UPDATE',
			data: { id: retailerId, availability },
		},
	];

	await batch(catalogId, requests);
	deleteCalendar(syncId);
}

module.exports = {
	synchronizeSchedule,
	syncDone,
	synchronizePrice,
};

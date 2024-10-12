const schedule = require('node-schedule');
const _ = require('lodash');

const { OTAs } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const Sync = require('@controllers/ota_api/synchronize');

async function createSync(otaName) {
	try {
		const listings = await models.Listing.find({
			OTAs: { $elemMatch: { otaName, active: true } },
		}).select('_id OTAs');
		if (!listings.length) return;

		const groups = _.groupBy(listings, l => l.getOTA(otaName).account);

		_.forEach(groups, (group, account) => {
			models.JobCalendar.createByListing({
				listingIds: group.map(l => l._id),
				from: new Date(),
				to: new Date(),
				otas: [
					{
						otaName,
						account,
					},
				],
				description: `Auto sync every day ${otaName}`,
			});
		});
	} catch (e) {
		logger.error('createSync error', e);
	}
}

async function syncPromotionPrice() {
	try {
		await _.entries(Sync)
			.filter(([__, syncFunc]) => syncFunc.resyncListingPrice)
			.asyncMap(async ([otaName, syncFunc]) => {
				const listings = await models.Listing.find({
					roomIds: { $ne: [] },
					OTAs: { $elemMatch: { otaName, active: true } },
				}).select('OTAs roomIds blockId roomTypeId');

				logger.info('syncCalendarCreator.job syncPromotionPrice total listings', otaName, listings.length);

				if (!listings.length) return;

				await listings.asyncForEach(async listing => {
					await syncFunc
						.resyncListingPrice(listing)
						.then(() => {
							logger.info(
								'syncCalendarCreator.job syncPromotionPrice',
								otaName,
								listing.blockId,
								listing._id
							);
						})
						.catch(e => {
							logger.error('syncCalendarCreator.job syncPromotionPrice', otaName, e);
						});
					await Promise.delay(2000);
				});
			});
	} catch (e) {
		logger.error(e);
	}
}

// syncPromotionPrice();

schedule.scheduleJob('0 8 * * *', () => createSync(OTAs.Go2joy));
// schedule.scheduleJob('0 8,16 * * *', () => createSync(OTAs.Quickstay));
schedule.scheduleJob('40 3 * * *', syncPromotionPrice);

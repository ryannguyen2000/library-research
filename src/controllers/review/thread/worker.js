const _ = require('lodash');

const { logger } = require('@utils/logger');
const models = require('@models');
const Reviews = require('@controllers/ota_api/reviews');

async function addReviews(reviews) {
	await _.uniqBy(reviews, r => r.otaName + r.otaId).asyncMap(async review => {
		if (!review.bookingId && review.otaBookingId) {
			const booking = await models.Booking.findOne({
				otaName: review.otaName,
				otaBookingId: review.otaBookingId,
			}).select('_id blockId listingId');

			if (booking) {
				review.bookingId = booking._id;
				review.listingId = review.listingId || booking.listingId;
				review.blockId = review.blockId || booking.blockId;
			}
		}

		if (!review.listingId && review.otaListingId) {
			const listing = await models.Listing.findListingByOTA(review.otaName, review.otaListingId);

			if (listing) {
				review.listingId = review.listingId || listing._id;
				review.blockId = review.blockId || listing.blockId;
			}
		}

		return models.BookingReview.updateOrCreate(review).catch(e => {
			logger.error(e);
		});
	});
}

async function syncReviews(otas, getAll) {
	otas = otas || _.keys(Reviews);
	const result = await _.entries(Reviews)
		.filter(([otaName, review]) => review.reviewsCrawler && otas.includes(otaName))
		.asyncMap(async ([otaName, review]) => {
			const otaConfigs = await models.OTAManager.findByName(otaName);
			return otaConfigs.asyncMap(otaConfig => {
				return review
					.reviewsCrawler(otaConfig, getAll)
					.then(addReviews)
					.catch(err => logger.error(err));
			});
		});

	return result;
}

module.exports = {
	syncReviews,
};

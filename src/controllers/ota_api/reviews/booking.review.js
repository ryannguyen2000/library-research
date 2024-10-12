const _ = require('lodash');
const mongoose = require('mongoose');

// const fetch = require('@utils/fetch');
const fetchRetry = require('@utils/fetchRetry');
const Uri = require('@utils/uri');
const { logger } = require('@utils/logger');
const { OTAs } = require('@utils/const');

const ReviewsUri = 'https://admin.booking.com/fresa/extranet/review/fetch_reviews';
const MAX_PAGE = 50;
const LIMIT = 50;

async function getReviews(ota, propertyId, offset = 0) {
	const uri = Uri(ReviewsUri, {
		lang: 'xu',
		hotel_id: propertyId,
		ses: ota.other.ses,
		rows: LIMIT,
		offset,
		only_without_replies: 0,
		only_with_comments: 0,
	});

	try {
		const result = await fetchRetry(
			uri,
			{
				timeout: 10 * 60 * 1000,
				headers: {
					Cookie: ota.cookie,
					Accept: 'application/json, text/plain, */*',
				},
			},
			ota
		);

		const data = await result.json();
		if (!data.data || !data.data.reviews) {
			logger.error(`Booking get reviews error ${uri} ${JSON.stringify(data)}`);
			return [];
		}
		const page = offset / LIMIT + 1;
		if (data.data.pageCount <= page || page > MAX_PAGE) {
			return data.data.reviews || [];
		}

		return [...data.data.reviews, ...(await getReviews(ota, propertyId, offset + LIMIT))];
	} catch (err) {
		logger.error(`Booking get reviews error ${uri} ${err}`);
		return [];
	}
}

function parseReview(data, blockId) {
	const review = {
		otaName: OTAs.Booking,
		scores: {},
		rating: data.hotelAverage,
		details: { name: data.yourname, checkOut: data.completed },
		otaBookingId: _.toString(data.booknumber),
		comments: data.hotelPositive,
		feedback: data.hotelNegative,
		blockId,
		otaId: data.id,
		reviewedAt: new Date(data.completed),
	};
	if (data.hotelStaff !== undefined) review.scores.staff = data.hotelStaff;
	if (data.hotelClean !== undefined) review.scores.cleanliness = data.hotelClean;
	if (data.hotelLocation !== undefined) review.scores.location = data.hotelLocation;
	if (data.hotelComfort !== undefined) review.scores.comfort = data.hotelComfort;
	if (data.hotelValue !== undefined) review.scores.value = data.hotelValue;
	if (data.hotelServices !== undefined) review.scores.services = data.hotelServices;

	return review;
}

async function reviewsCrawler(otaConfig) {
	const reviews = [];

	const properties = await mongoose.model('Block').getPropertiesId(otaConfig.name, otaConfig.account, true);

	await properties.asyncMap(async property => {
		const otaReviews = await getReviews(otaConfig, property.propertyId);

		otaReviews.forEach(review => {
			reviews.push(parseReview(review, property.blockId));
		});
	});

	return reviews;
}

module.exports = {
	reviewsCrawler,
};

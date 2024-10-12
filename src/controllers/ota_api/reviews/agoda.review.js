const mongoose = require('mongoose');

const fetchRetry = require('@utils/fetchRetry');
const { logger } = require('@utils/logger');
const { OTAs } = require('@utils/const');

const OTAName = OTAs.Agoda;
const pageSize = 100;
const MAX_PAGE = 50;

async function getReviews(ota, hotelId, pageNumber = 1) {
	const body = {
		language: 'en-us',
		hotelId,
		pageSize,
		pageNumber,
		feedbackStatus: 88,
		sortBy: 1,
	};

	try {
		const result = await fetchRetry(
			`https://ycs.agoda.com/en-us/${hotelId}/kipp/api/reviewApi/GetReviewAndFeedbackList`,
			{
				method: 'POST',
				body: JSON.stringify(body),
				timeout: 10 * 60 * 1000,
			},
			ota
		);
		if (result.status !== 200) {
			const err = await result.text();
			logger.error(`Agoda get reviews error ${hotelId} ${ota.account} ${err}`);
			return [];
		}
		const data = await result.json();
		if (data.TotalReviews <= pageNumber * pageSize || pageNumber > MAX_PAGE) {
			return data.Reviews;
		}
		return [...data.Reviews, ...(await getReviews(ota, hotelId, pageNumber + 1))];
	} catch (e) {
		logger.error(`Agoda get reviews error ${hotelId} ${ota.account} ${e}`);
		return [];
	}
}

async function reviewsCrawler(ota) {
	const reviews = [];

	const properties = await mongoose.model('Block').getPropertiesId(OTAName, ota.account, true);

	for (const propery of properties) {
		const results = await getReviews(ota, propery.propertyId);

		results.forEach(({ ReviewInfo }) => {
			reviews.push({
				comments: `${ReviewInfo.Title}. ${ReviewInfo.Comment}`,
				feedback: '',
				otaName: OTAName,
				blockId: propery.blockId,
				otaBookingId: ReviewInfo.BookingId,
				scores: {},
				rating: ReviewInfo.Score,
				details: {
					checkIn: ReviewInfo.CheckInDate,
					checkOut: ReviewInfo.CheckOutDate,
					name: ReviewInfo.ReviewerName,
				},
				otaId: ReviewInfo.ReviewId.toString(),
				reviewedAt: new Date(ReviewInfo.ReviewDate),
			});
		});
	}

	return reviews;
}

module.exports = {
	reviewsCrawler,
};

const _ = require('lodash');
const cheerio = require('cheerio');

const fetchRetry = require('@utils/fetchRetry');
const Uri = require('@utils/uri');
const { OTAs } = require('@utils/const');
const { logger } = require('@utils/logger');
const ThrowReturn = require('@core/throwreturn');
const { AIRBNB_HOST } = require('@controllers/ota_api/header_helper');

const REVIEW_URI = `${AIRBNB_HOST}/api/v2/reviews`;
const LIMIT = 50;
const MAX_PAGE = 50;

async function getReviews(ota, _offset = 0) {
	if (!ota.other.revieweeId) return null;

	const uri = Uri(REVIEW_URI, {
		_format: 'for_web_host_stats',
		_order: 'recent',
		role: 'guest',
		currency: 'USD',
		locale: 'en',
		key: ota.other.key,
		_limit: LIMIT,
		_offset,
		reviewee_id: ota.other.revieweeId,
	});

	const result = await fetchRetry(
		uri,
		{
			timeout: 10 * 60 * 1000,
		},
		ota
	).catch(err => logger.error(`Airbnb get reviews error ${err}`));

	if (!result.ok) {
		const err = await result.text();
		logger.error('Airbnb get reviews error', err);
		return [];
	}
	return await result.json();
}

async function reviewsCrawler(ota, getAll = false) {
	let reviews = [];
	let total = 0;
	let offset = 0;
	do {
		// eslint-disable-next-line no-await-in-loop
		const results = await getReviews(ota, offset);
		if (!results || results.length === 0) break;

		for (const review of results.reviews) {
			reviews.push({
				scores: {
					accuracy: review.accuracy,
					checkin: review.checkin,
					cleanliness: review.cleanliness,
					communication: review.communication,
					location: review.location,
					value: review.value,
				},
				rating: review.rating,
				comments: review.comments,
				feedback: review.private_feedback,
				otaName: OTAs.Airbnb,
				otaBookingId: review.reservation.confirmation_code,
				otaListingId: _.toString(review.reservation.listing.id),
				details: {
					checkIn: review.reservation.check_in,
					checkOut: review.reservation.check_out,
					name: review.reviewer.first_name,
					avatar: review.reviewer.profile_pic_path,
				},
				otaId: _.toString(review.id),
				reviewedAt: new Date(review.reservation.check_out),
			});
		}
		total = results.metadata.reviews_count;
		offset = reviews.length;
	} while (getAll && reviews.length < total && offset / LIMIT < MAX_PAGE);

	reviews = reviews.filter(r => r.rating > 0);

	return reviews;
}

async function submitReview(
	ota,
	hostReviewId,
	feedback,
	privateFb = null,
	cleanliness = 5,
	communication = 5,
	respect = 5,
	recommend = true
) {
	const uri = `${AIRBNB_HOST}/api/v2/walle_answers_updates/host_review_guest/${hostReviewId}?currency=USD&key=${ota.other.key}&locale=en`;
	const data = {
		answers: [
			{
				index: 0,
				question_id: 'public_feedback',
				value: feedback,
			},
			{
				index: 0,
				question_id: 'private_feedback',
				value: privateFb,
			},
			{
				index: 0,
				question_id: 'cleanliness_rating',
				value: cleanliness.toString(),
			},
			{
				index: 0,
				question_id: 'communication_rating',
				value: communication.toString(),
			},
			{
				index: 0,
				question_id: 'respect_house_rules_rating',
				value: respect.toString(),
			},
			{
				index: 0,
				question_id: 'recommend_guest',
				value: recommend.toString(),
			},
		],
		current_step_id: 'all_questions',
		mark_as_submitted: true,
	};

	const result = await fetchRetry(
		uri,
		{
			method: 'PUT',
			body: JSON.stringify(data),
		},
		ota
	);
	if (!result.ok) {
		const text = await result.text();
		logger.error('Airbnb review guest error', uri, text);
		throw new ThrowReturn('Airbnb review guest error');
	}
}

async function guestReview(ota) {
	// if (!ota.other.revieweeId) {
	// 	logger.error('Airbnb revieweeId not found', ota.name, ota.account);
	// 	return [];
	// }

	const uri = `${AIRBNB_HOST}/users/reviews`;
	const result = await fetchRetry(uri, null, ota);

	if (!result.ok) {
		logger.error('Airbnb get guest review error', uri);
		return [];
	}

	const html = await result.text();

	const $ = cheerio.load(html);
	const guestReviews = [];
	$('.media.reviews-list-item.space-2').each((index, item) => {
		const user = {};
		user.name = $('.name', item).text();
		user.avatar = $('img', item).attr('src');

		user.text = $('.media-body > p', item).text().trim();
		user.text = user.text.slice(0, user.text.indexOf('\n'));

		user.reviewId = $('.list-unstyled > li:nth-child(1) > a', item).attr('href');
		user.reviewId = user.reviewId.slice(user.reviewId.indexOf('s/') + 2, user.reviewId.lastIndexOf('/'));

		user.otaName = OTAs.Airbnb;
		user.otaBookingId = $('.list-unstyled > li:nth-child(2) > a', item).attr('href');
		user.otaBookingId = user.otaBookingId.slice(user.otaBookingId.indexOf('=') + 1);
		guestReviews.push(user);
	});

	return guestReviews;
}

module.exports = {
	reviewsCrawler,
	guestReview,
	submitReview,
};

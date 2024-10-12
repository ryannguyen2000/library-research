const mongosee = require('mongoose');

const router = require('@core/router').Router();
const review = require('@controllers/review');
const { syncReviews } = require('@controllers/review/thread');

async function getBookingReview(req, res) {
	const result = await review.getBookingReview(req.data.booking);
	res.sendData(result);
}

async function getRating(req, res) {
	const { ota, from, to, blockId, listingId } = req.query;
	const result = await review.getRating(
		mongosee.Types.ObjectId.isValid(blockId) ? blockId : null,
		mongosee.Types.ObjectId.isValid(listingId) ? listingId : null,
		req.decoded.user,
		ota,
		from,
		to
	);
	res.sendData(result);
}

async function getAllRating(req, res) {
	const { from, to } = req.query;
	const result = await review.getRatingDetail(req.decoded.user, from, to);
	res.sendData(result);
}

async function getReviews(req, res) {
	const { blockId, listingId, stars = 'all', start, limit, ota, hidden, from, to } = req.query;

	const result = await review.getReviews({
		blockId,
		listingId,
		user: req.decoded.user,
		star: stars === 'all' ? 0 : parseInt(stars),
		start,
		limit,
		ota,
		hidden,
		from,
		to,
	});

	res.sendData(result);
}

async function synReviews(req, res) {
	const { ota } = req.query;
	await syncReviews(ota ? [ota] : undefined, true);
	res.sendData();
}

async function getGuestReview(req, res) {
	const { ota = 'airbnb' } = req.query;
	const reviews = await review.getGuestReview(ota);
	res.sendData({ reviews });
}

async function submitReview(req, res) {
	await review.submitReview(req.body);
	res.sendData();
}

async function hiddenReview(req, res) {
	const { reviewId } = req.params;
	const { value } = req.body;
	const { user } = req.decoded;
	const hidden = await review.hiddenReview(reviewId, value, user._id);
	res.sendData({ reviewId, hidden });
}

router.getS('/', getReviews, true);
router.getS('/booking/:bookingId', getBookingReview, true);
router.getS('/rating', getRating, true);
router.getS('/allRating', getAllRating, true);
router.getS('/guestReview', getGuestReview, true);
router.postS('/sync', synReviews, true);
router.postS('/submitReview', submitReview, true);
router.postS('/hidden/:reviewId', hiddenReview, true);

const activity = {
	REVIEW_GUEST: {
		key: 'submitReview',
	},
	REVIEW_HIDDEN: {
		key: 'hidden',
	},
};

module.exports = { router, activity };

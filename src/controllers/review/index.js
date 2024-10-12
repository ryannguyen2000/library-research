const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { getIdsByQuery } = require('@utils/mongo');
const models = require('@models');
const Reviews = require('@controllers/ota_api/reviews');
const otaHelper = require('@controllers/ota_helper');
const { DEFAULT_MAX_STAR, OTA_MAX_STAR } = require('./const');

function highestReviewStar(otaName) {
	return OTA_MAX_STAR[otaName] ? OTA_MAX_STAR[otaName] : DEFAULT_MAX_STAR;
}

async function getBookingReview(booking) {
	const review = await models.BookingReview.findOne({
		$or: [
			{ bookingId: booking._id },
			{
				otaName: booking.otaName,
				otaBookingId: booking.otaBookingId,
			},
		],
	});

	return {
		review,
		highestStar: review ? highestReviewStar(review.otaName) : DEFAULT_MAX_STAR,
	};
}

async function getReviews({ blockId, listingId, user, star, start, limit, ota, hidden, from, to, excludeBlockId }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 5;

	const { blockIds, limitRooms, filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
	});
	const query = {
		blockId: { $in: blockIds },
	};

	if (ota) query.otaName = ota;
	if (limitRooms) {
		const listingIds = await getIdsByQuery(models.Listing, filters);
		_.set(query, 'listingId.$in', listingIds);
	}
	if (listingId && mongoose.Types.ObjectId.isValid(listingId)) {
		_.set(query, 'listingId.$eq', mongoose.Types.ObjectId(listingId));
	}
	if (hidden !== undefined) {
		if (hidden) {
			query.hidden = true;
		} else {
			query.hidden = { $in: [null, false] };
		}
	}
	if (star > 0) {
		query.rating = { $gte: star, $lte: star + 1 };
	}
	if (from && moment(from).isValid()) {
		_.set(query, 'reviewedAt.$gte', moment(from).startOf('date').toDate());
	}
	if (to && moment(to).isValid()) {
		_.set(query, 'reviewedAt.$lte', moment(to).endOf('date').toDate());
	}

	const reviews = await models.BookingReview.find(query)
		.sort({ reviewedAt: -1 })
		.skip(start)
		.limit(limit)
		.populate({
			path: 'bookingId',
			select: 'from to price currency blockId guestId',
			populate: {
				path: 'guestId',
				select: 'displayName name fullName country ota phone avatar',
			},
		})
		.populate({
			path: 'listingId',
			select: 'name roomIds',
			populate: {
				path: 'roomIds',
				select: 'info.name info.roomNo',
			},
		})
		.lean();

	const total = await models.BookingReview.countDocuments(query);

	reviews.forEach(review => {
		review.highestStar = highestReviewStar(review.otaName);
	});

	return { reviews, total };
}

async function getRatingAvg({ from, to, blockId, excludeBlockId }, user) {
	const { blockIds, limitRooms, filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
	});

	const query = {
		blockId: { $in: blockIds },
		'details.checkOut': { $gte: from, $lte: to },
	};

	if (limitRooms) {
		const listingIds = await getIdsByQuery(models.Listing, filters);
		query.listingIds = { $in: listingIds };
	}

	const ratingBaseFiveOtaNames = _.entries(OTA_MAX_STAR)
		.filter(ota => ota[1] === 5)
		.map(ota => ota[0]);

	const avgRatings = await models.BookingReview.aggregate()
		.match(query)
		.project({
			otaName: 1,
			rating: {
				$cond: {
					if: { $in: ['$otaName', ratingBaseFiveOtaNames] },
					then: { $multiply: ['$rating', 2] },
					else: '$rating',
				},
			},
		})
		.group({
			_id: null,
			avgScore: { $avg: '$rating' },
		});

	return _.round(_.get(avgRatings, '[0].avgScore'), 2) || 0;
}

async function getRating(blockId, listingId, user, otaName, from, to) {
	const { blockIds, limitRooms, filters } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockId });

	let listingIds = listingId;

	if (limitRooms) {
		const query = {
			...filters,
		};
		if (listingId) query._id = mongoose.Types.ObjectId(listingId);
		listingIds = await getIdsByQuery(models.Listing, query);
	}

	if (otaName) {
		return models.BookingReview.aggregateInfo({
			blockIds,
			listingIds,
			otaName,
			highestStar: highestReviewStar(otaName),
			from,
			to,
		});
	}

	const ratings = await Object.keys(OTA_MAX_STAR).asyncMap(ota =>
		models.BookingReview.aggregateInfo({
			blockIds,
			listingIds,
			otaName: ota,
			highestStar: highestReviewStar(ota),
			from,
			to,
		})
	);

	const starCalc = 10;
	const total = _.sumBy(ratings, 'total') || 0;
	const avgRating = total && _.sumBy(ratings, r => r.rating * (starCalc / r.highestStar) * r.total) / total;

	return {
		ratings,
		total,
		avgRating: _.round(avgRating, 2),
	};
}

async function getRatingDetail(user, from, to) {
	const { blockIds, limitRooms, filters } = await models.Host.getBlocksOfUser({ user });

	const blocks = await models.Block.find({ _id: { $in: blockIds }, active: true, isProperty: true }).select(
		'info.name'
	);

	let listingIds;
	if (limitRooms) {
		listingIds = await getIdsByQuery(models.Listing, filters);
	}

	return blocks.asyncMap(async block => ({
		block,
		data: await Object.keys(OTA_MAX_STAR).asyncMap(otaName =>
			models.BookingReview.aggregateInfo({
				blockIds: block._id,
				listingIds,
				otaName,
				highestStar: highestReviewStar(otaName),
				from,
				to,
			})
		),
	}));
}

function filterDuplicateGuest(reviews) {
	const res = {};
	reviews.forEach(value => {
		if (!res[value.otaBookingId]) {
			res[value.otaBookingId] = value;
		}
	});
	return Object.values(res);
}

async function getGuestReview(otaName) {
	if (!Reviews[otaName] || !Reviews[otaName].guestReview) {
		logger.error('GuestReview not supported yet', otaName);
		return [];
	}

	const otas = await models.OTAManager.findByName(otaName);
	const reviews = await otas
		.asyncMap(ota => Reviews[otaName].guestReview(ota))
		.then(res => filterDuplicateGuest(_.flatten(res)))
		.then(res =>
			res.asyncMap(async value => {
				const booking = await models.Booking.findOne({
					otaName,
					otaBookingId: value.otaBookingId,
				})
					.select('_id from to blockId listingId')
					.populate('blockId', 'info.name')
					.populate('listingId', 'info.name');
				value.booking = booking;
				return value;
			})
		);

	// map with hidden reviews
	const reviewIds = reviews.map(r => r.reviewId);
	const hiddens = await models.BookingReviewHidden.find({ reviewId: reviewIds, hidden: true })
		.select('reviewId createdAt createdBy')
		.populate('createdBy', 'username name');
	reviews.forEach(r => {
		const hidden = hiddens.find(h => h.reviewId === r.reviewId);
		if (hidden) {
			r.hidden = hidden;
		}
	});
	return reviews;
}

async function submitReview({
	bookingId,
	reviewId,
	feedback,
	privateFb = 'Thank you for staying at tb Homes!',
	cleanliness = 5,
	communication = 5,
	respect = 5,
	recommend = true,
	submitted = true,
}) {
	const booking = await models.Booking.findById(bookingId);
	if (!booking) {
		throw new ThrowReturn('Booking not found');
	}

	const { otaInfo } = await otaHelper.getOTAFromListing(booking.otaName, booking.listingId);

	await Reviews[booking.otaName].submitReview(
		otaInfo,
		reviewId,
		feedback,
		privateFb,
		cleanliness,
		communication,
		respect,
		recommend,
		submitted
	);
}

async function hiddenReview(reviewId, value, user) {
	return await models.BookingReviewHidden.findOneAndUpdate(
		{ reviewId },
		{ $set: { reviewId, hidden: value, createdBy: user } },
		{ upsert: true, new: true }
	).then(result => models.BookingReviewHidden.populate(result, { path: 'createdBy', select: 'username name' }));
}

module.exports = {
	getBookingReview,
	getReviews,
	getRating,
	getRatingDetail,
	getGuestReview,
	submitReview,
	hiddenReview,
	getRatingAvg,
};

const mongoose = require('mongoose');
const _ = require('lodash');

const { Schema } = mongoose;

const BookingReviewSchemea = new Schema(
	{
		scores: Schema.Types.Mixed,
		rating: Number,
		comments: String,
		feedback: String,
		blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
		bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
		listingId: { type: Schema.Types.ObjectId, ref: 'Listing' },
		otaName: String,
		otaBookingId: String,
		otaId: String,
		reviewedAt: Date,
		details: {
			checkIn: String,
			checkOut: String,
			name: String,
			avatar: String,
			photos: [String],
		},
	},
	{
		timestamps: true,
	}
);

BookingReviewSchemea.index({ otaName: 1, otaId: 1 }, { unique: true });

BookingReviewSchemea.statics = {
	async updateOrCreate(review) {
		const reviewDb = await this.findOneAndUpdate(
			{
				otaName: review.otaName,
				otaId: review.otaId,
			},
			review,
			{
				upsert: true,
				new: true,
			}
		);

		return reviewDb;
	},

	async aggregateInfo({ blockIds, listingIds, otaName, highestStar = 5, from, to }) {
		const query = {};

		if (otaName) query.otaName = otaName;
		if (blockIds) {
			query.blockId = _.isArray(blockIds)
				? { $in: blockIds.toMongoObjectIds() }
				: mongoose.Types.ObjectId(blockIds);
		}
		if (listingIds) {
			query.listingId = _.isArray(listingIds)
				? { $in: listingIds.toMongoObjectIds() }
				: mongoose.Types.ObjectId(listingIds);
		}

		if (from) {
			query['details.checkOut'] = { $gte: from };
		}
		if (to) {
			if (!query['details.checkOut']) query['details.checkOut'] = { $lte: to };
			else query['details.checkOut'].$lte = to;
		}

		const rating = await this.aggregate([
			{ $match: query },
			{ $group: { _id: null, rating: { $avg: '$rating' } } },
		]);

		let stats = await this.aggregate([
			{
				$match: query,
			},
			{ $group: { _id: { $floor: '$rating' }, count: { $sum: 1 } } },
		]);
		stats = stats.reduce((acc, cur) => {
			acc[cur._id] = cur.count;
			return acc;
		}, {});

		const [total, bestReviews] = await Promise.all([
			this.countDocuments(query),
			this.countDocuments({
				...query,
				rating: highestStar,
			}),
		]);

		return {
			rating: rating.length ? rating[0].rating : 0,
			total,
			bestReviews,
			highestStar,
			stats,
			ota: otaName,
		};
	},
};

module.exports = mongoose.model('BookingReview', BookingReviewSchemea, 'booking_review');

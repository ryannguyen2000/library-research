const moment = require('moment');
const _ = require('lodash');
const mongoose = require('mongoose');

const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
const { OTAs } = require('@utils/const');
const { changeHotelSession } = require('@controllers/ota_api/headers/traveloka');

const OTAName = OTAs.Traveloka;
const pageSize = 50;
const MAX_PAGE = 50;

async function getReviews(otaConfig, context, hotelId, pageNumber = 1) {
	const body = {
		data: {
			hotelId: hotelId.toString(),
			skip: (pageNumber - 1) * pageSize,
			top: pageNumber * pageSize,
			language: 'vi',
			filterSortSpec: {
				filterType: null,
				dateRangeStart: null,
				dateRangeEnd: null,
				sortType: 'NEWEST_TIMESTAMP',
			},
		},
		context,
		auth: otaConfig.other.auth,
	};

	try {
		const result = await fetch('https://astcnt.ast.traveloka.com/api/v2/review/getHotelReviews', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Origin: 'https://tera.traveloka.com',
				Referer: 'https://tera.traveloka.com/',
			},
			timeout: 10 * 60 * 1000,
			body: JSON.stringify(body),
		});

		if (!result.ok) {
			const err = await result.text();
			logger.error(`${OTAName} get reviews error ${hotelId} ${otaConfig.account} ${err}`);
			return [];
		}

		const data = await result.json();
		const totalReview = parseInt(data.data.numReviewEntries) || 0;
		if (totalReview <= pageNumber * pageSize || pageNumber > MAX_PAGE) {
			return data.data.reviewList || [];
		}

		return [...data.data.reviewList, ...(await getReviews(otaConfig, context, hotelId, pageNumber + 1))];
	} catch (err) {
		logger.error(`${OTAName} get reviews error ${hotelId} ${err}`);
		return [];
	}
}

async function addReviews(results, blockId) {
	const Booking = mongoose.model('Booking');

	const reviews = await results.asyncMap(async rs => {
		const from = rs.bookingInfo.checkInDate && moment(rs.bookingInfo.checkInDate);
		const to = rs.bookingInfo.checkOutDate && moment(rs.bookingInfo.checkOutDate);
		let booking;

		const details = {
			name: rs.reviewerName,
			photos: rs.photoDataDisplayList && rs.photoDataDisplayList.map(p => p.photoUrl),
		};

		if (from && from.isValid() && to && to.isValid()) {
			const filterBooking = {
				otaName: OTAName,
				from: from.toDate().zeroHours(),
				to: to.toDate().zeroHours(),
			};

			const bookings = await Booking.find(filterBooking)
				.select('otaBookingId guestId')
				.populate('guestId', 'displayName');

			const reviewerName = rs.reviewerName.replace(/\s/g, '');

			booking = bookings.find(
				book =>
					book.guestId.displayName &&
					book.guestId.displayName.replace(/\s/g, '').match(new RegExp(_.escapeRegExp(reviewerName)), 'i')
			);

			details.checkIn = from.toDate();
			details.checkOut = to.toDate();
		}

		return {
			blockId,
			comments: rs.reviewText,
			feedback: '',
			otaName: OTAName,
			otaBookingId: booking && booking.otaBookingId,
			scores: {
				cleanliness: rs.cleanlinessScore ? +rs.cleanlinessScore : null,
				comfort: rs.comfortScore ? +rs.comfortScore : null,
				location: rs.locationScore ? +rs.locationScore : null,
				service: rs.serviceScore ? +rs.serviceScore : null,
				food: rs.foodScore ? +rs.foodScore : null,
			},
			rating: rs.overallScore,
			details,
			otaId: _.toString(rs.reviewId),
			reviewedAt: new Date(rs.timestamp),
		};
	});

	return _.compact(reviews);
}

async function reviewsCrawler(otaConfig) {
	const properties = await mongoose.model('Block').getPropertiesId(otaConfig.name, otaConfig.account, true);

	const reviews = [];
	for (const property of properties) {
		const { propertyId, blockId } = property;

		const context = await changeHotelSession(otaConfig, propertyId);

		const results = await getReviews(otaConfig, context, propertyId);

		const data = await addReviews(results, blockId);

		reviews.push(...data);
	}

	return reviews;
}

module.exports = {
	reviewsCrawler,
};

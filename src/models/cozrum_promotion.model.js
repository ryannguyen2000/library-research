const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const { PromotionType, RuleDay, LocalOTAs, PromotionChangeType } = require('@utils/const');

const { Schema } = mongoose;

const tbPromotionSchema = new Schema(
	{
		active: { default: true, type: Boolean },
		delete: { default: false, type: Boolean },
		type: {
			type: String,
			default: PromotionType.Basic,
			enum: Object.values(PromotionType),
		},
		name: String,
		startDate: Date,
		endDate: Date,
		dayOfWeeks: String,
		bookStartDate: Date,
		bookEndDate: Date,
		bookDayOfWeeks: String,
		discount: Number,
		discount_type: { type: String, enum: Object.values(PromotionChangeType) },
		additional_discount: Number,
		last_minute_amount: Number,
		early_booker_amount: Number,
		min_stay_through: Number,
		listingIds: [String],
		ratePlanIds: [{ type: Number, ref: 'RatePlan' }],
		ota: String,
	},
	{
		timestamps: true,
	}
);

tbPromotionSchema.methods = {
	isMatchRange(checkIn, checkOut) {
		checkIn = moment(checkIn).startOf('days').utc(7);
		checkOut = moment(checkOut).startOf('days').utc(7);

		if (moment(this.startDate).isAfter(checkOut) || moment(this.endDate).isBefore(checkIn)) {
			return false;
		}

		if (this.bookStartDate && moment().isBefore(this.bookStartDate, 'day')) {
			return false;
		}
		if (this.bookEndDate && moment().isAfter(this.bookEndDate, 'day')) {
			return false;
		}

		if (this.min_stay_through) {
			const stay = checkOut.diff(checkIn, 'days');
			if (this.min_stay_through > stay) {
				return false;
			}
		}

		return true;
	},

	isMatchDate(date) {
		date = moment(date);

		if (this.dayOfWeeks) {
			let index = date.day();
			index = index === 0 ? 6 : index - 1;
			if (this.dayOfWeeks[index] === '0') return false;
		}

		if (moment(this.startDate).isAfter(date, 'day') || moment(this.endDate).isBefore(date, 'day')) {
			return false;
		}

		if (this.bookStartDate && moment().isBefore(this.bookStartDate, 'day')) {
			return false;
		}
		if (this.bookEndDate && moment().isAfter(this.bookEndDate, 'day')) {
			return false;
		}

		if ([PromotionType.LastMinute, PromotionType.EarlyBird].includes(this.type)) {
			const [hour, minute] = RuleDay.from.split(':');
			date.set({ hour, minute, second: 0 });

			const diffMinute = date.diff(moment(), 'minute');
			if (this.type === PromotionType.LastMinute) return diffMinute <= this.last_minute_amount * 60;
			return diffMinute >= this.early_booker_amount * 60;
		}

		return true;
	},

	calcDiscountPrice(originPrice, key = 'discount') {
		if (!originPrice || !this[key]) return null;

		if (this.discount_type === PromotionChangeType.VALUE) {
			return parsePrice(originPrice - this[key]);
		}

		return parsePrice(originPrice * (1 - Math.min(this[key], 100) / 100));
	},
};

function parsePrice(number) {
	if (!number) return null;
	return Number(number / 1000).toFixed(0) * 1000;
}

tbPromotionSchema.statics = {
	// findPromotionsForListing(otaListingId, ratePlanId, ota) {
	// 	const query = {
	// 		active: true,
	// 		delete: false,
	// 		listingIds: otaListingId,
	// 		ratePlanIds: ratePlanId,
	// 	};
	// 	if (ota !== undefined) {
	// 		query.ota = ota;
	// 	}

	// 	return this.find(query);
	// },

	async findRoomRatePromotions(roomTypeId, ratePlanId) {
		const otas = _.values(LocalOTAs);

		const listings = await this.model('Listing')
			.find({
				roomTypeId,
				OTAs: {
					$elemMatch: {
						active: true,
						otaName: { $in: otas },
						'rates.ratePlanId': ratePlanId,
					},
				},
			})
			.select('OTAs')
			.lean();

		const otaListings = listings
			.map(l =>
				l.OTAs.find(
					ota =>
						ota.active && otas.includes(ota.otaName) && _.some(ota.rates, r => r.ratePlanId === ratePlanId)
				)
			)
			.filter(l => l);

		const query = {
			active: true,
			delete: false,
			listingIds: { $in: otaListings.map(l => l.otaListingId) },
			ratePlanIds: ratePlanId,
		};

		return this.find(query);
	},
};

module.exports = mongoose.model('tbPromotion', tbPromotionSchema, 'tb_promotion');

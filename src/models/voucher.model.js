const mongoose = require('mongoose');
const _ = require('lodash');
const { customAlphabet } = require('nanoid');
// const moment = require('moment');
const ThrowReturn = require('@core/throwreturn');

const nanoid = customAlphabet('0123456789', 10);

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const VoucherSchema = new Schema(
	{
		code: { type: String, required: true, unique: true, default: nanoid, minlength: 10, maxlength: 10 },
		name: { type: String },
		url: { type: String, required: true },
		body: { type: String },
		discount: { type: Number, required: true, min: 0 },
		maxDiscount: { type: Number, min: 0 },
		night: { type: Number, min: 0 },
		roomType: { type: Number },
		createdBy: { type: ObjectId, required: true, ref: 'User' },
		dateExpired: { type: Date },
		discountType: { type: String, enum: ['percent', 'value'], default: 'percent' },
		voucherType: { type: String, enum: ['service', 'room_price'] },
		otaBookingId: { type: String },
		language: { type: String },
		groupIds: [{ type: ObjectId, ref: 'UserGroup' }],
	},
	{ timestamps: true, toJSON: { virtuals: true } }
);

VoucherSchema.virtual('booking', {
	ref: 'Booking',
	localField: 'otaBookingId',
	foreignField: 'otaBookingId',
	justOne: true,
});

VoucherSchema.index({ code: 1 }, { unique: true });

VoucherSchema.statics = {
	async createCode() {
		const code = nanoid();
		const last = await this.findOne({ code });
		if (last) return this.createCode();
		return code;
	},

	async getDiscount(user, code, otaBookingId) {
		const doc = await this.findOne({ code, groupIds: { $in: user.groupIds } });
		if (!doc) throw new ThrowReturn('Code not found!');

		if (doc.dateExpired < new Date()) {
			throw new ThrowReturn('Code expired!');
		}
		if (doc.otaBookingId) {
			throw new ThrowReturn('Voucher has already used!');
		}

		const bookings = await this.model('Booking').find({ otaBookingId, groupIds: { $in: user.groupIds } });
		if (!bookings.length) throw new ThrowReturn('Booking not found!');

		if (doc.roomType) {
			const rooms = await this.model('Reservation').getReservateRooms(
				null,
				bookings.map(booking => booking._id)
			);
			const { accommodates } = await this.model('Listing').getAccommodation(rooms);
			if (doc.roomType < accommodates)
				throw new ThrowReturn(
					`Room type is not valid!.\nCurrent voucher ${doc.roomType}, current room type ${accommodates}!`
				);
		}

		let { discount } = doc;

		if (doc.discountType === 'percent') {
			const totalNight = _.sum(bookings.map(b => b.from.diffDays(b.to)));
			const totalPrice = _.sum(bookings.map(b => b.exchangePrice()));

			const pricePerNight = totalPrice / totalNight;
			discount = pricePerNight * (doc.night ? _.min([doc.night, totalNight]) : totalNight) * (doc.discount / 100);
		}

		discount = _.min([discount, doc.maxDiscount]);

		return { discount, currency: 'VND' };
	},
};

module.exports = mongoose.model('Voucher', VoucherSchema, 'voucher');

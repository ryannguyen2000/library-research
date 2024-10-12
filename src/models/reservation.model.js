const mongoose = require('mongoose');
const _ = require('lodash');

const { rangeDate } = require('@utils/date');
const ThrowReturn = require('@core/throwreturn');
const { BookingCheckinType, Currency, WATER_FEE_CALC_TYPE, EXTRA_FEE } = require('@utils/const');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const ExtraFee = _.values(EXTRA_FEE);

const DateInfo = new Schema(
	{
		date: Date,
	},
	{ _id: false }
);

const GuestInfo = new Schema(
	{
		guestId: { type: ObjectId, ref: 'Guest', required: true },
		checkin: Date,
		checkout: Date,
		checkinType: { type: String, enum: Object.values(BookingCheckinType) },
		checkoutType: { type: String, enum: Object.values(BookingCheckinType) },
	},
	{ _id: false }
);

const CardInfo = new Schema(
	{
		guestIds: [{ type: ObjectId, ref: 'Guest' }],
		cardno: String,
		lockno: String,
		coid: String,
		btime: String,
		etime: String,
		createdBy: { type: ObjectId, ref: 'User' },
		createdAt: Date,
	},
	{ _id: false }
);

const ReservationSchema = new Schema(
	{
		blockId: { type: ObjectId, ref: 'Block' },
		roomId: { type: ObjectId, ref: 'Room', required: true },
		bookingId: { type: ObjectId, ref: 'Booking', required: true },
		listingId: { type: ObjectId, ref: 'Listing' },
		otaName: String,
		guests: [GuestInfo],
		dates: [DateInfo],
		card: [CardInfo],
		price: Number,
		roomPrice: Number,
		currency: { type: String, default: Currency.VND },

		...ExtraFee.reduce((acc, cur) => ({ ...acc, [cur]: { type: Number, default: 0 } }), {}),

		previousElectricQuantity: { type: Number, default: 0 },
		currentElectricQuantity: { type: Number, default: 0 },
		electricPricePerKwh: { type: Number, default: 0 },
		previousWaterQuantity: { type: Number, default: 0 },
		waterFeeCalcType: { type: Number, enum: _.values(WATER_FEE_CALC_TYPE), default: WATER_FEE_CALC_TYPE.DEFAULT },
		currentWaterQuantity: { type: Number, default: 0 },
		waterPricePerM3: { type: Number, default: 0 },
		defaultWaterPrice: { type: Number, default: 0 },

		doorCode: String,
		doorCodeGenerated: Boolean,
		doorCodeDisabled: Boolean,
	},
	{
		timestamps: true,
		versionKey: false,
		autoIndex: false,
	}
);

ReservationSchema.index({ bookingId: 1, roomId: 1 }, { unique: true });

ReservationSchema.pre('save', function (next) {
	this.electricFee = this.calcElectricFee();
	this.waterFee = this.calcWaterFee();

	if (this.waterFeeCalcType === WATER_FEE_CALC_TYPE.DEFAULT) {
		this.previousWaterQuantity = 0;
		this.currentWaterQuantity = 0;
	}

	this.price = this.roomPrice + (_.sum(ExtraFee.map(k => _.get(this, k))) || 0);

	next();
});

ReservationSchema.methods = {
	getCheck(type = 'in') {
		return _.find(this.guests, g => _.get(g, `check${type}`));
	},

	calcElectricFee() {
		const currentElectricQuantity = this.currentElectricQuantity || 0;
		const previousElectricQuantity = this.previousElectricQuantity || 0;
		const electricPricePerKwh = this.electricPricePerKwh || 0;

		const fee = (currentElectricQuantity - previousElectricQuantity) * electricPricePerKwh;
		return fee;
	},

	calcWaterFee() {
		if (this.waterFeeCalcType === WATER_FEE_CALC_TYPE.DEFAULT) {
			return this.isNew ? this.defaultWaterPrice : this.waterFee;
		}

		if (this.waterFeeCalcType === WATER_FEE_CALC_TYPE.QUANTITY) {
			const previousWaterQuantity = this.previousWaterQuantity || 0;
			const currentWaterQuantity = this.currentWaterQuantity || 0;
			const waterPricePerM3 = this.waterPricePerM3 || 0;
			const waterFee = (currentWaterQuantity - previousWaterQuantity) * waterPricePerM3;

			return waterFee;
		}

		return this.waterFee;
	},
};

ReservationSchema.statics = {
	async clear(bookingId, roomIds, from, to, checkout) {
		if (checkout) {
			await this.updateMany(
				{ bookingId, roomId: { $in: roomIds } },
				{ $pull: { dates: { date: { $gte: from } } } }
			);
		} else {
			await this.deleteMany({ bookingId, roomId: { $in: roomIds } });
			// await this.model('Booking').updateOne({ _id: bookingId }, { $pull: { reservateRooms: { $in: roomIds } } });
		}
	},

	async checkin(bookingId, guestIds, checkinType, roomId, cardInfo) {
		const reservations = await this.find({ bookingId });
		if (!reservations.length) throw new ThrowReturn('Booking not found!');

		const gIds = _.isArray(guestIds) ? guestIds : [guestIds];

		let reservation = reservations.find(r => r.guests.find(g => gIds.some(gId => g.guestId.equals(gId))));

		if (reservation) {
			if (roomId && !reservation.roomId.equals(roomId)) {
				throw new ThrowReturn('Guest is in another room!');
			}
			const guests = reservation.guests.filter(g => gIds.some(gId => g.guestId.equals(gId)));
			if (guests.some(g => g.checkin)) throw new ThrowReturn('Guest already checkin!');

			guests.forEach(guest => {
				guest.checkin = new Date();
				if (checkinType) guest.checkinType = checkinType;
			});
		} else {
			reservation = roomId ? reservations.find(r => r.roomId.equals(roomId)) : reservations[0];
			if (!reservation) throw new ThrowReturn(`Room ${roomId} not found!`);

			reservation.guests.push(...gIds.map(guestId => _.pickBy({ guestId, checkin: new Date(), checkinType })));
		}

		if (!_.isEmpty(cardInfo)) {
			reservation.card.push(cardInfo);
		}

		await reservation.save();

		return reservation;
	},

	async checkout(bookingId, guestIds, checkoutType) {
		const gIds = _.isArray(guestIds) ? guestIds : [guestIds];

		const reservation = await this.findOne({
			bookingId,
			guests: { $elemMatch: { guestId: { $in: gIds } } },
		});

		const guests = _.filter(reservation && reservation.guests, g => gIds.some(gId => g.guestId.equals(gId)));

		if (!guests.length) {
			throw new ThrowReturn('Guest is not in any room');
		}
		if (guests.some(g => !g.checkin)) {
			throw new ThrowReturn('Guest has not been checked in');
		}
		if (guests.some(g => g.checkout)) {
			throw new ThrowReturn('Already checkout');
		}

		guests.forEach(guest => {
			guest.checkout = new Date();
			if (checkoutType) guest.checkoutType = checkoutType;
		});

		await reservation.save();
	},

	async add(bookingId, blockId, roomIds, from, to, roomsPrice) {
		if (!roomIds.length) return;

		const dates = rangeDate(from, to, false).toArray();

		await roomIds.asyncMap(roomId => {
			const prevData = _.find(roomsPrice, r => _.toString(r.roomId) === _.toString(roomId)) || {};

			const setOnInsert = {
				...ExtraFee.filter(k => !_.has(prevData, k)).reduce((acc, cur) => ({ ...acc, [cur]: 0 }), {}),
			};
			if (!_.has(prevData, 'price')) {
				setOnInsert.price = 0;
			}
			if (!_.has(prevData, 'roomPrice')) {
				setOnInsert.roomPrice = 0;
			}

			return this.findOneAndUpdate(
				{ roomId, bookingId },
				{
					$set: {
						blockId,
						dates: dates.map(date => ({ date })),
						...prevData,
					},
					$setOnInsert: setOnInsert,
				},
				{ upsert: true }
			);
		});

		await this.model('Booking').updateOne(
			{ _id: bookingId },
			{ $addToSet: { reservateRooms: { $each: roomIds.toMongoObjectIds() } } }
		);
	},

	async initPricing({ bookingId }) {
		const booking = await this.model('Booking').findById(bookingId);
		const reservations = await this.find({ bookingId });

		const _sum = _.sumBy(reservations, 'price');
		const mix = booking.currency === Currency.VND ? reservations.length : reservations.length / 10;

		if (booking.price < _sum - mix || booking.price > _sum + mix || reservations.some(r => !_.isNumber(r.price))) {
			const totalRoom = reservations.length;
			const sumRes = {};

			reservations.forEach((reservation, index) => {
				const prices = {};
				const info = {};
				const isLast = totalRoom === index + 1;

				[
					'previousElectricQuantity',
					'currentElectricQuantity',
					'electricPricePerKwh',
					'previousWaterQuantity',
					'waterFeeCalcType',
					'currentWaterQuantity',
					'waterPricePerM3',
					'defaultWaterPrice',
				].forEach(k => {
					info[k] = booking[k];
				});

				['roomPrice', ...ExtraFee].forEach(k => {
					sumRes[k] = sumRes[k] || 0;
					prices[k] = isLast
						? booking[k] - sumRes[k]
						: _.round((booking[k] || 0) / totalRoom, booking.currency === Currency.VND ? 0 : 2);
					sumRes[k] += prices[k];
				});

				_.assign(reservation, { ...prices, ...info }, { currency: booking.currency });
			});

			await reservations.asyncMap(reservation => reservation.save());
		}
	},

	getReservateRooms(blockId, bookingId) {
		const filter = { bookingId: Array.isArray(bookingId) ? { $in: bookingId } : bookingId };
		if (blockId) {
			filter.blockId = Array.isArray(blockId) ? { $in: blockId } : blockId;
		}
		return this.find(filter)
			.select('roomId')
			.then(rs => rs.map(res => res.roomId));
	},

	async getReservatedRoomsDetails(bookingId, showRelative = true) {
		const bookingIds = [bookingId];

		if (showRelative) {
			const booking = await this.model('Booking').findById(bookingId).select('relativeBookings');
			bookingIds.push(...(booking.relativeBookings || []));
		}

		const rooms = await this.find({ bookingId: bookingIds })
			.select('-__v -updatedAt -createdAt')
			.populate('roomId', 'info.roomNo info.name info.images info.wifi info.wifiPassword lockRoom')
			.lean();

		const rs = rooms.map(room => {
			room.roomId.info.images = room.roomId.info.images.slice(0, 1);
			return {
				...room,
				...room.roomId,
				roomId: undefined,
			};
		});

		return rs;
	},

	async getRooms(query) {
		const rooms = await this.aggregate([
			{
				$match: query,
			},
			{
				$project: {
					roomId: 1,
					bookingId: 1,
				},
			},
		]);
		await this.populate(rooms, {
			path: 'roomId',
			select: 'info.name info.roomNo',
		});
		return _.groupBy(rooms, 'bookingId');
	},
};

module.exports = mongoose.model('Reservation', ReservationSchema, 'reservation');

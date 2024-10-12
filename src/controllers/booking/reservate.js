const _ = require('lodash');
const moment = require('moment');

const {
	BookingStatus,
	LocalOTA,
	LocalOTAs,
	Currency,
	BookingLogs,
	Services,
	ROOM_GROUP_TYPES,
	OTAs,
} = require('@utils/const');
const { genBookingCode } = require('@utils/generate');
const { chunkMonthRanges, roundTime } = require('@utils/date');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const Reservation = require('@controllers/booking/reservation');
const { getPromotionPrice } = require('@controllers/promotion/promotion.config');
const guests = require('@controllers/guest');

async function reservateMonth(body, user) {
	const { calcType, from, months, to, relativeBookingId, images, note, deposit, autoExtend, ...data } = body;
	const _to = to || moment(from).add(1, 'month').toDate().maxTimes();
	const cTo = months ? moment(from).add(months, 'month').add(-1, 'day').toDate().maxTimes() : _to;

	const ranges = chunkMonthRanges(from, cTo, calcType, months);

	let groupIds;
	data.localOTA = true;
	data.currency = data.currency || Currency.VND;
	data.otaName = data.otaName || LocalOTA;
	_.unset(data, 'otaBookingId');

	const source = await models.BookingSource.findOne({ name: data.otaName });
	if (!source) {
		throw new ThrowReturn('Source Not Found!');
	}

	if (!data.guestId) {
		if (user) {
			groupIds = user.groupIds;
		} else {
			const block = await models.Block.findById(data.blockId).select('groupIds');
			groupIds = block.groupIds;
		}

		const guest = await models.Guest.findGuest({ ...data.guest, groupIds });
		data.guestId = guest._id;
	}

	await ranges.asyncForEach(async range => {
		const rooms = await models.BlockScheduler.findAvailableRooms(data.rooms, data.blockId, range.from, range.to);
		if (!rooms || rooms.length < data.rooms.length) {
			throw new ThrowReturn('Rooms not available');
		}
	});

	const bookingIds = [];
	await ranges.asyncForEach(async range => {
		const otaBookingId = await genBookingCode();
		const daysInMonth = moment(range.from).daysInMonth();
		const totalDaysLiving = moment.duration(moment(range.to).diff(moment(range.from))).asDays();
		const roomPrice = data.price ? Math.round((data.price / daysInMonth) * totalDaysLiving) : 0;

		const { booking } = await Reservation.confirmReservation({
			...data,
			from: range.from,
			to: range.to,
			otaBookingId,
			ignoreFinance: source.ignoreFinance,
			roomPrice,
		});

		const bookingId = booking._id;
		groupIds = groupIds || booking.groupIds;
		models.Booking.addLog({
			bookingId,
			userId: _.get(user, '_id'),
			action: BookingLogs.BOOKING_CREATE,
		});
		bookingIds.push(bookingId);
	});

	if (bookingIds.length) {
		const relativeBook =
			relativeBookingId &&
			(await models.Booking.findOne({
				otaBookingId: relativeBookingId,
				otaName: data.otaName,
			}));

		if (relativeBook) {
			await models.BookingContract.updateOne(
				{
					bookingIds: relativeBook._id,
				},
				{
					$addToSet: {
						bookingIds: { $each: bookingIds },
					},
				}
			);
		} else {
			const contract = await models.BookingContract.create({
				bookingIds,
				startDate: from,
				endDate: new Date(cTo).zeroHours(),
				images,
				note,
				deposit,
				calcType,
				groupIds,
				autoExtend: to ? autoExtend : true,
				...data,
			});

			models.BookingContract.addLog({
				contractId: contract._id,
				userId: user._id,
				action: 'CONTRACT_CREATED',
				data: 'confirmed',
				system: !!user._id,
			});

			await bookingIds.asyncForEach(async booking => {
				await guests.addGuestToBookingRoom(booking, data.rooms[0], data.guestId);
			});
		}
	}

	return bookingIds;
}

function mergeRates(roomPrices) {
	const rates = [];

	_.forEach(roomPrices, p => {
		_.forEach(p.rates, rate => {
			const current = rates.find(r => r.date === rate.date);
			if (current) {
				current.price += rate.price;
			} else {
				rates.push({ ...rate });
			}
		});
	});

	return rates;
}

async function reservate(data, user) {
	let options = null;

	let ratePlan = data.ratePlanId
		? await models.RatePlan.findOne({
			_id: data.ratePlanId,
			active: true,
		})
		: await models.RatePlan.findDefaultRatePlan({
			serviceType: data.serviceType,
		});

	if (data.ratePlanId && !ratePlan) {
		throw new ThrowReturn('Not found RatePlan');
	}

	if (!ratePlan) {
		ratePlan = await models.RatePlan.findDefaultRatePlan();
	}

	data.ratePlanId = ratePlan._id;

	if (data.serviceType === Services.Hour) {
		if (!data.fromHour || !data.toHour) throw new ThrowReturn('From or to invalid');

		data.fromHour = roundTime(data.fromHour);
		data.toHour = roundTime(data.toHour);

		const { error, msg } = ratePlan.validateHoursReservation(data.fromHour, data.toHour);

		if (error) throw new ThrowReturn(msg);

		if (!data.expectCheckIn) data.expectCheckIn = data.fromHour;
		if (!data.expectCheckOut) data.expectCheckOut = data.toHour;

		data.to = moment(data.from).add(1, 'd').format('YYYY-MM-DD');
		options = {
			fromHour: data.fromHour,
			toHour: data.toHour,
		};
	} else if (data.serviceType === Services.Night) {
		data.to = moment(data.from).add(1, 'd').format('YYYY-MM-DD');

		const rules = await models.Block.getRules(data.blockId);

		options = {
			checkin: rules.night.checkin,
			checkout: rules.night.checkout,
		};

		data.fromHour = rules.night.checkin;
		data.toHour = rules.night.checkout;
		if (!data.expectCheckIn) data.expectCheckIn = data.fromHour;
		if (!data.expectCheckOut) data.expectCheckOut = data.toHour;
	}

	const rooms = await models.BlockScheduler.findAvailableRooms(
		data.rooms,
		data.blockId,
		new Date(data.from),
		new Date(data.to),
		options
	);

	if (!rooms || rooms.length < data.rooms.length) {
		throw new ThrowReturn('Rooms not available', rooms);
	}

	data.localOTA = true;
	data.currency = data.currency || Currency.VND;
	data.otaName = data.otaName || LocalOTA;

	const source = await models.BookingSource.findOne({ name: data.otaName });
	if (!source) {
		throw new ThrowReturn('Source Not Found!');
	}

	data.ignoreFinance = source.ignoreFinance;

	data.otaBookingId = _.trim(data.otaBookingId);
	if (data.otaBookingId) {
		if (
			await models.Booking.findOne({
				otaBookingId: data.otaBookingId,
				otaName: data.otaName,
			})
		)
			throw new ThrowReturn(`Booking ${data.otaBookingId} already exists!`);
	} else {
		data.otaBookingId = await genBookingCode();
	}

	const roomIds = data.rooms.toMongoObjectIds();

	const roomTypes = await models.RoomType.find({
		deleted: false,
		type: ROOM_GROUP_TYPES.DEFAULT,
		blockId: data.blockId,
		roomIds: { $in: roomIds },
	}).lean();
	const priceParams = {
		blockId: data.blockId,
		checkIn: new Date(data.from),
		checkOut: new Date(data.to),
		ratePlanId: data.ratePlanId,
		...options,
	};

	const roomPrices = await roomTypes.asyncMap(async roomType => {
		const currentRoomIds = roomIds.filter(rId => roomType.roomIds.includesObjectId(rId));

		let roomPrice = await getPromotionPrice({
			...priceParams,
			roomTypeId: roomType._id,
		});
		if (!roomPrice.defaultPrice) {
			const virtualRoomType = await models.RoomType.findOne({
				deleted: false,
				type: ROOM_GROUP_TYPES.VIRTUAL,
				blockId: roomType.blockId,
				roomIds: { $in: currentRoomIds },
			})
				.select('_id')
				.lean();

			if (virtualRoomType) {
				roomPrice = await getPromotionPrice({
					...priceParams,
					roomTypeId: virtualRoomType._id,
				});
			}
		}

		const price = roomPrice.promoPrice || roomPrice.defaultPrice;

		return currentRoomIds.map(roomId => {
			return {
				roomId,
				price,
				roomPrice: price,
				rates: roomPrice.rates,
			};
		});
	});

	data.roomPrices = _.flatten(roomPrices);
	data.roomPrice = _.sumBy(data.roomPrices, 'roomPrice');
	data.rates = mergeRates(data.roomPrices);

	if (data.otaName === LocalOTAs.tbExtend || data.otaName === OTAs.OwnerExtend) {
		data.extendFrom = _.trim(data.extendFrom);
		if (data.extendFrom) {
			const prevBooking = await models.Booking.findOne({
				status: BookingStatus.CONFIRMED,
				otaBookingId: data.extendFrom,
			})
				.sort({ to: -1 })
				.select('guestId guestIds');

			if (prevBooking) {
				data.guestId = prevBooking.guestId;
				data.guestIds = prevBooking.guestIds;
			}
		}
	}

	const reservatedData = await Reservation.confirmReservation(data);

	const bookingId = reservatedData.booking._id;
	if (bookingId) {
		if (data.relativeBookingId) {
			const relativeBook = await models.Booking.findOne({
				otaBookingId: data.relativeBookingId,
				otaName: data.otaName,
			});
			if (relativeBook) {
				await models.BookingContract.updateOne(
					{
						bookingIds: relativeBook._id,
					},
					{
						$addToSet: {
							bookingIds: bookingId,
						},
					}
				);
			}
		}
		await models.Booking.addLog({
			bookingId,
			userId: user._id,
			action: BookingLogs.BOOKING_CREATE,
		});
	}

	return reservatedData;
}

module.exports = { reservate, reservateMonth };

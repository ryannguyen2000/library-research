const moment = require('moment');
const mongoose = require('mongoose');
const _ = require('lodash');

const {
	BookingStatus,
	Errors,
	BookingLogs,
	LocalOTAs,
	BookingStatusCanceled,
	Currency,
	CanceledByType,
	BookingGuideStatus,
	BookingGuideDoneStatus,
	Services,
	RuleDay,
} = require('@utils/const');
const { ReservateCalendarLock } = require('@utils/lock');
const { eventEmitter, EVENTS } = require('@utils/events');
const { logger } = require('@utils/logger');
const { rangeDate, roundTime } = require('@utils/date');

const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { updateCode } = require('@controllers/lock');
const { getPromotionPrice } = require('@controllers/promotion/promotion.config');
const optimizer = require('@controllers/optimizer');
const { sendEmailConfirmationOTA } = require('@services/email');

async function writeLog({
	bookingId,
	userId,
	from,
	to,
	newFrom,
	newTo,
	roomIds,
	newRoomIds,
	blockId,
	newBlockId,
	description,
}) {
	try {
		const logs = {
			bookingId,
			userId,
			description,
		};

		if (from && from.getTime() !== newFrom.getTime()) {
			await models.Booking.addLog({
				...logs,
				action: BookingLogs.BOOKING_UPDATE_CHECKIN,
				prevData: moment(from).format('DD/MM/Y'),
				data: moment(newFrom).format('DD/MM/Y'),
			});
		}
		if (to && to.getTime() !== newTo.getTime()) {
			await models.Booking.addLog({
				...logs,
				action: BookingLogs.BOOKING_UPDATE_CHECKOUT,
				prevData: moment(to).format('DD/MM/Y'),
				data: moment(newTo).format('DD/MM/Y'),
			});
		}
		if (blockId && newBlockId && blockId.toString() !== newBlockId.toString()) {
			const block = await models.Block.findById(blockId).select('info.name info.shortName');
			const newBlock = await models.Block.findById(newBlockId).select('info.name info.shortName');

			await models.Booking.addLog({
				...logs,
				action: BookingLogs.BOOKING_UPDATE_HOME,
				prevData: _.head(_.get(block, 'info.shortName')) || _.get(block, 'info.name') || blockId,
				data: _.head(_.get(newBlock, 'info.shortName')) || _.get(newBlock, 'info.name') || newBlockId,
			});
		}
		if (roomIds || newRoomIds) {
			const firstRoomNames = await models.Room.getRoomNos(roomIds);
			const toRoomNames = await models.Room.getRoomNos(newRoomIds);
			if (firstRoomNames !== toRoomNames) {
				await models.Booking.addLog({
					...logs,
					action: BookingLogs.BOOKING_UPDATE_ROOM,
					prevData: firstRoomNames,
					data: toRoomNames,
				});
			}
		}
	} catch (err) {
		logger.error(err);
	}
}

/**
 * Change reservation dates and rooms
 * @param {string} booking
 * @param {Array} firstRooms if null, retrieve current rooms
 * @param {Array} changeToRoomIds if null, retrieve current available rooms
 * @param {number} newRoomSize if null keep previous room size
 * @param {Date} newCheckIn
 * @param {Date} newCheckOut
 * @param {string} userId
 */
async function changeBooking({
	booking,
	firstRooms,
	changeToRoomIds,
	changeToBlockId,
	newRoomSize,
	newCheckIn,
	newCheckOut,
	newFromHour,
	newToHour,
	userId,
} = {}) {
	const firstCheckIn = new Date(booking.from);
	const firstCheckOut = new Date(booking.to);
	const oldBlockId = booking.blockId;
	changeToBlockId = changeToBlockId || booking.blockId;

	// validate fromHour and toHour
	if (booking.serviceType === Services.Hour && newFromHour && newToHour) {
		const curHourQuantity = moment(booking.toHour, 'HH:mm').diff(moment(booking.fromHour, 'HH:mm'), 'minutes');
		const newHourQuantity = moment(newToHour, 'HH:mm').diff(moment(newFromHour, 'HH:mm'), 'minutes');
		if (curHourQuantity !== newHourQuantity) {
			const block = await models.Block.findById(changeToBlockId);
			const { error, msg } = block.validateHourReservation(
				roundTime(newFromHour),
				roundTime(newToHour),
				Services.Hour
			);
			if (error) throw new ThrowReturn(msg);
		}
	}

	firstRooms = firstRooms || (await models.Reservation.getReservateRooms(booking.blockId, booking._id));

	const changedRooms = await ReservateCalendarLock.acquire(_.toString(changeToBlockId), async () => {
		const options =
			booking.serviceType === Services.Hour
				? {
						fromHour: roundTime(newFromHour || booking.fromHour),
						toHour: roundTime(newToHour || booking.toHour),
				  }
				: {
						checkin: newFromHour || booking.fromHour,
						checkout: newToHour || booking.toHour,
				  };

		if (!changeToRoomIds) {
			if (newRoomSize) {
				const listing = await booking.listingModel();
				if (!listing || !listing.roomIds || !listing.roomIds.length) {
					throw new ThrowReturn('Can not find available rooms');
				}
				const roomIds = _.uniqBy([...firstRooms, ...listing.roomIds], _.toString);

				const availableRoomIds = await models.BlockScheduler.findAvailableRooms(
					roomIds,
					changeToBlockId,
					newCheckIn,
					newCheckOut,
					{
						...options,
						excludeBookingIds: [booking._id],
					}
				);

				if (availableRoomIds.length < newRoomSize) {
					throw new ThrowReturn().error_code(Errors.RoomNotAvailable);
				}

				changeToRoomIds = _.take(availableRoomIds, newRoomSize);
			} else {
				changeToRoomIds = firstRooms;
			}
		} else {
			const availableRoomIds = await models.BlockScheduler.findAvailableRooms(
				changeToRoomIds,
				changeToBlockId,
				newCheckIn,
				newCheckOut,
				{
					...options,
					excludeBookingIds: [booking._id],
				}
			);
			if (availableRoomIds.length < changeToRoomIds.length) {
				throw new ThrowReturn().error_code(Errors.RoomNotAvailable);
			}
		}

		return changeReservatedDate({
			booking,
			roomIds: firstRooms,
			changeToRoomIds,
			from: newCheckIn,
			to: newCheckOut,
			changeToBlockId,
			userId,
			fromHour: newFromHour || booking.fromHour,
			toHour: newToHour || booking.toHour,
			...options,
		});
	});

	if (booking.status === BookingStatus.CONFIRMED || booking.status === BookingStatus.NOSHOW) {
		if (!changedRooms || changedRooms.length === 0) {
			throw new ThrowReturn().error_code(Errors.RoomNotAvailable);
		}
	}

	// update booking room length
	const rooms = await models.Reservation.getReservateRooms(booking.blockId, booking._id);
	booking.amount = rooms.length;
	await booking.save();

	writeLog({
		bookingId: booking._id,
		userId,
		from: firstCheckIn,
		to: firstCheckOut,
		newFrom: newCheckIn,
		newTo: newCheckOut,
		roomIds: firstRooms,
		newRoomIds: changedRooms,
		blockId: oldBlockId,
		newBlockId: booking.blockId,
	});

	return { rooms: changedRooms, booking };
}

async function changeOTABookingDate(booking, newData) {
	let { from, to, fromHour, toHour, newRoomSize, noRel } = newData;

	fromHour = fromHour && roundTime(fromHour);
	toHour = toHour && roundTime(toHour);
	from = new Date(from);
	to = booking.serviceType === Services.Hour ? moment(to).add(1, 'd').toDate() : new Date(to);

	const bookings = noRel
		? [booking]
		: [booking, ...(await booking.getRelativeBookings())].filter(book => !book.manual);

	await bookings.asyncForEach(async book => {
		try {
			await changeBooking({
				booking: book,
				newRoomSize,
				newCheckIn: from,
				newCheckOut: to,
				newFromHour: fromHour,
				newToHour: toHour,
			});
		} catch (err) {
			logger.error('changeOTABookingDate -> err', err);

			if (err.code === Errors.RoomNotAvailable) {
				// clear reservated room
				await models.BlockScheduler.clearReservations({
					bookingId: book._id,
					blockId: book.blockId,
					from: book.from,
					to: book.to,
				});

				// set error booking
				book.from = from;
				book.to = to;
				if (fromHour) book.fromHour = fromHour;
				if (toHour) book.toHour = toHour;
				await book.errorCode(err.code);
			}
		}
	});
}

async function changeBookingDate(booking, data) {
	let { from, to, roomIds, changeToRoomIds, newRoomSize, userId, autoUpdatePrice } = data;

	if (BookingStatusCanceled.includes(booking.status)) {
		throw new ThrowReturn('Booking not found or already cancelled!');
	}
	if (booking.status === BookingStatus.REQUEST && !_.values(LocalOTAs).includes(booking.otaName)) {
		throw new ThrowReturn('Booking has not been confirmed!');
	}

	const blockId = data.blockId || booking.blockId;

	if (booking.serviceType === Services.Day && (!from || !to)) throw new ThrowReturn('Missing from or to params');
	if (booking.serviceType === Services.Hour && !from) throw new ThrowReturn('Missing from params');

	to = to || new Date(booking.to);
	const fromDate = new Date(from);
	const toDate = booking.serviceType === Services.Hour ? moment(fromDate).add(1, 'd').toDate() : new Date(to);

	const priceData =
		autoUpdatePrice && changeToRoomIds
			? await reCalcBookingPrice({
					booking,
					blockId,
					roomIds: changeToRoomIds,
					fromDate,
					toDate,
					fromHour: data.fromHour || booking.fromHour,
					toHour: data.toHour || booking.toHour,
			  })
			: null;

	if (roomIds && roomIds.length) {
		const reservations = await models.Reservation.find({
			bookingId: booking._id,
			roomId: { $nin: roomIds.toMongoObjectIds() },
		}).select('roomId');

		const otherRoomIds = _.map(reservations, 'roomId');
		roomIds = [...otherRoomIds, ...roomIds];
		changeToRoomIds = [...otherRoomIds, ...changeToRoomIds];
	}

	await changeBooking({
		booking,
		firstRooms: roomIds,
		changeToRoomIds,
		changeToBlockId: blockId,
		newRoomSize,
		newCheckIn: fromDate,
		newCheckOut: toDate,
		newFromHour: data.fromHour,
		newToHour: data.toHour,
		userId,
	});

	if (priceData && priceData.diffPrice) {
		const { roomPrice, currency } = booking;
		const newPrice = _.round(roomPrice + priceData.diffPrice);

		booking.roomPrice = newPrice;
		await booking.save();

		models.Booking.addLog({
			bookingId: booking._id,
			userId,
			action: BookingLogs.PRICE_UPDATE_AUTO,
			prevData: `${roomPrice} ${currency}`,
			data: `${newPrice} ${currency}`,
		});
	}

	// resolve error
	if (booking.error) {
		booking.error = 0;
		await booking.save();

		const guest = await models.Guest.findById(booking.guestId);
		eventEmitter.emit(EVENTS.RESERVATION, booking, guest, changeToRoomIds);
	}
}

async function reCalcBookingPrice({ booking, blockId, roomIds, fromDate, toDate, fromHour, toHour }) {
	roomIds = roomIds.map(id => mongoose.Types.ObjectId(id));

	const listings = await models.Listing.getLocalListings({ roomIds });
	const isHourService = booking.serviceType === Services.Hour;

	let exchange;
	if (booking.currency === Currency.USD) {
		exchange = await models.Setting.currencyExchange();
	}

	const exchangeFunc = val => {
		if (booking.currency === Currency.USD) {
			val = Math.ceil((val / exchange.value) * 100) / 100;
		}
		return val;
	};

	const dates = rangeDate(fromDate, toDate, false).toArray();

	const prices = {};

	await dates.asyncMap(async (date, idx) => {
		const checkIn = date;
		const checkOut = dates[idx + 1] || moment(checkIn).add(1, 'day').toDate();

		const listingPrice = await listings.asyncMap(async listing => {
			const { promoPrice, priceAdditionalHour } = await getPromotionPrice({
				blockId: blockId || booking.blockId,
				// roomIds: listing.roomIds,
				checkIn,
				checkOut,
				otaListingId: listing.ota.otaListingId,
				numRoom: booking.amount,
				fromHour,
				toHour,
				// serviceType: booking.serviceType,
				roomTypeId: listing.roomTypeId,
				ratePlanId: _.get(booking.rate, 'id'),
			});

			return listing.roomIds.map(roomId => ({
				listingId: listing._id,
				roomId,
				price: exchangeFunc(promoPrice),
				priceAdditionalHour,
			}));
		});

		prices[date.toDateMysqlFormat()] = _.flatten(listingPrice);
	});

	let newRoomPrice = 0;

	if (isHourService) {
		const hours = moment(booking.toHour, 'HH:mm').diff(moment(booking.fromHour, 'HH:mm'), 'hours');
		const newHours = moment(toHour, 'HH:mm').diff(moment(fromHour, 'HH:mm'), 'hours');
		const oldPricePerHour = booking.roomPrice / hours;
		const extRange = newHours - hours;
		const isExtendRange = extRange > 0;

		if (isExtendRange) {
			const priceAdditionalHour = prices[booking.from.toDateMysqlFormat()].reduce(
				(sum, l) => sum + (l.priceAdditionalHour || 0),
				0
			);
			newRoomPrice = oldPricePerHour * hours + priceAdditionalHour * extRange;
		} else {
			newRoomPrice = oldPricePerHour * newHours;
		}
	} else {
		const pricePerNight = booking.roomPrice / booking.to.diffDays(booking.from);
		const oldPrices = rangeDate(booking.from, booking.to, false)
			.toArray()
			.reduce((obj, date) => {
				obj[date.toDateMysqlFormat()] = pricePerNight;
				return obj;
			}, {});

		Object.keys(prices).forEach(date => {
			if (oldPrices[date] && !isHourService) {
				const p = oldPrices[date] / prices[date].length;
				prices[date].forEach(l => {
					l.price = p;
				});
			}

			newRoomPrice += prices[date].reduce((sum, l) => sum + l.price, 0);
		});
	}

	newRoomPrice = _.round(newRoomPrice);

	const diffPrice = newRoomPrice - booking.roomPrice;

	return {
		currentRoomPrice: booking.roomPrice,
		newRoomPrice,
		diffPrice,
		prices,
	};
}

async function changeListing(bookings, otaListings) {
	// const bookings = await models.Booking.find({
	// 	otaName,
	// 	otaBookingId,
	// 	status: BookingStatus.CONFIRMED,
	// });

	bookings = bookings.filter(b => b.status === BookingStatus.CONFIRMED);

	if (!bookings.length || bookings.some(booking => booking.manual)) {
		return;
	}

	const { otaName, otaBookingId } = bookings[0];

	const listings = await models.Listing.find({
		OTAs: {
			$elemMatch: {
				otaName,
				active: true,
				otaListingId: { $in: otaListings.map(ol => ol.id.toString()) },
			},
		},
	}).select('_id OTAs');
	if (!listings.length) return;

	const listingData = listings.map(listing => ({
		otaListingId: listing.getOTA(otaName).otaListingId,
		_id: listing._id,
	}));

	const cancelled = bookings
		.filter(b => b.listingId && !listingData.some(l => l._id.equals(b.listingId)))
		.map(b => b._id);

	if (cancelled.length) {
		// cancel
		await Promise.all(
			cancelled.map(id => cancelReservation({ reservation: { bookingId: id }, fullCancelled: false }))
		);
		// update relative
		await models.Booking.updateRelativeBookings(otaName, otaBookingId);
		// delete canceled
		// await Promise.all(cancelled.map(id => models.Booking.findByIdAndRemove(id)));
	}

	// change room size
	await bookings.asyncForEach(booking => {
		const listing = listingData.find(l => l._id.equals(booking.listingId));
		const otaListing = listing && otaListings.find(ol => ol.id.toString() === listing.otaListingId);

		if (otaListing && otaListing.amount !== booking.amount) {
			logger.warn(
				`${otaName} crawler change room ${booking._id} - ${booking.listingId}
				Room size ${booking.amount} -> ${otaListing.amount}
				Listing: ${otaListing}`
			);

			return changeOTABookingDate(booking, {
				from: booking.from,
				to: booking.to,
				newRoomSize: otaListing.amount,
				noRel: true,
			});
		}
	});
}

async function reservateBookingRooms(booking, rooms, roomsPrice) {
	const options =
		booking.serviceType === Services.Hour
			? {
					fromHour: booking.fromHour,
					toHour: booking.toHour,
					roomsPrice,
			  }
			: {
					roomsPrice,
					checkin: booking.fromHour,
					checkout: booking.toHour,
			  };

	const availableRooms = await models.BlockScheduler.findAvailableRooms(
		rooms,
		booking.blockId,
		booking.from,
		booking.to,
		options
	);
	if (availableRooms.length < booking.amount) {
		await booking.errorCode(Errors.RoomNotAvailable);

		const description = `${booking.amount} room${booking.amount > 1 ? 's' : ''}${
			booking.listingId ? `, listing ${booking.listingId}` : ''
		}`;
		models.Booking.addLog({
			bookingId: booking._id,
			action: BookingLogs.BOOKING_OVERBOOK,
			data: description,
		});

		const schedulers = await models.BlockScheduler.find({
			blockId: booking.blockId,
			date: { $gte: booking.from, $lt: booking.to },
		}).lean();
		const swaps = booking.listingId && (await optimizer.rearrangeBooking(booking.listingId, booking));
		models.Overbook.create({
			bookingId: booking._id,
			booking,
			schedulers,
			canAutoResolve: !!swaps,
			swaps,
		}).catch(e => {
			logger.error(e);
		});

		if (swaps && models.Setting.isAutoResolveOverbook()) {
			return await arrangeReservations(swaps);
		}

		throw new ThrowReturn('Room not available!').error_code(Errors.RoomNotAvailable);
	}

	// reservate first rooms
	const selectRooms = availableRooms.slice(0, booking.amount);
	await models.BlockScheduler.reservateRooms(
		booking._id,
		booking.blockId,
		selectRooms,
		booking.from,
		booking.to,
		options
	);

	return selectRooms;
}

async function reservateBooking(booking, rooms, roomsPrice) {
	if (booking.status === BookingStatus.CANCELED) {
		throw new ThrowReturn('Booking already canceled');
	}
	if (!rooms || !rooms.length) {
		const listing = await booking.listingModel();
		rooms = listing.roomIds;
	} else {
		const inactiveRoom = await models.Room.findOne({ _id: rooms, isSelling: false }).select('_id');
		if (inactiveRoom) {
			throw new ThrowReturn('There is at least one room that is not activated!');
		}
	}
	if (!rooms || !rooms.length) {
		throw new ThrowReturn('Room not availables');
	}

	const selectRooms = await ReservateCalendarLock.acquire(booking.blockId.toString(), () =>
		reservateBookingRooms(booking, rooms, roomsPrice)
	);

	// auto add guest to room
	const guestIds = _.compact([booking.guestId, ...(booking.guestIds || [])]).map(guestId => ({ guestId }));
	if (guestIds.length) {
		await models.Reservation.updateOne(
			{ bookingId: booking._id },
			{
				$addToSet: {
					guests: { $each: guestIds },
				},
			}
		);
	}

	return selectRooms;
}

async function findOrCreateGuest(guestId, guest) {
	if (guestId) {
		const oldGuest = await models.Guest.findById(guestId);
		if (oldGuest) {
			let isUpdated = false;

			_.forEach(guest, (v, k) => {
				if (v && !oldGuest[k]) {
					isUpdated = true;
					oldGuest[k] = v;
				}
			});

			if (isUpdated) {
				await oldGuest.save();
			}

			return oldGuest;
		}
	}

	return models.Guest.findGuest(guest, false, true);
}

async function confirmReservation(reservation, forceNew) {
	reservation.from = new Date(reservation.from).zeroHours();
	reservation.to = new Date(reservation.to).zeroHours();
	reservation.numberAdults = 1;

	if (reservation.from >= reservation.to && reservation.serviceType !== Services.Hour) {
		throw new ThrowReturn('Check out date must greater than check in date');
	}
	if (!reservation.guest && !reservation.guestId) {
		throw new ThrowReturn('Guest cannot be empty');
	}
	if (reservation.messages) {
		reservation.threadId = reservation.messages;
	}
	if (!reservation.threadId && !_.get(reservation.thread, 'id')) {
		reservation.thread = { id: reservation.otaBookingId };
	}

	const reservateRooms = reservation.rooms;

	if (!reservation.blockId) {
		const listing = reservation.listingId
			? await models.Listing.findById(reservation.listingId)
			: await models.Listing.findListingByOTA(reservation.otaName, reservation.otaListingId);

		if (!listing) {
			throw new ThrowReturn(
				`Listing not found ${reservation.otaName} - ${reservation.otaListingId} - ${reservation.otaBookingId}`
			).error_code(404);
		}

		reservation.blockId = listing.blockId;
		reservation.listingId = listing._id;

		if (reservation.status !== BookingStatus.CANCELED) {
			if (!reservation.ratePlanId && (reservation.otaRateId || reservation.otaRateName)) {
				const otaListing = listing.getOTA(reservation.otaName);

				if (reservation.otaRateId) {
					reservation.otaRateId = _.toString(reservation.otaRateId);
					let rate = otaListing.rates.find(r => r.rateId === reservation.otaRateId);

					if (!rate && reservation.otaRateId === reservation.otaListingId) {
						rate = _.head(otaListing.rates);
					}

					if (rate) {
						reservation.ratePlanId = rate.ratePlanId;
					}
				} else {
					const rateFilter = {
						_id: { $in: listing.rateIds },
						otaRateName: reservation.otaRateName,
						otaName: reservation.otaName,
					};
					const otaRate = await models.Rate.findOne(rateFilter);
					if (otaRate) {
						const rate = otaListing.rates.find(r => r.rateId === otaRate.rateId);
						if (rate) {
							reservation.ratePlanId = rate.ratePlanId;
						} else {
							logger.warn('Not found rate confirmReservation', otaListing.rates, otaRate);
						}
					} else {
						logger.warn('Not found otaRate confirmReservation', rateFilter);
					}
				}

				if (!reservation.ratePlanId) {
					logger.warn('Not found rateplan confirmReservation', reservation, otaListing);
				}
			}
		}
	}

	const block = await models.Block.findById(reservation.blockId).lean();
	const groupIds = _.take(block.groupIds, 1);
	reservation.groupIds = groupIds;

	let guest = await findOrCreateGuest(reservation.guestId, { ...(reservation.guest || null), groupIds });
	reservation.guestId = guest._id;

	// create booking
	const [booking, isNew] = await models.Booking.createNewBookFromOTA(reservation, forceNew);
	const oldMessageId = reservation.threadId || booking.messages;

	if (_.toString(booking.guestId) !== _.toString(guest._id)) {
		if (!booking.guestId) {
			booking.guestId = guest._id;
		} else {
			await models.Guest.deleteOne({ _id: guest._id });

			const newPhone = guest.phone;
			guest = await models.Guest.findById(booking.guestId);

			if (!guest.phone && newPhone) {
				guest.phone = newPhone;
				await guest.save();
			}
		}
	}

	// create messages thread
	let thread = oldMessageId && (await models.Messages.findById(oldMessageId));
	if (thread) {
		thread.otaListingId = reservation.otaListingId || thread.otaListingId;
		thread.otaBookingId = booking.otaBookingId;
		thread.inquiry = thread.approved ? false : booking.status === BookingStatus.REQUEST && !reservation.approved;
		if (_.some(reservation.alterations, a => a.status === 0)) {
			thread.inquiry = true;
			thread.declined = false;
			thread.approved = false;
		}
		if (reservation.inquiryDetails) {
			thread.inquiryDetails = reservation.inquiryDetails;
		}
		await thread.save();
	} else {
		thread = await models.Messages.createMessagesThread({
			otaName: reservation.otaName,
			threadId: _.get(reservation.thread, 'id') || reservation.threadId,
			guestId: booking.guestId,
			otaListingId: reservation.otaListingId,
			otaBookingId: reservation.otaBookingId,
			inquiry: booking.status === BookingStatus.REQUEST && !reservation.approved,
			inquiryPostId: reservation.inquiryPostId,
			inquiryDetails: reservation.inquiryDetails,
			approved: !!reservation.approved,
			groupIds,
		});

		guest.messages = thread._id;
		await guest.save();
	}

	booking.messages = thread._id;

	if (isNew && (!booking.fromHour || !booking.toHour)) {
		booking.fromHour = booking.fromHour || RuleDay.from;
		booking.toHour = booking.toHour || RuleDay.to;
		const today = moment().format('YYYY-MM-DD');
		const nextCheckinDate = moment(booking.from).add(1, 'day').format('YYYY-MM-DD');

		if (today === booking.from.toDateMysqlFormat()) {
			let currentTime = moment().format('HH:mm');
			if (currentTime > RuleDay.from && currentTime <= '23:59') {
				booking.fromHour = roundTime(currentTime);
			}
		}
		if (today === nextCheckinDate) booking.fromHour = '23:59';
	}

	if (isNew && booking.isRatePaid() && !block.isSelfCheckin) {
		booking.ignoreGuide = true;
		booking.guideStatus = BookingGuideStatus.Done;
		booking.guideDoneStatus = BookingGuideDoneStatus.Paid;
	}

	_.forEach(reservation.specialRequests, request => {
		const normRequest = _.toString(request).normalize().trim();
		if (!normRequest) return;

		const description = `SpecialRequest: ${normRequest}`;
		const note = _.some(booking.histories, h => h.specialRequest && h.description === description);
		if (!note) {
			const newHistory = booking.histories.create({ description, specialRequest: true });
			booking.histories.push(newHistory);
		}
	});

	await booking.save();

	// reservate new rooms
	if (isNew) {
		let rooms = [];
		if (booking.status === BookingStatus.CONFIRMED) {
			let err;
			rooms = await reservateBooking(booking, reservateRooms, reservation.roomPrices).catch(e => {
				err = e;
				return [];
			});

			eventEmitter.emit(EVENTS.RESERVATION, booking, guest, rooms);

			if (err) {
				throw new ThrowReturn(err);
			}
		} else if (booking.status === BookingStatus.REQUEST) {
			eventEmitter.emit(EVENTS.INQUIRY, guest, booking.messages, booking.listingId, reservation.otaName, booking);
		} else if (booking.status === BookingStatus.CANCELED) {
			eventEmitter.emit(EVENTS.RESERVATION_CANCEL, booking, guest, true);
		}

		return { booking, isNew, rooms };
	}

	// or change booking dates
	if (
		!booking.manual &&
		!booking.error &&
		(booking.from.toDateMysqlFormat() !== reservation.from.toDateMysqlFormat() ||
			booking.to.toDateMysqlFormat() !== reservation.to.toDateMysqlFormat() ||
			(booking.serviceType === Services.Hour &&
				reservation.fromHour &&
				reservation.toHour &&
				(booking.fromHour !== reservation.fromHour || booking.toHour !== reservation.toHour)))
	) {
		await changeOTABookingDate(booking, reservation);
	}

	if (thread.inquiry && booking.status === BookingStatus.REQUEST) {
		eventEmitter.emit(EVENTS.INQUIRY, guest, booking.messages, booking.listingId, reservation.otaName, booking);
	}

	if (oldMessageId && !(await models.BlockInbox.findOne({ messageId: booking.messages }).select('_id'))) {
		if (booking.status === BookingStatus.CONFIRMED) {
			eventEmitter.emit(EVENTS.RESERVATION, booking, guest, booking.reservateRooms);
		} else if (booking.status === BookingStatus.REQUEST) {
			eventEmitter.emit(EVENTS.INQUIRY, guest, booking.messages, booking.listingId, reservation.otaName, booking);
		} else if (booking.status === BookingStatus.CANCELED) {
			eventEmitter.emit(EVENTS.RESERVATION_CANCEL, booking, guest, true);
		}
	}

	return { booking, isNew };
}

async function resetDoorCode(booking) {
	try {
		const rooms = await models.Room.find({
			blockId: booking.blockId,
			'lock.code': booking.doorCode,
		}).select('lock');

		await rooms.asyncMap(room =>
			updateCode(
				room._id,
				room.lock.findIndex(l => l.code === booking.doorCode)
			)
		);
	} catch (e) {
		logger.error(e);
	}
}

async function changeReservatedDate({
	booking,
	roomIds,
	changeToRoomIds,
	from,
	to,
	fromHour,
	toHour,
	changeToBlockId,
	userId,
}) {
	from = from ? from.zeroHours() : booking.from;
	to = to ? to.zeroHours() : booking.to;
	changeToBlockId = changeToBlockId || booking.blockId;
	roomIds = _.uniqBy(roomIds, _.toString).toMongoObjectIds();
	changeToRoomIds = _.uniqBy(changeToRoomIds, _.toString).toMongoObjectIds();

	if (!changeToRoomIds.length) {
		if (booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.NOSHOW) {
			booking.from = from;
			booking.to = to;
			await booking.save();
			return [];
		}
		throw new ThrowReturn(`Need at least 1 room for booking ${booking._id}`);
	}

	const reservations = _.compact(
		await roomIds.asyncMap(async roomId => {
			const res = await models.Reservation.findOne({ bookingId: booking._id, roomId })
				.select('-_id -dates -roomId -blockId')
				.lean();

			// if (!res) {
			// 	throw new ThrowReturn(`Invalid Room!`);
			// }

			return res;
		})
	);

	const isHour = booking.serviceType === Services.Hour;
	const roomsPrice = _.compact(
		reservations.map(
			(r, i) =>
				changeToRoomIds[i] && {
					...r,
					roomId: changeToRoomIds[i],
				}
		)
	);
	const newOptions = { roomsPrice };
	if (isHour) {
		newOptions.fromHour = fromHour || booking.fromHour;
		newOptions.toHour = toHour || booking.toHour;
	} else {
		newOptions.checkin = fromHour || booking.fromHour;
		newOptions.checkout = toHour || booking.toHour;
	}

	// clear reservated room
	await models.BlockScheduler.clearReservations({
		bookingId: booking._id,
		blockId: booking.blockId,
		rooms: roomIds,
		from: booking.from,
		to: booking.to,
	});

	// reservate new room
	await models.BlockScheduler.reservateRooms(booking._id, changeToBlockId, changeToRoomIds, from, to, newOptions);

	// change book dates
	if (booking.from.valueOf() !== from.valueOf() || booking.to.valueOf() !== to.valueOf()) {
		booking.from = from;
		booking.to = to;
		if (userId) booking.manual = true;
	}
	if (booking.status === BookingStatus.REQUEST) {
		booking.status = BookingStatus.CONFIRMED;
	}
	if ((toHour && booking.toHour !== toHour) || (fromHour && booking.fromHour !== fromHour)) {
		// log
		booking.$locals.updatedBy = userId;
		_.set(booking, '$locals.oldData.fromHour', booking.fromHour);
		_.set(booking, '$locals.oldData.toHour', booking.toHour);

		if (fromHour) booking.fromHour = fromHour;
		if (toHour) booking.toHour = toHour;
		if (isHour && userId) booking.manual = true;
	}
	if (changeToBlockId.toString() !== booking.blockId.toString()) {
		booking.blockId = changeToBlockId;
	}
	if (userId && roomIds.length !== changeToRoomIds.length) {
		booking.manual = true;
	}

	await booking.save();

	eventEmitter.emit(EVENTS.RESERVATION_UPDATE, booking, roomIds, changeToRoomIds);

	return changeToRoomIds;
}

async function cancelReservation({ reservation, fullCancelled = true, userId = null, cancelFromOTA, reason }) {
	const { bookingId, otaName, otaBookingId } = reservation;
	const status = reservation.status || BookingStatus.CANCELED;

	const booking = bookingId
		? await models.Booking.findById(bookingId)
		: await models.Booking.findOne({ otaName, otaBookingId });

	if (!booking) {
		await models.JobCrawler.updateMany({ otaName, reservationId: otaBookingId }, { done: true, canceled: true });
		return {};
	}

	const bookings = fullCancelled ? [booking, ...(await booking.getRelativeBookings())] : [booking];
	const events = [];

	for (const currentBooking of bookings) {
		const needUpdate = !BookingStatusCanceled.includes(currentBooking.status);
		const isCanceled = status === BookingStatus.CANCELED;
		const update = {};

		const roomIds =
			isCanceled && needUpdate
				? await models.Reservation.getReservateRooms(currentBooking.blockId, booking._id)
				: [];

		let currentType = _.get(currentBooking, 'canceledBy.type');

		if (userId) {
			currentType = CanceledByType.USER;
			update['canceledBy.by'] = userId;
		} else if (cancelFromOTA) {
			currentType = CanceledByType.OTA;
		} else {
			currentType = CanceledByType.SYSTEM;
		}
		if (currentType && currentType !== _.get(currentBooking, 'canceledBy.type')) {
			update['canceledBy.type'] = currentType;
		}

		if (reason) update['canceledBy.reason'] = reason;

		if (needUpdate) {
			update.reservateRooms = await models.BlockScheduler.cancelBooking(currentBooking);
		}
		if ((needUpdate || userId) && currentBooking.status !== status) {
			update.status = status;

			if (isCanceled || status === BookingStatus.DECLINED) {
				models.Booking.addLog({
					userId,
					bookingId: currentBooking._id,
					action: BookingLogs[isCanceled ? 'BOOKING_CANCELED' : 'BOOKING_DECLINED'],
					description: reason,
				});
				if (isCanceled) {
					update.canceledAt = new Date();
				}
			}
			if (isCanceled) {
				events.push({
					type: EVENTS.RESERVATION_CANCEL,
					booking: currentBooking,
					cancelFromOTA,
					roomIds,
				});
			}

			if (status === BookingStatus.NOSHOW) {
				events.push({
					type: EVENTS.RESERVATION_NOSHOW,
					booking: currentBooking,
				});
			}
			if (status === BookingStatus.CHARGED) {
				events.push({
					type: EVENTS.RESERVATION_CHARGED,
					booking: currentBooking,
				});
			}
		}

		if (!_.isEmpty(update)) {
			_.forEach(update, (v, k) => {
				currentBooking.set(k, v);
			});

			currentBooking.checkin = null;
			currentBooking.checkout = null;
			await currentBooking.save();
		}

		// deactive door code
		if (needUpdate && currentBooking.doorCodeGenerated) {
			resetDoorCode(currentBooking);
		}
	}

	emitBookingEvents(events);
}

async function emitBookingEvents(events) {
	await events.asyncMap(async event => {
		const guest = await models.Guest.findById(event.booking.guestId);
		// Using for Canceled event
		const roomIds = event.roomIds || [];
		eventEmitter.emit(event.type, event.booking, guest, event.cancelFromOTA, roomIds);
	});
}

async function swapReservations(b1, r1, b2, r2, userId) {
	if (_.toString(b1) === _.toString(b2)) {
		throw new ThrowReturn(`Can't swap bookings with the same ID!`);
	}

	const reservations = [
		{
			booking: await models.Booking.findById(b1),
			oldRoom: r1,
			newRoom: r2,
		},
		{
			booking: await models.Booking.findById(b2),
			oldRoom: r2,
			newRoom: r1,
		},
	];

	// validate info
	for (const reservation of reservations) {
		const { booking, oldRoom, newRoom } = reservation;

		if (!booking || !booking.isAlive()) {
			throw new ThrowReturn(`Booking is not found or canceled!`);
		}

		// get reserved rooms
		const reservedRooms = await models.Reservation.getReservateRooms(booking.blockId, booking._id);
		if (!reservedRooms.includesObjectId(oldRoom) || reservedRooms.includesObjectId(newRoom)) {
			throw new ThrowReturn(`Invalid Room!`);
		}
	}

	await ReservateCalendarLock.acquire(reservations[0].booking.blockId.toString(), async () => {
		// check room available
		for (const reservation of reservations) {
			const { booking, newRoom } = reservation;
			const options = {
				excludeBookingIds: _.map(reservations, 'booking._id'),
			};

			if (booking.serviceType === Services.Hour) {
				options.fromHour = booking.fromHour;
				options.toHour = booking.toHour;
			} else {
				options.checkin = booking.fromHour;
				options.checkout = booking.toHour;
			}

			const available = await models.BlockScheduler.isRoomAvailable(
				newRoom,
				booking.blockId,
				booking.from,
				booking.to,
				options
			);
			if (!available) {
				throw new ThrowReturn("Can't swap - Room not available!");
			}
		}

		// reservate new room
		await reservations.asyncForEach(async reservation => {
			const { booking, oldRoom, newRoom } = reservation;
			const options =
				booking.serviceType === Services.Hour
					? {
							fromHour: booking.fromHour,
							toHour: booking.toHour,
					  }
					: {
							checkin: booking.fromHour,
							checkout: booking.toHour,
					  };

			await changeReservatedDate({
				booking,
				roomIds: [oldRoom],
				changeToRoomIds: [newRoom],
				from: booking.from,
				to: booking.to,
				...options,
			});

			writeLog({
				bookingId: booking._id,
				userId,
				roomIds: oldRoom,
				newRoomIds: newRoom,
				description: 'Swap',
			});
		});
	});

	return reservations;
}

async function arrangeReservations(swaps, user) {
	const newBookingValue = swaps.find(v => !v.oldRoomId);
	if (!newBookingValue) {
		throw new ThrowReturn('New booking not found');
	}
	if (swaps.some(v => v.newRoomId && v.oldRoomId && v.oldRoomId.toString() === v.newRoomId.toString())) {
		throw new ThrowReturn("Can't rearrange this booking, old room has equal to new room");
	}
	const newBooking = await models.Booking.findById(newBookingValue._id);
	if (!newBooking || newBooking.error === 0) {
		throw new ThrowReturn("Can't rearrange this booking, error not found");
	}

	// get blockIds
	swaps = await swaps.asyncMap(async v => {
		const booking = await models.Booking.findById(v._id);
		if (booking.checkin) {
			throw new ThrowReturn(`Can't rearrange, bookingId ${booking.otaBookingId} already checkin`);
		}
		v.blockId = booking.blockId;
		v.booking = booking;
		return v;
	});

	const prevReservations = await swaps.asyncMap(
		v =>
			v.oldRoomId &&
			models.Reservation.findOne({ bookingId: v._id, roomId: v.oldRoomId })
				.select('-_id -dates -roomId -blockId')
				.lean()
	);

	// clear old rooms
	await swaps
		.filter(v => v.oldRoomId)
		.asyncForEach(v =>
			models.BlockScheduler.clearReservations({
				bookingId: v._id,
				blockId: v.blockId,
				rooms: [v.oldRoomId],
				from: v.from,
				to: v.to,
			})
		);

	const newRoomIds = [];

	// reservate new rooms
	await swaps.asyncForEach(async (v, idx) => {
		const options = {};

		const prevData = prevReservations[idx];
		if (prevData) {
			options.roomsPrice = [
				{
					...prevData,
					roomId: v.newRoomId,
				},
			];
		}
		if (_.get(v.booking, 'serviceType') === Services.Hour) {
			options.fromHour = v.booking.fromHour;
			options.toHour = v.booking.toHour;
		} else {
			options.checkin = v.booking.fromHour;
			options.checkout = v.booking.toHour;
		}

		// reservate new room
		await models.BlockScheduler.reservateRooms(v._id, v.blockId, [v.newRoomId], v.from, v.to, options);

		eventEmitter.emit(EVENTS.RESERVATION_UPDATE, v.booking, v.oldRoomId, v.newRoomId);

		if (newBooking._id.equals(v._id)) {
			newRoomIds.push(v.newRoomId);
		}

		writeLog({
			bookingId: v._id,
			userId: user ? user._id : null,
			roomIds: v.oldRoomId,
			newRoomIds: v.newRoomId,
			description: 'Resolve OverBook',
		});
	});

	// confirm new booking
	newBooking.error = 0;
	await models.Booking.updateOne({ _id: newBooking._id }, { error: newBooking.error });
	const guest = await models.Guest.findById(newBooking.guestId);

	eventEmitter.emit(EVENTS.RESERVATION, newBooking, guest, newRoomIds);

	return newRoomIds;
}

function findRatePrice(from, to, rates) {
	const dates = rangeDate(from, to, false).toArray();
	const srates = _.sortBy(rates, ['date']);

	const newRates = dates
		.map(date => {
			const dFormat = date.toDateMysqlFormat();
			const rate = srates.find(r => r.date === dFormat) || srates.filter(r => r.date >= dFormat)[0] || srates[0];
			return rate && rate.price;
		})
		.filter(r => r);

	if (newRates.length === dates.length) {
		return _.round(_.sum(newRates));
	}
}

function reCalcPrice(booking, from, splitDate, to) {
	const r1 = { roomPrice: 0 };
	const r2 = { roomPrice: 0 };

	if (booking.rates && booking.rates.length) {
		r2.roomPrice = findRatePrice(splitDate, to, booking.rates);
	}

	if (!r2.roomPrice) {
		const diffFrom = moment(splitDate).diff(moment(from), 'days');
		const diffTo = moment(to).diff(moment(splitDate), 'days');
		const night = diffFrom + diffTo;
		r2.roomPrice = _.round((diffTo / night) * booking.roomPrice);
	}

	r2.otaFee = _.round(booking.otaFee * (r2.roomPrice / booking.roomPrice)) || 0;
	r2.paid = _.round(booking.paid * (r2.roomPrice / booking.roomPrice)) || 0;

	r1.roomPrice = r1.roomPrice || Math.max(booking.roomPrice - r2.roomPrice, 0);
	r1.otaFee = Math.max(booking.otaFee - r2.otaFee, 0);
	r1.paid = Math.max(booking.paid - r2.paid, 0);

	return [r1, r2];
}

async function splitReservation(bookingId, date, userId) {
	const booking = await models.Booking.findById(bookingId);
	if (booking.serviceType === Services.Hour) throw new ThrowReturn('Service Type Invalid');

	const { from, to, toHour, blockId, histories } = booking;

	const splitDate = new Date(date).zeroHours();
	if (from >= splitDate || to <= splitDate) {
		throw new ThrowReturn('Split date not in range checkin checkout');
	}

	const rooms = await models.Reservation.getReservateRooms(blockId, booking._id);

	booking.toHour = RuleDay.to;

	await changeReservatedDate({
		booking,
		roomIds: rooms,
		changeToRoomIds: rooms,
		from: booking.from,
		to: splitDate,
	});

	const [r1, r2] = reCalcPrice(booking, from, splitDate, to);

	const newBookingData = {
		rooms,
		roomPrice: r2.roomPrice,
		otaFee: r2.otaFee,
		paid: r2.paid,
		from: splitDate,
		to,
		manual: true,
		histories: histories.filter(h => !h.system),
		toHour,
		..._.pick(booking, [
			'otaBookingId',
			'messages',
			'rateType',
			'guestId',
			'guestIds',
			'status',
			'amount',
			'otaName',
			'numberChilden',
			'numberAdults',
			'listingId',
			'blockId',
			'currency',
			'doneTemplate',
			'ignoreTemplate',
			'serviceType',
			'problemStatus',
			'rates',
			'ratePlan',
			'rateDetail',
			'paymentCardState',
		]),
	};

	const { booking: newBooking } = await confirmReservation(newBookingData, true);

	booking.roomPrice = r1.roomPrice;
	booking.otaFee = r1.otaFee;
	booking.paid = r1.paid;
	booking.manual = true;
	await booking.save();

	eventEmitter.emit(EVENTS.RESERVATION_SPLIT, booking, newBooking);

	await models.BookingContract.updateOne({ bookingIds: booking._id }, { $addToSet: { bookingIds: newBooking._id } });

	const format = 'DD/MM/YYYY';
	const fromText = moment(from).format(format);
	const toText = moment(to).format(format);
	const splitDateText = moment(splitDate).format(format);

	const l1 = {
		bookingId: booking._id,
		userId,
		action: BookingLogs.BOOKING_SPLIT,
		prevData: `${fromText} - ${toText}`,
		data: `${fromText} - ${splitDateText}`,
	};
	const l2 = {
		bookingId: newBooking._id,
		userId,
		action: BookingLogs.BOOKING_SPLIT,
		prevData: `${fromText} - ${toText}`,
		data: `${splitDateText} - ${toText}`,
	};

	models.Booking.addLog(l1);
	models.Booking.addLog(l2);

	return [booking._id, newBooking._id];
}

async function reConfirmBooking(booking) {
	let rooms = booking.reservateRooms;
	const options =
		booking.serviceType === Services.Hour
			? {
					fromHour: booking.fromHour,
					toHour: booking.toHour,
			  }
			: {
					checkin: booking.fromHour,
					checkout: booking.toHour,
			  };

	if (!rooms || !rooms.length) {
		rooms = await models.Reservation.find({ bookingId: booking._id })
			.select('roomId')
			.then(res => res.map(r => r.roomId));
	}
	if (rooms && rooms.length) {
		await ReservateCalendarLock.acquire(booking.blockId.toString(), async () => {
			await rooms.asyncMap(async roomId => {
				const available = await models.BlockScheduler.isRoomAvailable(
					roomId,
					booking.blockId,
					booking.from,
					booking.to,
					options
				);
				if (!available) {
					throw new ThrowReturn('Room not available!');
				}
			});

			await models.BlockScheduler.reservateRooms(
				booking._id,
				booking.blockId,
				rooms,
				booking.from,
				booking.to,
				options
			);
		});
	}

	booking.status = BookingStatus.CONFIRMED;
	await booking.save();

	return booking;
}

async function undoCancelled(booking, user) {
	if (booking.status !== BookingStatus.CANCELED) {
		throw new ThrowReturn('This booking is not canceled!');
	}

	await reConfirmBooking(booking);

	await models.Booking.updateOne({ _id: booking._id }, { $unset: { canceledAt: 1, canceledBy: 1 } });
	await models.Booking.addLog({
		bookingId: booking._id,
		userId: user._id,
		action: BookingLogs.BOOKING_CANCELED_UNDO,
	});
}

async function noShow(booking, user) {
	if (booking.status === BookingStatus.NOSHOW) {
		throw new ThrowReturn('This booking already no show!');
	}

	const userId = user._id;

	await cancelReservation({
		reservation: { bookingId: booking._id, status: BookingStatus.NOSHOW },
		fullCancelled: false,
		userId,
	});
	await models.Booking.addLog({ bookingId: booking._id, userId, action: BookingLogs.BOOKING_NOSHOW });
}

async function undoNoshow(booking, user) {
	if (booking.status !== BookingStatus.NOSHOW) {
		throw new ThrowReturn('This booking is not noshow!');
	}

	await reConfirmBooking(booking);
	await models.Booking.addLog({ bookingId: booking._id, userId: user._id, action: BookingLogs.BOOKING_NOSHOW_UNDO });
}

async function chargeReservation(booking, user) {
	if (booking.status === BookingStatus.CHARGED) {
		throw new ThrowReturn('This booking already charged!');
	}

	const userId = user._id;
	await cancelReservation({
		reservation: { bookingId: booking._id, status: BookingStatus.CHARGED },
		fullCancelled: false,
		userId,
	});
	await models.Booking.addLog({ bookingId: booking._id, userId, action: BookingLogs.BOOKING_CHARGED });
}

async function undoChargeReservation(booking, user) {
	if (booking.status !== BookingStatus.CHARGED) {
		throw new ThrowReturn('This booking is not charged!');
	}

	await reConfirmBooking(booking);
	await models.Booking.addLog({ bookingId: booking._id, userId: user._id, action: BookingLogs.BOOKING_CHARGED_UNDO });
}

async function sendEmailToOTA(booking, guest) {
	try {
		if (!guest.phone) {
			await sendEmailConfirmationOTA(booking);
		}
	} catch (e) {
		logger.error(e);
	}
}

eventEmitter.on(EVENTS.RESERVATION, sendEmailToOTA);

module.exports = {
	confirmReservation,
	cancelReservation,
	changeBookingDate,
	swapReservations,
	arrangeReservations,
	noShow,
	splitReservation,
	undoCancelled,
	undoNoshow,
	chargeReservation,
	undoChargeReservation,
	changeBooking,
	changeListing,
	changeReservatedDate,
	reCalcBookingPrice,
};

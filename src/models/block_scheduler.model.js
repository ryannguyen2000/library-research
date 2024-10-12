const mongoose = require('mongoose');
const moment = require('moment');
const _ = require('lodash');

const { rangeDate, timeRangeIntersection, setDelayTime } = require('@utils/date');
const { syncAvailablityCalendar } = require('@controllers/schedule/local');
const { RuleDay, Services, LOCK_TYPE, PRESENT_COMPARE_WITH_CHECKIN_RESULT } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const BlockSchedulerSchema = new Schema(
	{
		date: Date,
		blockId: { type: ObjectId, ref: 'Block' },
		reservations: [
			{
				_id: false,
				roomId: { type: ObjectId, ref: 'Room', required: true },
				bookingId: { type: ObjectId, ref: 'Booking' },
				fromHour: String, // using for hour res
				toHour: String, // using for hour res
				checkin: String, // using for day res
				checkout: String, // using for day res
			},
		],
		lockedRoomIds: [{ type: ObjectId, ref: 'Room' }],
		lockedHours: [
			{
				_id: false,
				roomId: { type: ObjectId, ref: 'Room' },
				fromHour: String,
				toHour: String,
			},
		],
	},
	{
		timestamps: { createdAt: false, updatedAt: true },
		autoIndex: false,
	}
);

BlockSchedulerSchema.index({ date: 1, blockId: 1 }, { unique: true });

BlockSchedulerSchema.methods = {
	hasReservation(roomId) {
		for (const res of this.reservations) {
			if (res.roomId.toString() === roomId.toString()) return true;
		}
		return false;
	},

	isLockedRoom(roomId) {
		this.lockedRoomIds = this.lockedRoomIds || [];
		return this.lockedRoomIds.includesObjectId(roomId);
	},

	isAvailable(relationRoomIds, options) {
		const doc = _.pick(this, ['reservations', 'lockedHours', 'lockedRoomIds']);
		return _isCurrentAvailable(doc, relationRoomIds, options);
	},
};

function _isCurrentAvailable(doc, relationRoomIds = {}, options) {
	const lockedRoomIds = doc.lockedRoomIds || [];

	const isLockedRoomIdsAvaiable = lockedRoomIds.some(lockedRoomId => relationRoomIds[lockedRoomId]);
	if (isLockedRoomIdsAvaiable) return false;

	const { rules, isCheckinDate, serviceType } = options;
	const reservations = doc.reservations || [];
	const lockedHours = doc.lockedHours || [];
	const ruleFrom = serviceType === Services.Night ? rules.night.from : rules.day.from;
	const isInCheckInRange = options.toHour ? options.toHour > ruleFrom : true;

	let fromHourDelay = options.fromHour;
	let toHourDelay = options.toHour;

	if (options.fromHour) {
		fromHourDelay = setDelayTime(options.fromHour, rules.delay, 'SUBTRACT');
		toHourDelay = setDelayTime(options.toHour, rules.delay, 'ADD');
	}

	const isReservationAndLockedHoursAvailable = [...reservations, ...lockedHours].some(res => {
		const isIncludeRoomId = relationRoomIds[res.roomId];
		if (!isIncludeRoomId) {
			return false;
		}

		if (!res.toHour) {
			if (res.checkin) {
				const checkInDelay = setDelayTime(res.checkin, rules.delay, 'SUBTRACT');
				return options.toHour ? options.toHour > checkInDelay : true;
			}
			return isInCheckInRange;
		}

		if (options.fromHour) {
			const fromHour = res.bookingId ? fromHourDelay : options.fromHour;
			const toHour = res.bookingId ? toHourDelay : options.toHour;

			const isTwoHourConflict = fromHour < res.toHour && toHour > res.fromHour;
			return isTwoHourConflict;
		}

		// Using for day service
		return isCheckinDate ? res.toHour > moment().format('HH:mm') : isIncludeRoomId;
	});

	return !isReservationAndLockedHoursAvailable;
}

// Check previous date have dayRes.checkout in current day period (14:00 -> 24:00)
function isPreDayAvailable(preSchedule, relationRooms, options) {
	const { rules, current } = options;

	if (!preSchedule) return false;

	const diffDay = Math.floor(moment().diff(current, 'days', true));
	const currentTime = moment().format('HH:mm');

	return !_.get(preSchedule, 'reservations', []).some(res => {
		if (!relationRooms[res.roomId]) return false;

		if (res.checkout) {
			if (diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.SAME) {
				return res.checkout > rules.day.from && res.checkout > currentTime;
			}

			if (diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.NEXT_DATE_OF_CHECKIN) return false;
			return res.checkout > rules.day.from;
		}
		return false;
	});
}
// Check next date include hour res in day check-out range (0h -> checkout + delay)
function isNextDayAvailable(nextSchedule, relationRooms, rules) {
	return !_.get(nextSchedule, 'reservations', []).some(res => {
		if (!relationRooms[res.roomId]) return false;
		if (res.fromHour) return res.fromHour < rules.day.to;
		return res.checkin ? res.checkin < rules.day.to : false;
	});
}

function isRoomsAvailable({ schedulesGrByDate, date, roomIds, options }) {
	const { rules } = options;

	const preDate = moment(date).subtract(1, 'day').toDate().toDateMysqlFormat();
	if (!isPreDayAvailable(schedulesGrByDate[preDate], roomIds, { rules, current: date })) return false;

	const current = date.toDateMysqlFormat();
	if (!_isCurrentAvailable(schedulesGrByDate[current], roomIds, options)) return false;

	const nextDate = moment(date).add(1, 'day').toDate().toDateMysqlFormat();
	if (!isNextDayAvailable(schedulesGrByDate[nextDate], roomIds, rules)) return false;

	return true;
}

function getUnavailableHours({ newSch, roomIds, schedulesGrByDate, rules }) {
	const preDate = moment(newSch.date).subtract(1, 'day').toDate().toDateMysqlFormat();
	const MIN_HOUR = '00:00';
	const MAX_HOUR = '24:00';

	// get checkout range of previous res
	const preDayRes = _.get(schedulesGrByDate[preDate], 'reservations', [])
		.filter(r => !r.toHour)
		.map(pdr => ({
			roomId: pdr.roomId,
			fromHour: MIN_HOUR,
			toHour: setDelayTime(pdr.checkout || rules.day.checkout, rules.delay, 'ADD'),
		}));
	const dayRes = newSch.reservations
		.filter(r => !r.toHour)
		.map(res => ({
			roomId: res.roomId,
			fromHour: setDelayTime(res.checkin || rules.day.checkin, rules.delay, 'SUBTRACT'),
			toHour: MAX_HOUR,
		}));
	const dayLocks = newSch.lockedRoomIds.map(roomId => ({
		roomId,
		fromHour: MIN_HOUR,
		toHour: MAX_HOUR,
	}));

	const hourRes = newSch.reservations
		.filter(r => r.toHour)
		.map(res => ({
			...res,
			fromHour: setDelayTime(res.fromHour, rules.delay, 'SUBTRACT'),
			toHour: setDelayTime(res.toHour, rules.delay, 'ADD'),
		}));

	const hourResAndLocksGroupBy = _.groupBy(
		[...dayLocks, ...newSch.lockedHours, ...dayRes, ...preDayRes, ...hourRes],
		r => _.toString(r.roomId)
	);

	const hourRanges = roomIds.map(roomId => hourResAndLocksGroupBy[roomId]);
	const unavailableHours = timeRangeIntersection(hourRanges);

	return unavailableHours;
}

BlockSchedulerSchema.statics = {
	async getSchedulesByRoomIds({
		blockId,
		from,
		to,
		roomIds = [],
		filterEmpty = true,
		schedules,
		includeHourService = false,
		isSync = false,
		rules,
	}) {
		if (!roomIds.length) return [];

		if (!schedules) {
			schedules = await this.find({
				blockId,
				date: { $gte: from.zeroHours(), $lt: to.zeroHours() },
			})
				.sort({ date: 1 })
				.lean();
		}

		if (!schedules.length) return [];

		const modified = {};
		const options = { rules };

		const _preDate = moment(schedules[0].date).subtract(1, 'day').toDate();
		const _nextDate = moment(schedules[schedules.length - 1].date)
			.add(1, 'day')
			.toDate();

		const _schedules = await this.find({
			blockId,
			date: { $in: [_preDate, _nextDate] },
		}).lean();

		const schedulesGrByDate = _.keyBy([...schedules, ..._schedules], item => item.date.toDateMysqlFormat());

		const availableSchedules = [];
		schedules.forEach(schedule => {
			roomIds.forEach(roomId => {
				const available = isRoomsAvailable({
					schedulesGrByDate,
					date: schedule.date,
					roomIds: { [roomId]: roomId },
					options,
				});
				if (available) availableSchedules.push({ roomId, schedule });
			});
		});

		if (availableSchedules.length) {
			const relationRooms = {};
			const RoomModel = this.model('Room');

			await _.uniq(availableSchedules.map(s => s.roomId.toString())).asyncMap(async roomId => {
				relationRooms[roomId] = await RoomModel.getRelationsRooms(roomId, true);
			});

			availableSchedules.forEach(item => {
				const available = isRoomsAvailable({
					schedulesGrByDate,
					date: item.schedule.date,
					roomIds: relationRooms[item.roomId],
					options,
				});

				if (!available) {
					modified[item.schedule._id] = modified[item.schedule._id] || {};
					modified[item.schedule._id].lockedRoomIds = modified[item.schedule._id].lockedRoomIds || [
						...(item.schedule.lockedRoomIds || []),
					];
					modified[item.schedule._id].lockedRoomIds.push(item.roomId);
				}
			});
		}

		const roomKeys = _.mapKeys(roomIds);
		const currentTime = moment().format('HH:mm');

		const newSchedules = schedules.map(schedule => {
			const newSch = {
				available: 0,
				lockedHours: [],
				lockedRoomIds: [],
				reservations: [],
				...schedule,
				...modified[schedule._id],
			};

			newSch.lockedHours = newSch.lockedHours.filter(hl => roomKeys[hl.roomId]);
			newSch.lockedRoomIds = newSch.lockedRoomIds.filter(roomId => roomKeys[roomId]);
			newSch.reservations = newSch.reservations.filter(reservation => roomKeys[reservation.roomId]);

			const diffDay = Math.floor(moment().diff(newSch.date, 'days', true));
			const isSameDay = diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.SAME;

			let res = newSch.reservations;
			let hourLocked = [];

			if (includeHourService) {
				res = newSch.reservations.filter(r => {
					if (!r.toHour) return true;

					const defaultLocked = r.toHour > rules.day.from;

					if (isSameDay && r.checkout) {
						return defaultLocked && r.checkout > currentTime;
					}

					return defaultLocked;
				});

				hourLocked = newSch.lockedHours.filter(l => l.toHour > (isSameDay ? currentTime : rules.day.from));

				if (isSync) {
					newSch.unavailableHours = getUnavailableHours({ newSch, roomIds, schedulesGrByDate, rules });
				}
			}

			// check pre date: day res's checkout in current res range
			const preDate = moment(newSch.date).subtract(1, 'day').toDate().toDateMysqlFormat();
			const preDateUnavailableRooms = _.get(schedulesGrByDate[preDate], 'reservations', [])
				.filter(r => {
					if (!roomKeys[r.roomId]) return false;
					if (r.checkout) {
						if (isSameDay) {
							return r.checkout > currentTime && r.checkout > rules.day.from;
						}
						if (diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.NEXT_DATE_OF_CHECKIN) return false;
						return r.checkout > rules.day.from;
					}
					return false;
				})
				.map(r => r.roomId);

			// Check next date: include hour res inside checkout out range.
			const nextDate = moment(newSch.date).add(1, 'day').toDate().toDateMysqlFormat();
			const nextDateUnavailableRooms = _.get(schedulesGrByDate[nextDate], 'reservations', [])
				.filter(r => {
					if (!roomKeys[r.roomId]) return false;
					if (r.fromHour) return r.fromHour < rules.day.to;
					return r.checkin ? r.checkin < rules.day.to : false;
				})
				.map(r => r.roomId);

			const unavailableRooms = _.uniqBy(
				[
					...newSch.lockedRoomIds,
					...res.map(r => r.roomId),
					...hourLocked.map(r => r.roomId),
					...nextDateUnavailableRooms,
					...preDateUnavailableRooms,
				],
				_.toString
			);

			newSch.available = Math.max(newSch.available, roomIds.length - unavailableRooms.length, 0);

			return newSch;
		});

		if (filterEmpty) {
			return newSchedules.filter(d => d.lockedRoomIds.length || d.reservations.length || d.lockedHours.length);
		}

		return newSchedules;
	},

	async getSchedules({ blockId, from, to, filterEmpty = true, rules, includeHourService = false }) {
		const schedules = await this.find({
			blockId,
			date: includeHourService
				? { $gte: from.zeroHours(), $lte: to.zeroHours() }
				: { $gte: from.zeroHours(), $lt: to.zeroHours() },
		})
			.sort({ date: 1 })
			.lean();

		const schedulesGrByDate = _.keyBy(schedules, item => item.date.toDateMysqlFormat());

		const newSchedules = schedules.map(schedule => {
			if (includeHourService && to.zeroHours().toISOString() === schedule.date.toISOString()) {
				return {
					lockedRoomIds: [],
					reservations: [],
					lockedHours: [],
					unavailableRooms: [],
				};
			}

			const newSch = {
				available: 0,
				lockedHours: [],
				lockedRoomIds: [],
				reservations: [],
				...schedule,
			};

			// check pre date: day res's checkout in current res range
			const diffDay = Math.floor(moment().diff(newSch.date, 'days', true));
			const preDate = moment(newSch.date).subtract(1, 'day').toDate().toDateMysqlFormat();
			const isToday = diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.SAME;
			const currentTime = moment().format('HH:mm');

			const preDateUnavailableRooms = _.get(schedulesGrByDate[preDate], 'reservations', [])
				.filter(r => {
					if (r.checkout) {
						if (isToday) {
							return r.checkout > rules.day.from && r.checkout > currentTime;
						}
						if (diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.NEXT_DATE_OF_CHECKIN) return false;
						return r.checkout > rules.day.from;
					}
					return false;
				})
				.map(r => r.roomId);

			// Check next date: include hour res inside checkout out range.
			const nextDate = moment(newSch.date).add(1, 'day').toDate().toDateMysqlFormat();
			const nextDateUnavailableRooms = _.get(schedulesGrByDate[nextDate], 'reservations', [])
				.filter(r => {
					if (r.fromHour) return r.fromHour < rules.day.to;
					return r.checkin ? r.checkin < rules.day.to : false;
				})
				.map(r => r.roomId);

			const unavailableRooms = [...newSch.lockedRoomIds, ...preDateUnavailableRooms, ...nextDateUnavailableRooms];

			if (includeHourService) {
				const resAndHourLocks = [...newSch.reservations, ...newSch.lockedHours].filter(
					r => !r.toHour || r.toHour > (isToday ? currentTime : rules.day.from)
				);
				unavailableRooms.push(...resAndHourLocks.map(r => r.roomId));
			} else {
				unavailableRooms.push(...newSch.reservations.map(r => r.roomId));
			}

			newSch.unavailableRooms = _.uniqBy(unavailableRooms, _.toString);
			return newSch;
		});

		if (filterEmpty) {
			return newSchedules.filter(
				d =>
					d.lockedRoomIds.length || d.reservations.length || d.lockedHours.length || d.unavailableRooms.length
			);
		}

		return newSchedules;
	},

	async findAvailableRooms(roomIds, blockId, from, to, options) {
		const availableRooms = await roomIds.asyncMap(roomId =>
			this.isRoomAvailable(roomId, blockId, from, to, options)
		);
		return roomIds.filter((i, idx) => availableRooms[idx]);
	},

	async isRoomAvailable(roomId, blockId, from, to, options) {
		let { toHour, fromHour, rules } = options || {};

		rules = rules || (await this.model('Block').getRules(blockId));
		const ruleDayFrom = _.get(rules, 'day.from', RuleDay.from);
		const ruleDayTo = _.get(rules, 'day.to', RuleDay.to);

		const relationRooms = await this.model('Room').getRelationsRooms(roomId);

		const available =
			fromHour && toHour
				? await this.isHourRoomAvaible({
						blockId,
						relationRooms,
						from,
						ruleDayFrom,
						ruleDayTo,
						options: { ...options, rules },
				  })
				: await this.isDayRoomAvaible({
						blockId,
						relationRooms,
						from,
						to,
						ruleDayFrom,
						ruleDayTo,
						options: { ...options, rules },
				  });

		return available;
	},

	async isHourRoomAvaible({ blockId, relationRooms, from, ruleDayFrom, ruleDayTo, options }) {
		const { excludeBookingIds, fromHour, toHour, rules } = options || {};
		// resFromHour & resToHour add delay time, only using for validate reservation
		const { delay } = rules;
		const resFromHour = setDelayTime(fromHour, delay, 'SUBTRACT');
		const resToHour = setDelayTime(toHour, delay, 'ADD');
		const defaultResElemMatch = {
			roomId: { $in: relationRooms },
		};
		if (!_.isEmpty(excludeBookingIds)) defaultResElemMatch.bookingId = { $nin: excludeBookingIds };

		const reservations = {
			$elemMatch: {
				...defaultResElemMatch,
				$or: [
					// Hour res: validate conflict
					{
						fromHour: { $lt: resToHour },
						toHour: { $gt: resFromHour },
					},
					// Day res: validate checkin range (checkin updated)
					{
						fromHour: { $eq: null },
						toHour: { $eq: null },
						checkin: { $lt: resToHour },
					},
				],
			},
		};
		// Day res: validate checkin range
		if (toHour > ruleDayFrom) {
			reservations.$elemMatch.$or.push({
				fromHour: { $eq: null },
				toHour: { $eq: null },
				checkin: { $eq: null },
			});
		}
		const lockedHours = {
			$elemMatch: {
				roomId: { $in: relationRooms },
				fromHour: { $lt: toHour },
				toHour: { $gt: fromHour },
			},
		};
		const lockedRoomIds = { $in: relationRooms };

		const previousReservation = {
			$elemMatch: {
				...defaultResElemMatch,
				fromHour: { $eq: null },
				toHour: { $eq: null },
				$or: [{ checkout: { $gt: resFromHour } }],
			},
		};
		if (fromHour < ruleDayTo) previousReservation.$elemMatch.$or.push({ checkout: { $eq: null } });

		const query = {
			blockId,
			$or: [
				// Previous date: validate day res's checkout range
				{
					date: moment(from.zeroHours()).subtract(1, 'd').toDate(),
					reservations: previousReservation,
				},
				{
					date: from.zeroHours(),
					$or: [{ reservations }, { lockedRoomIds }, { lockedHours }],
				},
			],
		};

		const exist = await this.findOne(query).select('_id');
		return !exist;
	},

	async isDayRoomAvaible({ blockId, relationRooms, from, to, ruleDayFrom, ruleDayTo, options }) {
		const { excludeBookingIds, checkin, checkout, rules } = options || {};
		const { delay } = rules;

		const checkinDelay = checkin ? setDelayTime(checkin, delay, 'SUBTRACT') : ruleDayFrom;
		const checkoutDelay = checkout ? setDelayTime(checkout, delay, 'ADD') : ruleDayTo;

		const defaultResElemMatch = { roomId: { $in: relationRooms } };
		if (!_.isEmpty(excludeBookingIds)) defaultResElemMatch.bookingId = { $nin: excludeBookingIds };

		const reservations = {
			$elemMatch: {
				...defaultResElemMatch,
				$or: [
					{
						fromHour: { $eq: null },
						toHour: { $eq: null },
					},
					{ toHour: { $gt: checkinDelay } },
				],
			},
		};

		const lockedHours = {
			$elemMatch: {
				roomId: { $in: relationRooms },
				toHour: { $gt: checkinDelay },
			},
		};
		const lockedRoomIds = { $in: relationRooms };

		const query = {
			blockId,
			$or: [
				{
					date: from.zeroHours(),
					$or: [{ reservations }, { lockedHours }, { lockedRoomIds }],
				},
				{
					date: { $gt: from.zeroHours(), $lt: to.zeroHours() },
					$or: [
						{ reservations: { $elemMatch: { ...defaultResElemMatch } } },
						{ lockedHours: { $elemMatch: { ...defaultResElemMatch } } },
						{ lockedRoomIds },
					],
				},
				{
					date: to.zeroHours(),
					reservations: {
						$elemMatch: {
							...defaultResElemMatch,
							$or: [
								{ fromHour: { $lt: checkoutDelay } },
								{ checkin: { $lt: checkoutDelay } },
								// Default: sch.checkin = 12:00
								...(checkoutDelay > rules.day.checkin
									? [
											{
												fromHour: { $eq: null },
												// toHour: { $eq: null },
												checkin: { $eq: null },
											},
									  ]
									: []),
							],
						},
					},
				},
			],
		};

		// Late checkout case
		const diffDay = Math.floor(moment().diff(from, 'days', true));

		if (diffDay !== PRESENT_COMPARE_WITH_CHECKIN_RESULT.NEXT_DATE_OF_CHECKIN) {
			const lateCheckoutCase = {
				date: moment(from.zeroHours()).subtract(1, 'days').toDate(),
				reservations: {
					$elemMatch: {
						...defaultResElemMatch,
						fromHour: { $eq: null },
						toHour: { $eq: null },
						$or: [],
					},
				},
			};

			const elemMatchOr = lateCheckoutCase.reservations.$elemMatch.$or;

			// Default: sch.checkout = 14:00
			if (checkinDelay < rules.day.checkout) elemMatchOr.push({ checkout: { $eq: null } });

			if (diffDay === PRESENT_COMPARE_WITH_CHECKIN_RESULT.SAME) {
				const currentTime = moment().format('HH:mm');
				elemMatchOr.push({ $and: [{ checkout: { $gt: checkinDelay } }, { checkout: { $gt: currentTime } }] });
			} else {
				elemMatchOr.push({ checkout: { $gt: checkinDelay } });
			}

			query.$or.push(lateCheckoutCase);
		}

		const existsCalendar = await this.findOne(query).select('_id');

		return !existsCalendar;
	},

	async reservate(blockId, roomId, from, to, bookingId, options) {
		if (!blockId) {
			throw new ThrowReturn('not found blockId!');
		}
		if (!roomId) {
			throw new ThrowReturn('not found roomId!');
		}

		const { roomsPrice, fromHour, toHour, checkin, checkout } = options || {};

		const dates = rangeDate(from, to, false).toArray();
		const addingBulkers = [];
		const pullingBulkers = [];

		dates.forEach(date => {
			pullingBulkers.push({
				updateOne: {
					filter: { blockId, date },
					update: {
						$pull: { reservations: { roomId, bookingId } },
					},
				},
			});
			addingBulkers.push({
				updateOne: {
					filter: { blockId, date },
					update: {
						$addToSet: {
							reservations: {
								roomId,
								bookingId,
								fromHour,
								toHour,
							},
						},
					},
					upsert: true,
				},
			});
		});

		_.set(_.first(addingBulkers), 'updateOne.update.$addToSet.reservations.checkin', checkin);
		_.set(_.last(addingBulkers), 'updateOne.update.$addToSet.reservations.checkout', checkout);

		await [pullingBulkers, addingBulkers].asyncForEach(bulkers => this.bulkWrite(bulkers));
		await this.model('Reservation').add(bookingId, blockId, [roomId], from, to, roomsPrice);

		let jobCalendarFrom;
		const _fromHour = fromHour || checkin;
		jobCalendarFrom = _fromHour && _fromHour <= RuleDay.to ? moment(from).subtract(1, 'day').toDate() : from;

		this.model('JobCalendar').createByRooms({
			roomIds: [roomId],
			from: jobCalendarFrom,
			to: fromHour ? moment(to).subtract(1, 'day').toDate() : to,
			description: 'Reservate',
		});

		syncAvailablityCalendar(blockId, from, to);
	},

	async reservateRooms(bookingId, blockId, roomIds, from, to, options) {
		await roomIds.asyncForEach(roomId => this.reservate(blockId, roomId, from, to, bookingId, options));
		await this.model('Reservation').initPricing({ bookingId });
	},

	async clearReservations({ bookingId, blockId, rooms, from, to, checkout }) {
		const Reservation = this.model('Reservation');

		rooms = _.compact(_.isArray(rooms) ? rooms : [rooms]);
		rooms = rooms.length ? rooms : await Reservation.getReservateRooms(blockId, bookingId);
		const query = {
			blockId,
			'reservations.bookingId': bookingId,
		};
		if (checkout && from) {
			query.date = { $gte: from.zeroHours() };
		}

		await Reservation.clear(bookingId, rooms, from, to, checkout);

		await this.updateMany(query, {
			$pull: {
				reservations: {
					bookingId,
					roomId: { $in: rooms.toMongoObjectIds() },
				},
			},
		});

		// add sync task
		const booking = await this.model('Booking')
			.findById(bookingId)
			.select('serviceType fromHour listingId')
			.populate('listingId', 'roomIds')
			.lean();
		const fromHour = _.get(booking, 'fromHour');

		if (!rooms.length) {
			const listing = booking && booking.listingId;
			if (listing) {
				rooms = listing.roomIds;
			}
		}

		this.model('JobCalendar').createByRooms({
			roomIds: rooms,
			from: fromHour && fromHour < RuleDay.to ? moment(from).subtract(1, 'day').toDate() : from,
			to: booking.serviceType === Services.Hour ? moment(to).subtract(1, 'day').toDate() : to,
			description: 'Clear Reservation',
		});

		syncAvailablityCalendar(blockId, from, to);
	},

	async cancelBooking(booking) {
		const Reservation = this.model('Reservation');
		const roomIds = await Reservation.getReservateRooms(booking.blockId, booking._id);

		await this.clearReservations({
			bookingId: booking._id,
			blockId: booking.blockId,
			rooms: roomIds,
			from: booking.from,
			to: booking.to,
		});
		await Reservation.initPricing({ bookingId: booking._id });

		return roomIds;
	},

	async getHourLockRooms({ blockId, roomIds, from, fromHour, toHour, locked }) {
		const removeLocks = [];
		const createLocks = [];
		const haveReschedule = await this.findOne({
			blockId,
			date: from,
			'lockedHours.roomId': { $in: roomIds },
		}).lean();
		const lockedHours = _.groupBy(_.get(haveReschedule, 'lockedHours', []), 'roomId');

		// filter avaiable room
		const existRoomIds = locked
			? roomIds.filter(r => {
					const isDuplicate = _.some(
						lockedHours[r],
						res => res.fromHour === fromHour && res.toHour === toHour
					);
					return !isDuplicate;
			  })
			: roomIds;

		if (existRoomIds.length === 0) return { createLocks, removeLocks };

		// expand and create new lockedHour
		existRoomIds.forEach(r => {
			const conflictLockedHours = [];
			const nonConflictLockedHours = [];

			_.forEach(lockedHours[r], res => {
				const isConflict = fromHour <= res.toHour && toHour >= res.fromHour;
				if (isConflict) {
					conflictLockedHours.push(res);
				} else {
					nonConflictLockedHours.push(res);
				}
			});
			createLocks.push(...nonConflictLockedHours); // keep non-conflicting hourlocks

			const isConflictRoomIdsEmpty = conflictLockedHours.length === 0;
			if (isConflictRoomIdsEmpty && locked) createLocks.push({ roomId: r, fromHour, toHour }); //  Create new lock
			// Conflict Locks: Lock
			if (!isConflictRoomIdsEmpty && locked) {
				conflictLockedHours.push({ fromHour, toHour }); // add new locked hour
				createLocks.push({
					roomId: r,
					fromHour: _.minBy(conflictLockedHours, 'fromHour').fromHour,
					toHour: _.maxBy(conflictLockedHours, 'toHour').toHour,
				});
			}
			// Conflict Locks: Unlock
			if (!isConflictRoomIdsEmpty && !locked) {
				const isInRange = (value, inclusivity) =>
					moment(value, 'HH:mm').isBetween(
						moment(fromHour, 'HH:mm'),
						moment(toHour, 'HH:mm'),
						'second',
						inclusivity
					);
				conflictLockedHours.forEach(hLock => {
					const isLockRangeContainUnlockRange = hLock.fromHour < fromHour && toHour < hLock.toHour;
					if (isLockRangeContainUnlockRange) {
						createLocks.push(
							...[
								{
									fromHour: hLock.fromHour,
									toHour: fromHour,
									roomId: r,
								},
								{
									fromHour: toHour,
									toHour: hLock.toHour,
									roomId: r,
								},
							]
						);
					} else {
						const isRFromInRange = isInRange(hLock.fromHour, '[)');
						const isRToInRange = isInRange(hLock.toHour, '[]');
						const isRDuplicate = fromHour === hLock.fromHour && toHour === hLock.toHour;
						const isRRangeInsideInputRange = isRFromInRange && isRToInRange;

						if (!(isRRangeInsideInputRange || isRDuplicate)) {
							createLocks.push({
								fromHour: isRFromInRange ? toHour : hLock.fromHour,
								toHour: isRToInRange ? fromHour : hLock.toHour,
								roomId: r,
							});
						}
					}
				});
			}
		});
		return {
			removeLocks: existRoomIds,
			createLocks,
		};
	},

	async lockRooms({ blockId, roomIds, from, to, fromHour, toHour, type, locked, userId }) {
		roomIds = _.uniqBy(roomIds, _.toString);
		const isHourLock = type === LOCK_TYPE.HOUR;
		if (isHourLock && fromHour === toHour) throw new ThrowReturn('ToHour must greater than fromHour');
		if (isHourLock) to = from;
		const dates = rangeDate(from, to).toArray();
		const updateItems = [];
		if (isHourLock) {
			const { createLocks, removeLocks } = await this.getHourLockRooms({
				blockId,
				roomIds,
				from,
				fromHour,
				toHour,
				locked,
			});

			// Remove old
			if (removeLocks.length > 0) {
				await this.bulkWrite(
					removeLocks.map(roomId => ({
						updateOne: {
							filter: { blockId, date: from },
							update: { $pull: { lockedHours: { roomId } } },
						},
					}))
				);
			}

			// Create new
			if (createLocks.length > 0) {
				await this.bulkWrite(
					createLocks.map(newLock => ({
						updateOne: {
							filter: { blockId, date: from },
							update: {
								$addToSet: {
									lockedHours: {
										roomId: newLock.roomId,
										fromHour: newLock.fromHour,
										toHour: newLock.toHour,
									},
								},
							},
						},
					}))
				);
			}
			updateItems.push({ date: from, roomIds: removeLocks });
		}
		if (!isHourLock) {
			const query = {
				blockId,
				date: { $gte: from, $lte: to },
				'reservations.roomId': { $in: roomIds },
			};

			const haveReschedules = await this.find(query).lean();
			const haveReschedulesObj = _.keyBy(haveReschedules, sch => sch.date.valueOf());
			dates.forEach(date => {
				let rooms = [...roomIds];

				const dateSchedule = haveReschedulesObj[date.valueOf()];
				if (dateSchedule) {
					dateSchedule.reservations = _.keyBy(dateSchedule.reservations, 'roomId');
					rooms = rooms.filter(r => !dateSchedule.reservations[r]);
				}

				if (!rooms.length) return;
				updateItems.push({ date, roomIds: rooms });
			});

			await this.bulkWrite(
				updateItems.map(item => ({
					updateOne: {
						filter: { blockId, date: item.date },
						update: locked
							? { $addToSet: { lockedRoomIds: { $each: item.roomIds } } }
							: { $pullAll: { lockedRoomIds: item.roomIds } },
						upsert: true,
					},
				}))
			);
		}

		const today = new Date();
		if (to >= today.zeroHours() || toHour >= moment(today).format('HH:mm')) {
			this.model('JobCalendar').createByRooms({
				roomIds,
				from,
				to,
				description: locked ? 'Lock Rooms' : 'Open Rooms',
			});
		}

		syncAvailablityCalendar(blockId, from, to);

		const title = locked ? 'Lock Room' : 'Open Room';
		const rangeTxt = isHourLock ? `: ${fromHour} -> ${toHour}` : '';
		const description = `${title}${rangeTxt}`;

		const items = [];

		updateItems.forEach(item => {
			item.roomIds.forEach(roomId => {
				items.push({
					roomId,
					date: item.date,
				});
			});
		});

		await this.model('BlockNotes').addCalendarNotes({
			system: true,
			description,
			userId,
			items,
			blockId,
		});

		return {
			blockId,
			items,
		};
	},

	async countLockDates(blockId, from, to) {
		const result = await this.aggregate([
			{
				$match: {
					blockId: mongoose.Types.ObjectId(blockId),
					date: {
						$gte: from,
						$lte: to,
					},
				},
			},
			{
				$project: {
					lockSize: { $size: { $ifNull: ['$lockedRoomIds', []] } },
				},
			},
			{
				$group: {
					_id: null,
					locks: { $sum: '$lockSize' },
				},
			},
		]);
		return _.get(result, '[0].locks', 0);
	},
};

const model = mongoose.model('BlockScheduler', BlockSchedulerSchema, 'block_scheduler');
module.exports = model;

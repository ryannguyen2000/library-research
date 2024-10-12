const mongoose = require('mongoose');
const _ = require('lodash');
const moment = require('moment');
const urlRegex = require('url-regex');

const { UPLOAD_CONFIG } = require('@config/setting');
const ThrowReturn = require('@core/throwreturn');

const {
	BookingLogs,
	LocalOTA,
	Currency,
	MessageGroupType,
	BookingGuideStatus,
	BookingStatusKeys,
	BookingStatus,
	Services,
	GuestRegisterType,
	OTAsListingConfig,
} = require('@utils/const');
const { newCSEventEmitter, NEWCS_EVENTS } = require('@utils/events');
const { getArray } = require('@utils/query');
const { UserRoles, USER_CONTACT_TYPE } = require('@utils/const');
const { saveImages } = require('@utils/file');
const { updateDoc } = require('@utils/schema');
const { normPhone } = require('@utils/phone');
const { MessageLock } = require('@utils/lock');
const { removeAccents } = require('@utils/generate');
const { Settings } = require('@utils/setting');

const models = require('@models');
const { detectPassport } = require('@services/computerVision');
const restfulBase = require('@routes/restful.base');
const { LOG_FIELDS_LABELS, LOG_VALUES_MAPPER } = require('./const');

async function getGuestInfo(req, res) {
	const { guestId } = req.params;
	const { user } = req.decoded;

	const guest = await models.Guest.findById(guestId)
		.populate('histories.by', 'name username')
		.populate('histories.removedBy', 'name username');

	if (!guest) {
		throw new ThrowReturn('Not found guest!');
	}

	const { filters } = await models.Host.getBlocksOfUser({ user, roomKey: 'reservateRooms' });
	const filter = {
		$and: [filters, { $or: [{ guestId }, { guestIds: guestId }] }],
	};

	const bookings = await models.Booking.find(filter)
		.select('from to price currency status listingId blockId error checkin messages')
		.populate('blockId', 'info.name')
		.populate('listingId', 'OTAs.otaListingName OTAs.otaName');

	let totalPrice = 0;
	let currency = Currency.VND;
	for (const booking of bookings) {
		if (booking.listingId) {
			booking.listingId.OTAs = booking.listingId.OTAs.filter(o => o.otaName === guest.ota);
		}
		if (booking.isAlive()) {
			totalPrice += booking.price;
		}
		({ currency } = booking);
	}

	res.sendData({ guest, bookings, totalPrice, currency });
}

async function updateGuestInfo(req, res) {
	const guest = await models.Guest.findById(req.params.guestId).select('-histories');
	if (!guest) throw new ThrowReturn('Guest not found!');

	const data = req.body;

	if (data.passport && data.passport.length) {
		await data.passport.asyncMap(async (passport, index) => {
			const newUrl = await saveImages(passport, UPLOAD_CONFIG.FOLDER.GUEST);
			if (newUrl !== passport) {
				data.passport[index] = newUrl;
				const csv = await models.CSV.findByUrl(passport)
					.select('data')
					.catch(() => null);
				if (csv) {
					await models.CSV.create({
						data: csv.data,
						url: newUrl,
					});
				}
			}
		});
	}

	if (data.fullName && !OTAsListingConfig[guest.ota]) {
		data.displayName = data.fullName;
	}

	guest.$locals.updatedBy = req.decoded.user._id;

	_.keys(data).forEach(key => {
		_.set(guest.$locals, ['oldData', key], _.get(guest, key));
	});

	await updateDoc(guest, data);

	if (guest.blockIds && guest.blockIds[0]) {
		_.set(req, ['logData', 'blockId'], guest.blockIds[0]);
	}

	res.sendData({ guest: _.pick(guest, _.keys(data)) });
}

async function findGuestIdsByDates(blockIds, type, from, to) {
	from = new Date(from).zeroHours();
	to = new Date(to).zeroHours();

	const filter = {
		status: BookingStatus.CONFIRMED,
		blockId: { $in: blockIds },
	};
	if (type) {
		if (type.includes('checkin')) {
			filter.from = { $gte: from, $lte: to };
		}
		if (type.includes('checkout')) {
			filter.to = { $gte: from, $lte: to };
		}
		if (type.includes('createdAt')) {
			filter.createdAt = { $gte: moment(from).startOf('day').toDate(), $lte: moment(to).endOf('day').toDate() };
		}
	} else {
		filter.from = { $lte: to };
		filter.to = { $gt: from };
	}

	const rs = await models.Booking.aggregate([
		{ $match: filter },
		{
			$group: {
				_id: null,
				guestId: { $addToSet: '$guestId' },
				guestIds: { $push: '$guestIds' },
			},
		},
		{
			$project: {
				guestIds: {
					$setUnion: [
						'$guestId',
						{
							$reduce: {
								input: '$guestIds',
								initialValue: [],
								in: { $setUnion: ['$$value', '$$this'] },
							},
						},
					],
				},
			},
		},
	]);

	return _.get(rs, [0, 'guestIds']) || [];
}

async function getGuests(req, res) {
	let {
		start,
		limit,
		ota,
		name,
		phone,
		blockId,
		type,
		from,
		to,
		nationality,
		hasPassport,
		passportNumber,
		gender,
		country,
	} = req.query;
	let { user } = req.decoded;

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;
	blockId = getArray(blockId);

	const { blockIds } = await models.Host.getBlocksOfUser({ user, filterBlockIds: blockId });

	const filter = {
		active: true,
	};
	if (blockId) {
		filter.blockIds = { $in: blockIds };
	} else {
		filter.$or = [
			{ groupIds: { $in: user.groupIds } },
			{ blockIds: { $in: blockIds } }, //
		];
	}
	if (name) {
		filter.$text = { $search: removeAccents(name) };
	}
	if (phone) {
		filter.phone = normPhone(phone) || phone;
	}
	if (passportNumber) {
		filter.passportNumber = passportNumber;
	}
	if (ota) {
		const otas = await models.BookingSource.getSourceByGroup(ota.split(','));
		filter.ota = { $in: otas };
	}
	if (nationality) {
		const nationalCode = Settings.NationalCode.value;
		filter.country = nationality === GuestRegisterType.National ? nationalCode : { $nin: [null, nationalCode] };
	}
	if (hasPassport) {
		filter['passport.0'] = { $exists: hasPassport === 'true' };
	}
	if (from && to) {
		const guestIds = await findGuestIdsByDates(blockIds, type, from, to);
		filter._id = { $in: guestIds };
	}
	if (gender) {
		filter.gender = gender === 'null' ? null : gender;
	}
	if (country) {
		filter.country = getArray(country);
	}

	const guests = await models.Guest.find(filter)
		.sort(_.pickBy({ score: name ? { $meta: 'textScore' } : null, createdAt: -1 }))
		.limit(limit)
		.skip(start)
		.select(
			_.pickBy({
				score: name ? { $meta: 'textScore' } : null,
				name: 1,
				fullName: 1,
				avatar: 1,
				country: 1,
				ota: 1,
				genius: 1,
				messages: 1,
				phone: 1,
				tags: 1,
				passportNumber: 1,
				passport: 1,
				address: 1,
				gender: 1,
				dayOfBirth: 1,
				displayName: 1,
				ottIds: 1,
				lang: 1,
				represent: 1,
				taxCode: 1,
				position: 1,
			})
		);

	const total = await models.Guest.countDocuments(filter);

	res.sendData({ guests, total });
}

async function getGuestsByDepartment(req, res) {
	const { departmentId, account } = req.params;
	if (!mongoose.Types.ObjectId.isValid(departmentId)) throw new ThrowReturn('DepartmentId invalid');

	const messages = await models.Messages.find({
		departmentId,
		isGroup: true,
		groupType: MessageGroupType.INTERNAL,
	})
		.select('guestId groupType')
		.populate('guestId', 'name displayName ota otaId avatar ottIds');

	const rs = [];

	if (!_.isEmpty(messages)) {
		await messages.asyncMap(msg =>
			models.BlockInbox.findOne({
				ottPhone: account,
				messageId: msg._id,
			}).then(data => {
				if (data) rs.push(msg);
			})
		);
	}

	res.sendData(rs);
}

async function addGuestToBooking(booking, roomId, guestId) {
	if (!booking.guestId.equals(guestId) && !booking.guestIds.includesObjectId(guestId)) {
		booking.guestIds.push(guestId);
		await booking.save();

		await models.Guest.updateOne({ _id: guestId }, { messages: booking.messages });
		await models.Messages.updateOne({ _id: booking.messages }, { $addToSet: { guestIds: guestId } });
	}

	await models.Reservation.updateMany(
		{ bookingId: booking._id, 'guests.guestId': guestId },
		{ $pull: { guests: { guestId } } }
	);

	const reservation = await models.Reservation.findOne(_.pickBy({ bookingId: booking._id, roomId }));
	if (reservation) {
		reservation.guests = _.uniqBy([...(reservation.guests || []), { guestId }], g => g.guestId.toString());
		await reservation.save();
	}
}

async function addGuestToBookingRoom(bookingId, roomId, guestId) {
	guestId = mongoose.Types.ObjectId(guestId);
	bookingId = mongoose.Types.ObjectId(bookingId);

	const booking = await models.Booking.findById(bookingId).select(
		'blockId messages guestId guestIds groupIds serviceType'
	);

	await addGuestToBooking(booking, roomId, guestId);

	if (booking.serviceType === Services.Month) {
		const contract = await models.BookingContract.findOne({ bookingIds: booking._id });
		if (contract) {
			const bookings = await models.Booking.find({
				_id: { $in: contract.bookingIds, $ne: booking._id },
				status: BookingStatus.CONFIRMED,
				guestIds: { $ne: guestId },
				checkin: null,
			}).select('blockId messages guestId guestIds groupIds serviceType');

			await bookings.asyncMap(async b => {
				await addGuestToBooking(b, roomId, guestId);
			});
		}
	}
}

async function removeGuestFromBooking(booking, guestId) {
	if (!guestId) {
		throw new ThrowReturn('guestId empty');
	}

	guestId = mongoose.Types.ObjectId(guestId);
	booking.guestIds = booking.guestIds.filter(gId => !gId.equals(guestId));

	await booking.save();
	await models.Reservation.updateMany({ bookingId: booking._id }, { $pull: { guests: { guestId } } });

	if (booking.serviceType === Services.Month) {
		const contract = await models.BookingContract.findOne({ bookingIds: booking._id });
		if (contract) {
			const bookings = await models.Booking.find({
				_id: { $in: contract.bookingIds, $ne: booking._id },
				status: BookingStatus.CONFIRMED,
				guestIds: guestId,
				checkin: null,
			}).select('blockId messages guestId guestIds groupIds serviceType');

			await bookings.asyncMap(async b => {
				b.guestIds = b.guestIds.filter(gId => !gId.equals(guestId));
				await b.save();
				await models.Reservation.updateMany({ bookingId: b._id }, { $pull: { guests: { guestId } } });
			});
		}
	}
}

async function createGuest(req, res) {
	const { bookingId, roomId } = req.query;
	const data = req.body;

	if (!data.otaId) data.otaId = data.phone || Date.now();
	if (!data.ota) data.ota = LocalOTA;
	data.groupIds = req.decoded.user.groupIds;

	const guest = await models.Guest.create(data);
	await addGuestToBookingRoom(bookingId, mongoose.Types.ObjectId.isValid(roomId) ? roomId : null, guest._id);

	res.sendData({ guest });
}

async function addToBooking(req, res) {
	const { guestId, bookingId } = req.params;
	const { roomId } = req.query;

	await addGuestToBookingRoom(bookingId, roomId, guestId);

	res.sendData();
}

async function removeFromBooking(req, res) {
	await removeGuestFromBooking(req.data.booking, req.params.guestId);

	res.sendData();
}

async function getHistory(req, res) {
	const { guestId } = req.params;

	const histories = await models.Guest.getHistories(guestId);

	res.sendData({ histories });
}

async function createHistory(req, res) {
	const { guestId } = req.params;
	const { description, images } = req.body;

	const histories = await models.Guest.addHistory(guestId, req.decoded.user._id, description, images);

	res.sendData({ histories });
}

async function updateHistory(req, res) {
	const { guestId, historyId } = req.params;

	const histories = await models.Guest.updateHistory(req.decoded.user._id, guestId, historyId, req.body);

	res.sendData({ histories });
}

async function removeHistory(req, res) {
	const { guestId, historyId } = req.params;

	const histories = await models.Guest.removedHistory(req.decoded.user._id, guestId, historyId);

	res.sendData({ histories });
}

async function getGuestByPhone(req, res) {
	const { phone } = req.query;
	const { user } = req.decoded;

	const owner = await models.User.findOne({
		phone: normPhone(phone),
		role: { $in: [UserRoles.CDT_HOST, UserRoles.CDT_OWNER, UserRoles.CDT_OWNER_ND, UserRoles.CDT_TA] },
	}).lean();
	if (owner) {
		const blockUser = await models.HostBlock.findOne({ userId: owner._id })
			.populate('blockId', 'info.name')
			.populate('roomIds', 'info.roomNo')
			.lean();
		const guest = await models.Guest.findOne({
			phone: normPhone(phone),
			userType: { $in: [USER_CONTACT_TYPE.OWNER, USER_CONTACT_TYPE.HOST] },
		}).select('messages');
		_.assign(owner, { ...blockUser, messageId: guest.messages });
	}

	if (!phone) {
		throw new ThrowReturn('phone is required!');
	}

	const guests = await models.Guest.findWithPhoneNumber(null, phone, true);
	if (!guests || !guests.length) return res.sendData({ reservations: [] });

	const guestIds = _.map(guests, '_id');

	const { filters } = await models.Host.getBlocksOfUser({ user, roomKey: 'reservateRooms' });

	const match = {
		$and: [
			filters,
			{
				$or: [{ guestId: { $in: guestIds } }, { guestIds: { $in: guestIds } }],
			},
		],
	};
	const reservations = await models.Booking.findBestMatchBookings({
		match,
		project: `otaName otaBookingId from to price currency status blockId messages guestId reservateRooms ${_.values(
			BookingStatusKeys
		).join(' ')}`,
	});

	if (reservations.length) {
		await models.Booking.populate(reservations, [
			{
				path: 'blockId',
				select: 'info.name info.shortName',
			},
			{
				path: 'guestId',
				select: 'name fullName displayName avatar',
			},
			{
				path: 'reservateRooms',
				select: 'info.name info.roomNo',
			},
		]);
	}

	res.sendData({
		guest: guests[0],
		reservations,
		owner,
	});
}

async function getTags(req, res) {
	let { start, limit, keyword } = req.query;

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	const query = {};
	if (_.trim(keyword)) {
		query.name = new RegExp(_.escapeRegExp(_.trim(keyword)), 'i');
	}

	const [data, total] = await Promise.all([
		models.GuestTag.find(query).select('name').skip(start).limit(limit),
		models.GuestTag.countDocuments(query),
	]);

	res.sendData({ data, total });
}

async function createTag(req, res) {
	const name = _.trim(req.body.name);

	let tag = await models.GuestTag.findOne({ name: new RegExp(`^${_.escapeRegExp(name)}$`, 'i') });
	if (!tag) {
		tag = await models.GuestTag.create(req.body);
	}

	res.sendData(tag);
}

async function updateTag(req, res) {
	const { id } = req.params;
	const { tags } = req.body;
	const tag = await models.Guest.findOneAndUpdate({ _id: id }, { tags }, { new: true, runValidators: true });
	res.sendData(tag);
}

function mergeG(guest1, guest2) {
	const data = {};
	const GuestIgnoreKeys = ['ota', 'otaId', 'messages', '_id', 'createdAt', 'updatedAt', '__v', 'displayName'];

	_.keys(guest1).forEach(key => {
		if (GuestIgnoreKeys.includes(key)) {
			return;
		}

		const a = _.get(guest1, key);
		const b = _.get(guest2, key);

		if (a) {
			if (_.isArray(a)) {
				data[key] = _.chain(a).concat(b).uniq().value();
			} else if (typeof a === 'object' && !(a instanceof Date) && !mongoose.Types.ObjectId.isValid(a)) {
				data[key] = _.merge(b, _.pickBy(a));
			} else {
				data[key] = a;
			}
		}
	});
	data.histories = (data.histories || []).sort((a, b) => a.createdAt - b.createdAt);

	return data;
}

// merge guest1 to guest2 then remove guest1
async function mergeGuest(guest1, guest2Id) {
	const guest2 = await models.Guest.findById(guest2Id);

	const data = mergeG(guest1.toJSON(), guest2.toJSON());
	_.assign(guest2, data);

	await guest2.save();
	// await models.Guest.updateOne({ _id: guest2._id }, { $set: data });
	await models.Guest.updateOne({ _id: guest1._id }, { $set: { active: false, linkedId: guest2._id } });
}

async function linkGuestToBookingRoom(guestId, messageId, linkInfo = {}, userId) {
	const guest = await models.Guest.findById(guestId);
	if (!guest) {
		throw new ThrowReturn(`Not found guest ${guestId}`);
	}

	const rs = await MessageLock.acquire(`${guest.ota}_ott_received_handler`, async () => {
		const message = await models.Messages.findById(messageId);
		if (!message) {
			throw new ThrowReturn(`Not found message ${messageId}`);
		}

		const linkBooking = await models.Booking.findById(linkInfo.bookingId).select('-histories');
		if (!linkBooking) {
			throw new ThrowReturn(`Not found booking ${linkInfo.bookingId}`);
		}

		if (linkInfo.guestId) {
			if (linkInfo.guestId === guestId) {
				// throw new ThrowReturn(`No needed!`);
			} else {
				linkInfo.guestId = mongoose.Types.ObjectId(linkInfo.guestId);
				await mergeGuest(guest, linkInfo.guestId);
			}
		} else {
			await addGuestToBookingRoom(linkInfo.bookingId, linkInfo.roomId, guestId);
		}

		const preInbox = await models.BlockInbox.findOne({ messageId: message._id });

		if (linkBooking.messages.toString() !== messageId) {
			// remove
			await models.BlockInbox.deleteMany({ messageId: message._id });
			await models.Messages.deleteOne({ _id: message._id });
		}

		// update _inbox
		await models.BlockInbox.updateMany(
			{
				$or: [{ bookingId: linkBooking._id }, { messageId: linkBooking.messages }],
			},
			{
				read: false,
				ottPhone: preInbox.ottPhone,
				ottSource: preInbox.ottSource,
				updatedAt: new Date(),
			}
		);

		if (
			linkBooking.guideStatus === BookingGuideStatus.CantContact ||
			linkBooking.guideStatus === BookingGuideStatus.WaitingForResponse
		) {
			newCSEventEmitter.emit(NEWCS_EVENTS.UPDATE_STATUS, linkBooking, {
				guideStatus: BookingGuideStatus.Responding,
				display: true,
			});
		}

		await models.Booking.addLog({
			bookingId: linkInfo.bookingId,
			userId,
			action: BookingLogs.GUEST_LINKED,
			prevData: guestId,
			data: linkInfo.guestId,
		});

		return linkBooking.messages;
	});

	return rs;
}

async function link(req, res) {
	const { guestId } = req.params;

	const messageId = await linkGuestToBookingRoom(guestId, req.query.messageId, req.body, req.decoded.user._id);

	res.sendData({ messageId });
}

async function CSVDetect(req, res) {
	const { url, guestId } = req.body;
	const isValid = urlRegex().test(url);
	if (!isValid) throw new ThrowReturn('Url is not valid!');

	let doc = await models.CSV.findByUrl(url);
	if (doc) {
		doc.called++;
		await doc.save();
	} else {
		const data = await detectPassport(url);

		if (data.data) delete data.data.image;
		if (data.errorCode === '2') {
			throw new ThrowReturn(data.errorMessage);
		}

		doc = await models.CSV.create({ url, data });
	}

	if (guestId && mongoose.Types.ObjectId.isValid(guestId)) {
		const guest = await models.Guest.findById(guestId).select('blockIds');
		if (guest && guest.blockIds) {
			_.set(req, ['logData', 'blockId'], guest.blockIds[0]);
		}
	}

	res.sendData(doc.getData());
}

async function getDataPassport(req, res) {
	const { skip = 0, limit = 50 } = req.query;

	const query = {
		// url: new RegExp(`^${_.escapeRegExp(URL_CONFIG.SERVER)}`),
	};

	const data = await models.CSV.find(query)
		.sort({ $natural: -1 })
		.skip(parseInt(skip))
		.limit(parseInt(limit))
		.select('url data -_id');
	const total = await models.CSV.countDocuments(query);

	res.json({
		data,
		total,
	});
}

async function getBLs(req, res) {
	req.query.groupIds = { $in: req.decoded.user.groupIds };
	await restfulBase.list(req, res, {
		Model: models.GuestBlacklist,
		name: 'blacklist',
		module: {},
	});
}

async function getBL(req, res) {
	await restfulBase.view(req, res, {
		Model: models.GuestBlacklist,
		name: 'blacklist',
		module: {},
	});
}

async function createBL(req, res) {
	_.set(req.body, ['blacklist', 'groupIds'], req.decoded.user.groupIds);

	await restfulBase.create(req, res, {
		Model: models.GuestBlacklist,
		name: 'blacklist',
		module: {},
	});
}

async function updateBL(req, res) {
	await restfulBase.modify(req, res, {
		Model: models.GuestBlacklist,
		name: 'blacklist',
		module: {},
	});
}

async function deleteBL(req, res) {
	await restfulBase.del(req, res, {
		Model: models.GuestBlacklist,
		name: 'blacklist',
		module: {},
	});
}

function parseVal(val, field, language) {
	if (val === undefined || val === null) return '';
	if (_.isBoolean(val)) {
		return _.get(LOG_VALUES_MAPPER, [val, language], val);
	}

	if (_.isDate(val)) {
		return moment(val).format('DD/MM/YYYY');
	}

	return _.get(LOG_VALUES_MAPPER, [field, val, language], val);
}

async function parseLog(log, language) {
	const txt = `${_.get(LOG_FIELDS_LABELS[log.field], language, log.field)}: ${parseVal(
		log.oldData,
		log.field,
		language
	)} -> ${parseVal(log.newData, log.field, language)}`;

	if (!log.by) {
		log.by = {
			name: 'Hệ thống',
			_id: 0,
		};
	}

	return {
		...log,
		parsed: txt,
	};
}

async function getLogs(req, res) {
	const { guestId } = req.params;
	const guest = await models.Guest.findById(guestId).select('logs').populate('logs.by', 'name username').lean();
	if (!guest) {
		throw new ThrowReturn('Guest not found');
	}

	const logs = guest.logs ? await guest.logs.asyncMap(log => parseLog(log, req.language)) : [];

	res.sendData({ logs: logs.reverse() });
}

module.exports = {
	getGuests,
	getGuestsByDepartment,
	getGuestInfo,
	getGuestByPhone,
	createGuest,
	getTags,
	createTag,
	updateTag,

	getBLs,
	getBL,
	createBL,
	updateBL,
	deleteBL,

	getDataPassport,
	updateGuestInfo,
	CSVDetect,

	getHistory,
	createHistory,
	updateHistory,
	removeHistory,
	link,
	addToBooking,
	removeFromBooking,
	addGuestToBookingRoom,
	getLogs,
};

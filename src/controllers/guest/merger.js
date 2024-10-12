const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

const GROUP_KEYS = ['phone', 'fullName', 'passportNumber', 'email'];

async function getGroups(req, res) {
	let { groupKey, sortBy, sortType, start, limit, keyword, phone, passportNumber, minTotal } = req.query;

	if (!GROUP_KEYS.includes(groupKey)) {
		throw new ThrowReturn('Key không hợp lệ!');
	}

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;
	minTotal = parseInt(minTotal);

	const filter = {
		active: true,
		groupIds: { $in: req.decoded.user.groupIds },
		groupKey: { $nin: ['', null] },
	};
	if (phone) {
		filter.phone = new RegExp(_.escapeRegExp(phone));
	}
	if (keyword) {
		filter.fullName = new RegExp(_.escapeRegExp(keyword), 'i');
	}
	if (passportNumber) {
		filter.passportNumber = new RegExp(_.escapeRegExp(passportNumber));
	}

	const filterPipeline = [
		{
			$match: filter,
		},
		{
			$group: {
				_id: `$${groupKey}`,
				total: { $sum: 1 },
			},
		},
	];
	if (minTotal) {
		filterPipeline.push({
			$match: {
				total: { $gte: minTotal },
			},
		});
	}

	const sortPipeline = [];
	if (sortBy) {
		sortPipeline.push({
			$sort: {
				[sortBy]: sortType === 'asc' ? 1 : -1,
			},
		});
	}

	const groups = await models.Guest.aggregate([
		...filterPipeline,
		...sortPipeline,
		{
			$skip: start,
		},
		{
			$limit: limit,
		},
	]);

	const total = await models.Guest.aggregate([
		...filterPipeline,
		{
			$group: { _id: null, total: { $sum: 1 } },
		},
	]);

	res.sendData({ groups, total: _.get(total, [0, 'total'], 0) });
}

async function getGuestsByKey(req, res) {
	const { key, value } = req.query;

	const guests = await models.Guest.find({
		active: true,
		groupIds: { $in: req.decoded.user.groupIds },
		[key]: value,
	})
		.select('displayName fullName name avatar ota passportNumber phone email')
		.sort({ pointInfo: -1, createdAt: -1 })
		.lean();

	res.sendData({
		guests,
	});
}

async function findGuestsData(guestIds) {
	const bookings = await models.Booking.find({
		$or: [
			{
				guestId: { $in: guestIds },
			},
			{
				guestIds: { $in: guestIds },
			},
		],
	})
		.select('_id guestId guestIds')
		.lean();

	const messages = await models.Messages.find({
		$or: [
			{
				guestId: { $in: guestIds },
			},
			{
				guestIds: { $in: guestIds },
			},
		],
	})
		.select('_id guestId guestIds')
		.lean();

	const bookingsObj = {};
	const msgObj = {};

	bookings.forEach(booking => {
		bookingsObj[booking.guestId] = bookingsObj[booking.guestId] || [];
		bookingsObj[booking.guestId].push(booking._id);
		_.forEach(booking.guestIds, guestId => {
			bookingsObj[guestId] = bookingsObj[guestId] || [];
			bookingsObj[guestId].push(booking._id);
		});
	});
	messages.forEach(msg => {
		msgObj[msg.guestId] = msgObj[msg.guestId] || [];
		msgObj[msg.guestId].push(msg._id);
		_.forEach(msg.guestIds, guestId => {
			msgObj[guestId] = msgObj[guestId] || [];
			msgObj[guestId].push(msg._id);
		});
	});

	return {
		bookingsObj,
		msgObj,
	};
}

async function mergeGuests(req, res) {
	const { user } = req.decoded;
	const data = req.body;

	const target = await models.Guest.findOne({ _id: data.targetId, active: true });
	if (!target) {
		throw new ThrowReturn('Không tìm thấy thông tin khách hàng!');
	}

	data.guestIds = data.guestIds.filter(guestId => guestId !== data.targetId);

	const guests = await models.Guest.find({
		_id: data.guestIds,
		active: true,
	});
	if (!guests.length) {
		throw new ThrowReturn('Danh sách khách hàng trống!');
	}
	if (guests.length !== data.guestIds.length) {
		throw new ThrowReturn('Danh sách khách hàng không hợp lệ!');
	}

	const merger = new models.GuestMerger({
		createdBy: user._id,
		targetId: target._id,
		targetData: target.toJSON(),
		groupIds: user.groupIds,
		mergerConditions: data.mergerConditions,
		guests: [],
	});

	const bookingBulks = [];
	const messageBulks = [];
	const reservationBulks = [];
	const inboxBulks = [];
	const guestIds = _.map(guests, '_id');

	const { bookingsObj, msgObj } = await findGuestsData(guestIds);

	guests.forEach(guest => {
		const bulks = [
			{
				updateMany: {
					filter: { guestId: guest._id },
					update: { $set: { guestId: target._id } },
				},
			},
			{
				updateMany: {
					filter: { guestIds: guest._id },
					update: { $set: { 'guestIds.$[]': target._id } },
					multi: true,
				},
			},
		];

		bookingBulks.push(...bulks);
		messageBulks.push(...bulks);

		const bookingIds = bookingsObj[guest._id] || [];
		const messageIds = msgObj[guest._id] || [];

		if (bookingIds.length) {
			reservationBulks.push({
				updateMany: {
					filter: { bookingId: { $in: bookingIds }, 'guests.guestId': guest._id },
					update: { $set: { 'guests.$.guestId': target._id } },
					multi: true,
				},
			});
		}
		if (messageIds.length) {
			inboxBulks.push({
				updateMany: {
					filter: { messageId: { $in: messageIds } },
					update: { $set: { guestId: target._id } },
					multi: true,
				},
			});
		}

		merger.guests.push({
			bookingIds,
			messageIds,
		});

		mergeGuest(target, guest);
	});

	await merger.save();
	await target.save();

	await models.Booking.bulkWrite(bookingBulks);
	await models.Reservation.bulkWrite(reservationBulks);
	await models.Messages.bulkWrite(messageBulks);
	await models.BlockInbox.bulkWrite(inboxBulks);

	await models.Guest.updateMany({ _id: { $in: guestIds } }, { active: false });

	await models.BlockInbox.updateKeyword({ guestId: { $in: guestIds } });

	res.sendData();
}

function mergeGuest(target, guest) {
	const singleValKeys = [
		'displayName',
		'taxCode',
		'represent',
		'position',
		'name',
		'fullName',
		'email',
		'phone',
		'country',
		'avatar',
		'lang',
		'passportNumber',
		'address',
		'gender',
		'dayOfBirth',
		'addressProvince',
		'addressDistrict',
		'addressWard',
		'hometownProvince',
		'hometownDistrict',
		'hometownWard',
		'isVip',
		'genius',
	];

	singleValKeys.forEach(key => {
		if (target[key]) {
			return;
		}
		if (guest[key]) target[key] = guest[key];
	});

	if (guest.tags) target.tags = _.uniq([...target.tags, ...guest.tags]);
	if (guest.histories) {
		target.histories.push(...guest.histories);
		target.histories.sort((a, b) => a.createdAt - b.createdAt);
	}
	if (guest.otaIds) {
		target.otaIds = _.uniqBy([...target.otaIds, ...guest.otaIds], o => o.ota + o.otaId);
	}
	if (!target.passport || target.passport.length < 4) {
		target.passport = _.uniq(_.compact([...target.passport, ...guest.passport]));
	}
	_.forEach(guest.ottIds, (ottId, ott) => {
		if (!_.has(target, ['ottIds', ott])) {
			_.set(target, ['ottIds', ott], ottId);
		}
		target.otts = target.otts || [];
		if (!target.otts.find(o => o.ott === ott && o.ottId === ottId)) {
			target.otts.push({ ottId, ott });
		}
	});

	return target;
}

async function rollbackMerger(req, res) {
	const { user } = req.decoded;
	const { id } = req.params;

	const merger = await models.GuestMerger.findOne({ _id: id, rollback: { $ne: true } });
	if (!merger) {
		throw new ThrowReturn('Thao tác không hợp lệ!');
	}

	const target = await models.Guest.findOne({ _id: merger.targetId, active: true });
	if (!target) {
		throw new ThrowReturn('Khách hàng gốc đã được gộp vào khách khác!');
	}

	const bookingBulks = [];
	const reservationBulks = [];
	const messageBulks = [];
	const inboxBulks = [];

	merger.guests.forEach(guest => {
		if (guest.bookingIds.length) {
			bookingBulks.push(
				{
					updateMany: {
						filter: { _id: { $in: guest.bookingIds }, guestId: target._id },
						update: { $set: { guestId: guest.guestId } },
					},
				},
				{
					updateMany: {
						filter: { _id: { $in: guest.bookingIds }, guestIds: target._id },
						update: { $set: { 'guestIds.$[]': guest.guestId } },
						multi: true,
					},
				}
			);
			reservationBulks.push({
				updateMany: {
					filter: { bookingId: { $in: guest.bookingIds }, 'guests.guestId': target._id },
					update: { $set: { 'guests.$.guestId': guest.guestId } },
					multi: true,
				},
			});
		}
		if (guest.messageIds.length) {
			messageBulks.push(
				{
					updateMany: {
						filter: { _id: { $in: guest.messageIds }, guestId: target._id },
						update: { $set: { guestId: guest.guestId } },
					},
				},
				{
					updateMany: {
						filter: { _id: { $in: guest.messageIds }, guestIds: target._id },
						update: { $set: { 'guestIds.$[]': guest.guestId } },
						multi: true,
					},
				}
			);
			inboxBulks.push({
				updateMany: {
					filter: { messageId: { $in: guest.messageIds } },
					update: { $set: { guestId: guest.guestId } },
				},
			});
		}
	});

	merger.rollback = true;
	merger.rollbackBy = user._id;
	merger.rollbackAt = new Date();
	await merger.save();

	_.assign(target, merger.targetData);
	await target.save();

	if (bookingBulks.length) await models.Booking.bulkWrite(bookingBulks);
	if (reservationBulks.length) await models.Reservation.bulkWrite(reservationBulks);
	if (messageBulks.length) await models.Messages.bulkWrite(messageBulks);
	if (inboxBulks.length) await models.BlockInbox.bulkWrite(inboxBulks);

	const guestIds = _.map(merger.guests, 'guestId');

	await models.Guest.updateMany({ _id: { $in: guestIds } }, { active: true });

	await models.BlockInbox.updateKeyword({ guestId: { $in: guestIds } });

	res.sendData();
}

async function getHistories(req, res) {
	const start = parseInt(req.query.start) || 0;
	const limit = parseInt(req.query.limit) || 10;

	const filter = { groupIds: { $in: req.decoded.user.groupIds }, rollback: { $ne: true } };
	if (req.query.from) {
		_.set(filter, ['createdAt', '$gte'], moment(req.query.from).startOf('day').toDate());
	}
	if (req.query.to) {
		_.set(filter, ['createdAt', '$lte'], moment(req.query.to).endOf('day').toDate());
	}
	if (req.query.mergerKey) {
		filter['mergerConditions.key'] = req.query.mergerKey;
	}

	const data = await models.GuestMerger.find(filter)
		.skip(start)
		.limit(limit)
		.populate('createdBy', 'user username')
		.lean();
	const total = await models.GuestMerger.countDocuments(filter);

	res.sendData({ data, total });
}

module.exports = {
	getGroups,
	getGuestsByKey,
	mergeGuests,
	rollbackMerger,
	getHistories,
};

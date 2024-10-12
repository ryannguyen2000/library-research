const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { GUEST_GROUP_KEYS, GUEST_GROUP_LAST_TIME } = require('@utils/const');
const { normPhone } = require('@utils/phone');
const models = require('@models');

async function getGroups(req, res) {
	let { groupKey, sortKey, start, limit, keyword, minTotal, maxTotal } = req.query;

	if (!GUEST_GROUP_KEYS.includes(groupKey)) {
		throw new ThrowReturn('Key không hợp lệ!');
	}

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 1;
	minTotal = parseInt(minTotal);
	maxTotal = parseInt(maxTotal) || 100;

	const filter = {
		groupKey,
		total: { $gt: 0 },
	};

	if (keyword) {
		filter.groupValue = new RegExp(_.escapeRegExp(keyword), 'i');
	}

	if (minTotal) {
		_.set(filter, ['total', '$gte'], minTotal);
	}
	if (maxTotal) {
		_.set(filter, ['total', '$lte'], maxTotal);
	}

	const [groups, total] = await Promise.all([
		models.GuestGroup.find(filter).sort({ total: -1, _id: 1 }).skip(start).limit(limit).lean(),
		models.GuestGroup.countDocuments(filter),
	]);

	await groups.asyncMap(async group => {
		group._id = group.groupValue;

		group.guests = await models.Guest.aggregate()
			.match({
				active: true,
				merged: false,
				[group.groupKey]: group.groupValue,
				createdAt: { $lt: GUEST_GROUP_LAST_TIME },
			})
			.group({
				_id: `$${sortKey || 'fullName'}`,
				guests: { $push: '$$ROOT' },
				total: { $sum: 1 },
			})
			.sort({
				total: -1,
				_id: -1,
			})
			.unwind('$guests')
			.project({
				_id: '$guests._id',
				phone: '$guests.phone',
				fullName: '$guests.fullName',
				displayName: '$guests.displayName',
				passportNumber: '$guests.passportNumber',
				email: '$guests.email',
				country: '$guests.country',
				gender: '$guests.gender',
				dayOfBirth: '$guests.dayOfBirth',
				address: '$guests.address',
				createdAt: '$guests.createdAt',
			});
		// .project('_id phone fullName displayName passportNumber email country gender dayOfBirth address createdAt');
	});

	res.sendData({
		groups,
		total,
	});
}

async function getGuestsByKey(req, res) {
	let { phone, start, limit, name, passportNumber } = req.query;

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	const filter = {
		groupIds: { $in: req.decoded.user.groupIds },
	};
	if (phone) {
		filter.phone = normPhone(phone);
	}
	if (name) {
		filter.fullName = new RegExp(_.escapeRegExp(name), 'i');
	}
	if (passportNumber) {
		filter.passportNumber = new RegExp(_.escapeRegExp(passportNumber));
	}

	const newGuests = await models.GuestV2.find(filter)
		.limit(limit)
		.skip(start)
		.select(
			'avatar displayName ota phone fullName name gender dayOfBirth country passportNumber email guests.guestId guests.estimate guests.rollback'
		)
		.populate(
			'guests.guestId',
			'avatar displayName ota phone fullName name gender dayOfBirth country passportNumber email'
		)
		.sort({ createdAt: -1 })
		.lean();

	const total = await models.GuestV2.countDocuments(filter);

	res.sendData({
		guests: newGuests,
		total,
	});
}

async function mergeGuests(req, res) {
	const { user } = req.decoded;
	const data = req.body;

	const guestIds = data.guests.map(item => item._id);

	const guests = await models.Guest.find({
		_id: guestIds,
		merged: false,
	});

	if (!guests.length) {
		throw new ThrowReturn('Danh sách khách hàng trống!');
	}
	if (guests.length !== data.guests.length) {
		throw new ThrowReturn('Danh sách khách hàng không hợp lệ!');
	}

	const existedNewGuest = data.targetId ? await models.GuestV2.findOne({ _id: data.targetId }) : null;

	const oldGuests = existedNewGuest
		? guests
		: _.sortBy(guests, doc => (doc._id.toString() !== data.targetId ? 1 : 0));

	const newGuests = data.guests;
	const newGuest = await mergeGuest(oldGuests, newGuests, existedNewGuest);

	if (existedNewGuest) {
		_.assign(existedNewGuest, newGuest);
		await existedNewGuest.save();
	} else {
		newGuest.createdBy = user._id;
		await models.GuestV2.create(newGuest);
	}

	await models.GuestGroup.syncGuestIds(_.map(guests, '_id'), true);

	res.sendData();
}

async function mergeGuest(guests, newGuests, merger) {
	const result = {};

	let tags = _.get(merger, 'tags') || [];
	let passport = _.get(merger, 'passport') || [];
	let otaIds = _.get(merger, 'otaIds') || [];
	let histories = _.get(merger, 'histories') || [];
	let otts = _.get(merger, 'otts') || [];
	let oldGuests = _.get(merger, 'guests') || [];

	const singleValKeys = [
		'phone',
		'fullName',
		'name',
		'displayName',
		'dayOfBirth',
		'gender',
		'country',
		'passportNumber',
		'taxCode',
		'email',
		'represent',
		'position',
		'avatar',
		'lang',
		'address',
		'addressProvince',
		'addressDistrict',
		'addressWard',
		'hometownProvince',
		'hometownDistrict',
		'hometownWard',
		'isVip',
		'genius',
		'blockIds',
		'groupIds',
	];

	const guestIds = _.map(guests, '_id');

	guests.forEach(guest => {
		singleValKeys.forEach(key => {
			if (!guest[key] || result[key] || (merger && merger[key])) {
				return;
			}
			if (guest[key]) result[key] = guest[key];
		});

		const estimateGuest = _.find(newGuests, gs => guest._id.equals(gs._id));

		oldGuests.push({
			guestId: guest._id,
			estimate: _.get(estimateGuest, 'estimate') || false,
		});

		if (guest.tags) {
			tags.push(...guest.tags);
		}
		if (guest.passport) {
			passport.push(...guest.passport);
		}
		if (guest.otaIds) {
			otaIds.push(...guest.otaIds);
		}
		if (guest.histories) {
			histories.push(...guest.histories);
			histories.sort((a, b) => a.createdAt - b.createdAt);
		}
		_.forEach(guest.ottIds, (ottId, ott) => {
			otts = otts || [];
			if (ottId && !otts.find(o => o.ott === ott && o.ottId === ottId)) {
				otts.push({ ottId, ott });
			}
		});
	});

	result.tags = _.uniq(tags);
	result.passport = _.uniq(passport);
	result.otaIds = _.uniqBy(otaIds, o => o.ota + o.otaId);
	result.histories = histories;
	result.otts = otts;
	result.guests = oldGuests;

	await models.Guest.updateMany({ _id: { $in: guestIds } }, { merged: true });

	return result;
}

async function rollbackMerger(req, res) {
	const data = req.body;
	const { id } = req.params;

	const existedMerger = await models.GuestV2.findOne({ _id: id });
	if (!existedMerger) {
		throw new ThrowReturn('Thao tác không hợp lệ!');
	}

	let rollBackGuestIds;
	let canDelete = false;

	if (data.guestId) {
		const guest = existedMerger.guests.find(g => g.guestId.equals(data.guestId));
		if (!guest) {
			throw new ThrowReturn('Thao tác không hợp lệ!');
		}

		canDelete = existedMerger.guests.length === 1;

		rollBackGuestIds = [guest.guestId];
	} else {
		canDelete = true;

		rollBackGuestIds = _.map(existedMerger.guests, 'guestId');
	}

	if (canDelete) {
		await models.GuestV2.deleteOne({ _id: id });
	} else {
		await models.GuestV2.updateOne({ _id: id }, { $pull: { guests: { guestId: { $in: rollBackGuestIds } } } });
	}

	await models.Guest.updateMany({ _id: { $in: rollBackGuestIds } }, { merged: false });

	await models.GuestGroup.syncGuestIds(rollBackGuestIds);

	res.sendData();
}

async function updateGuestMerger(req, res) {
	const existedMerger = await models.GuestV2.findById(req.params.id).select('-histories');
	if (!existedMerger) throw new ThrowReturn('Guest not found!');

	const data = req.body;

	_.assign(existedMerger, data);
	await existedMerger.save();

	res.sendData({ guest: existedMerger });
}

module.exports = {
	getGroups,
	mergeGuests,
	rollbackMerger,
	getGuestsByKey,
	updateGuestMerger,
	mergeGuest,
};

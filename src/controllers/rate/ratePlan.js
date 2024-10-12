// const mongoose = require('mongoose');
const _ = require('lodash');

// const { logger } = require('@utils/logger');
const { OTAs, ROOM_GROUP_TYPES, Services } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

async function getRatePlans(user, query) {
	const filter = { blockId: query.blockId };

	if (query.active) {
		filter.active = query.active === 'true';
	}
	if (query.roomTypeId) {
		filter.roomTypeIds = query.roomTypeId;
	}
	if (query.pricingType) {
		filter.pricingType = parseInt(query.pricingType);
	}
	if (query.serviceType) {
		const serviceType = _.isArray(query.serviceType)
			? _.map(query.serviceType, _.toNumber)
			: [parseInt(query.serviceType)];

		filter.serviceType = serviceType.includes(Services.Night) ? [...serviceType, Services.Day] : serviceType;
	}
	if (query.roomIds) {
		const roomTypes = await models.RoomType.find({
			roomIds: _.isArray(query.roomIds) ? { $in: query.roomIds } : query.roomIds,
			deleted: false,
		}).select('_id');

		filter.roomTypeIds = { $in: _.map(roomTypes, '_id') };
	}

	let ratePlans = await models.RatePlan.find(filter).populate([
		{
			path: 'policies.policyId',
		},
		{
			path: 'createdBy',
			select: 'name',
		},
	]);

	if (query.showRevenue === 'true') {
		await ratePlans.asyncMap(async ratePlan => {
			ratePlan.totalRevenues = await ratePlan.getTotalRevenues();
		});
	}
	if (query.rateType === 'walkin' || query.showOTA === 'true') {
		await ratePlans.asyncMap(async ratePlan => {
			const otas = await ratePlan.getActiveOTAs({ roomTypeId: query.roomTypeId });
			ratePlan.otas = _.uniq(_.map(otas, 'otaName'));
		});
	}
	if (query.rateType === 'walkin') {
		const newRatePlans = ratePlans.filter(t => t.otas.includes(OTAs.Cozrum));
		if (newRatePlans.length) {
			ratePlans = newRatePlans;
		}
	}

	return {
		ratePlans,
	};
}

async function createRatePlan(user, data) {
	const ratePlan = await models.RatePlan.create({ ...data, createdBy: user._id });

	return {
		ratePlan,
	};
}

async function updateRatePlan(user, id, data) {
	const ratePlan = await models.RatePlan.findById(id);
	if (!ratePlan) {
		throw new ThrowReturn().status(404);
	}

	if (ratePlan.isDefault && data.active === false) {
		throw new ThrowReturn('Không thể huỷ kích hoạt rate plan này');
	}

	_.assign(ratePlan, data);
	ratePlan.updatedBy = user._id;
	await ratePlan.save();

	return {
		ratePlan,
	};
}

async function deleteRatePlan(user, id) {
	const ratePlan = await models.RatePlan.findById(id);
	if (!ratePlan) {
		throw new ThrowReturn().status(404);
	}

	if (ratePlan.isDefault) {
		throw new ThrowReturn('Không thể xoá rate plan này');
	}

	ratePlan.active = false;
	ratePlan.updatedBy = user._id;
	await ratePlan.save();

	return {
		active: ratePlan.active,
	};
}

async function getPolicies(user, query) {
	const filter = {
		deleted: false,
	};

	if (query.type) {
		filter.type = query.type;
	}

	const policies = await models.Policy.find(filter).populate('createdBy', 'name');

	return {
		policies,
	};
}

async function createPolicy(user, data) {
	const policy = await models.Policy.create({ ...data, createdBy: user._id, groupIds: user.groupIds });

	return {
		policy,
	};
}

async function updatePolicy(user, id, data) {
	const policy = await models.Policy.findById(id);
	if (!policy) {
		throw new ThrowReturn().status(404);
	}

	_.assign(policy, data);
	policy.updatedBy = user._id;
	await policy.save();

	return {
		policy,
	};
}

async function deletePolicy(user, id) {
	const policy = await models.Policy.findByIdAndUpdate(id, { deleted: true, deletedBy: user._id });
	if (!policy) {
		throw new ThrowReturn().status(404);
	}

	await models.RatePlan.updateMany(
		{ 'policies.policyId': policy._id },
		{ $pull: { policies: { policyId: policy._id } } }
	);
}

async function findRoomTypePrice({ roomTypes, roomIds, ...filter }) {
	const prices = await roomTypes.asyncMap(async roomType => {
		let price = await models.CozrumPrice.findPrices({
			...filter,
			roomTypeId: roomType._id,
		});
		const currentRoomIds = roomIds.filter(r => roomType.roomIds.includesObjectId(r));

		if (!price.price) {
			const virtualRoomType = await models.RoomType.findOne({
				deleted: false,
				type: ROOM_GROUP_TYPES.VIRTUAL,
				blockId: roomType.blockId,
				roomIds: { $in: currentRoomIds },
			});

			if (virtualRoomType) {
				price = await models.CozrumPrice.findPrices({
					...filter,
					roomTypeId: virtualRoomType._id,
				});
			}
		}

		return {
			...price,
			roomIds: currentRoomIds,
		};
	});

	return prices;
}

async function checkPrice(user, query) {
	const { roomIds, roomTypeId, ratePlanId, from, to, fromHour, toHour } = query;

	const rtfilter = {
		deleted: false,
	};

	if (roomTypeId) {
		rtfilter._id = roomTypeId;
	} else {
		_.assign(rtfilter, {
			roomIds: { $in: roomIds },
			type: ROOM_GROUP_TYPES.DEFAULT,
		});
	}

	const roomTypes = await models.RoomType.find(rtfilter);

	const prices = await findRoomTypePrice({
		roomTypes,
		roomIds,
		ratePlanId,
		checkIn: from,
		checkOut: to,
		fromHour,
		toHour,
	});

	return { prices };
}

module.exports = {
	getRatePlans,
	createRatePlan,
	updateRatePlan,
	deleteRatePlan,
	getPolicies,
	createPolicy,
	updatePolicy,
	deletePolicy,
	checkPrice,
};

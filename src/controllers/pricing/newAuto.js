const _ = require('lodash');
// const uuid = require('uuid').v4;
// const schedule = require('node-schedule');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const {
	PromotionComparisonKey,
	PromotionComparisonType,
	RatePlanPricingTypes,
	PromotionAutoTimeType,
	PromotionAutoOperation,
	PromotionExecType,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');
const { bulkUpdatePrice } = require('@controllers/pricing');

async function getAutos({ blockId, roomTypeId, ratePlanId, start, limit }) {
	const filter = {
		blockId,
		deleted: false,
	};
	if (roomTypeId) {
		filter.roomTypeIds = roomTypeId;
	}
	if (ratePlanId) {
		filter.ratePlanIds = ratePlanId;
	}

	const [autos, total] = await Promise.all([
		models.PriceAuto.find(filter).skip(start).limit(limit).sort({ createdAt: -1 }),
		models.PriceAuto.countDocuments(filter),
	]);

	return { autos, total };
}

async function getAuto(autoId) {
	const auto = await models.PriceAuto.findById(autoId);

	if (!auto) {
		throw new ThrowReturn().status(404);
	}

	return { auto };
}

async function createAuto(body, user) {
	const auto = await models.PriceAuto.create({
		...body,
		createdBy: user._id,
	});

	return {
		auto,
	};
}

async function updateAuto(id, body) {
	const auto = await models.PriceAuto.findById(id);

	if (!auto) {
		throw new ThrowReturn().status(404);
	}

	_.assign(auto, body);
	await auto.save();

	return {
		auto,
	};
}

async function deleteAuto(id, user) {
	const auto = await models.PriceAuto.findById(id);

	if (!auto) {
		throw new ThrowReturn().status(404);
	}

	auto.deleted = true;
	auto.deletedBy = user._id;
	await auto.save();
}

async function getCondition({ time, auto, roomTypeId }) {
	if (!auto.comparisons || !auto.comparisons.length) {
		return;
	}

	const roomType = await models.RoomType.findById(roomTypeId).select('roomIds blockId');
	if (!roomType) return false;

	const occConds = [PromotionComparisonKey.AvailableRoom, PromotionComparisonKey.Occupancy];
	const hasOccComparison = auto.comparisons.some(c => occConds.includes(c.comparisonKey));

	let availableRoomIds = [];
	let roomIds = [];

	if (hasOccComparison) {
		const childRooms = await models.Room.find({
			_id: roomType.roomIds,
			'roomIds.0': { $exists: false },
		}).select('_id');

		roomIds = _.map(childRooms, '_id');

		const rules = await models.Block.getRules(roomType.blockId);

		const ctime =
			auto.timeType === PromotionAutoTimeType.Ahead
				? moment(time)
						.add(auto.hours || 1, 'hour')
						.toDate()
				: new Date(auto.comparisonTime);

		const from = new Date(ctime).zeroHours();

		availableRoomIds = await models.BlockScheduler.findAvailableRooms(
			roomIds,
			roomType.blockId,
			from,
			moment(from).add(1, 'day').toDate(),
			{
				rules,
				fromHour: moment(ctime).format('HH:mm'),
				toHour: moment(ctime).add(1, 'hour').format('HH:mm'),
			}
		);
	}

	const finder = comparison => {
		let valForCalc;
		let { thresholdOne, thresholdTwo } = comparison;

		if (comparison.comparisonKey === PromotionComparisonKey.TimeNow) {
			valForCalc = moment(time).format('HH:mm');
		} else if (comparison.comparisonKey === PromotionComparisonKey.AvailableRoom) {
			valForCalc = availableRoomIds.length;
			thresholdOne = Number(thresholdOne);
			thresholdTwo = Number(thresholdTwo);
		} else {
			valForCalc = (1 - availableRoomIds.length / roomIds.length) * 100;
			thresholdOne = Number(thresholdOne);
			thresholdTwo = Number(thresholdTwo);
		}

		if (comparison.comparisonType === PromotionComparisonType.Higher) {
			return valForCalc >= thresholdOne;
		}

		if (comparison.comparisonType === PromotionComparisonType.Lower) {
			return valForCalc <= thresholdOne;
		}

		return valForCalc >= thresholdOne && valForCalc <= thresholdTwo;
	};

	return auto.operation === PromotionAutoOperation.And
		? auto.comparisons.every(finder)
		: auto.comparisons.some(finder);
}

async function runAuto() {
	// const time = moment().startOf('hour').toDate();
	const ctime = new Date();
	const today = moment(ctime).format('YYYY-MM-DD');

	const autos = await models.PriceAuto.find({
		$and: [
			{
				active: true,
				deleted: false,
				daysOfWeek: _.toString(ctime.getDay() + 1),
			},
			{
				$or: [
					{
						runTime: null,
					},
					{
						runTime: { $lte: moment(ctime).format('YYYY-MM-DD HH-mm') },
						// lastTimeExecuted: { $lt: time },
					},
				],
			},
			{
				$or: [
					{
						startDate: null,
					},
					{
						startDate: { $lte: today },
					},
				],
			},
			{
				$or: [
					{
						endDate: null,
					},
					{
						endDate: { $gte: today },
					},
				],
			},
		],
	});

	await autos.asyncMap(async auto => {
		const time = auto.runTime ? moment(auto.runTime, 'YYYY-MM-DD HH-mm').toDate() : ctime;

		await auto.setNextRunTime();

		await auto.roomTypeIds.asyncMap(async roomTypeId => {
			const validCondition = await getCondition({
				auto,
				roomTypeId,
				time,
			});

			if (!validCondition) return;

			if (auto.execType === PromotionExecType.OnOff) {
				auto.autoStates = _.filter(auto.autoStates, s => !s.roomTypeId.equals(roomTypeId));

				if (!auto.execValue) {
					auto.autoStates.push({
						roomTypeId,
						active: false,
					});
				}
				await auto.save();
			}

			if (_.some(auto.autoStates, a => a.active === false && a.roomTypeId.equals(roomTypeId))) {
				return;
			}

			const ratePlans = await models.RatePlan.find({
				_id: auto.ratePlanIds,
				blockId: auto.blockId,
				pricingType: RatePlanPricingTypes.New,
				roomTypeIds: roomTypeId,
				active: true,
			});

			const params = {
				from: new Date(time).zeroHours(),
				to: new Date(time).zeroHours(),
				blockId: auto.blockId,
				roomTypeId,
				otas: auto.activeOTAs,
				isBasicPrice: true,
				autoId: auto._id,
				minPrice: auto.minPrice,
				maxPrice: auto.maxPrice,
			};

			if (auto.execType === PromotionExecType.ValueChange) {
				params.changeType = _.toLower(auto.valueChangeType);
				params.price = auto.execValue;
			} else if (auto.execType === PromotionExecType.ValueSet) {
				params.priceSet = auto.execValue;
			}

			await ratePlans.asyncMap(async ratePlan => {
				const data = {
					...params,
					ratePlanId: ratePlan._id,
				};

				try {
					if (auto.execType === PromotionExecType.Reset) {
						const prices = await models.PriceHistory.getPrices({
							blockId: params.blockId,
							roomTypeId: params.roomTypeId,
							ratePlanId: params.ratePlanId,
							from: params.from,
							to: params.to,
							autoId: { $eq: null },
							isBasicPrice: true,
						});
						if (!prices.length) {
							return;
						}

						await prices.asyncMap(prevPrice =>
							bulkUpdatePrice({
								...data,
								priceSet: true,
								..._.pick(prevPrice, ['price', 'priceFirstHours', 'priceAdditionalHours']),
							})
						);
					} else {
						await bulkUpdatePrice(data);
					}
				} catch (e) {
					logger.error('price auto bulkUpdatePrice', data, e);
				}
			});
		});
	});
}

module.exports = {
	getAutos,
	getAuto,
	createAuto,
	updateAuto,
	deleteAuto,
	runAuto,
};

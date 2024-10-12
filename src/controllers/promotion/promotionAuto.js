const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const {
	PromotionRuleSetBlockType,
	PromotionComparisonKey,
	PromotionComparisonType,
	PromotionAutoTimeType,
	PromotionAutoOperation,
	PromotionExecType,
} = require('@utils/const');
const models = require('@models');
const { syncPromotionRuleSetBlock } = require('./promotionRuleSetBlock.controller');

const LIMIT_PER_RUN = 20;

async function runAutoTimer(auto, time) {
	try {
		const promotionRulesetBlock = auto.promotionRulesetBlockId;

		const isActived = promotionRulesetBlock.currentRules.some(
			r => !r.promotionAutoId || auto._id.equals(r.promotionAutoId)
		);

		if (time === auto.offTime && isActived) {
			promotionRulesetBlock.currentRules = promotionRulesetBlock.currentRules.filter(
				r => r.promotionAutoId && !auto._id.equals(r.promotionAutoId)
			);
			await promotionRulesetBlock.save();

			await syncPromotionRuleSetBlock(promotionRulesetBlock);
		}

		if (time === auto.onTime && !isActived) {
			promotionRulesetBlock.currentRules.push(
				...auto.promotionRuleTypes.map(r => ({
					...r.toJSON(),
					promotionAutoId: auto._id,
					createdAt: new Date(),
				}))
			);
			await promotionRulesetBlock.save();

			await syncPromotionRuleSetBlock(promotionRulesetBlock);
		}
	} catch (e) {
		logger.error('runAutoTimer', time, auto, e);
	}
}

async function runPromotionAutoTimer(skip = 0, time = new Date()) {
	const now = moment(time).format('HH:mm');
	const today = moment(time).format('YYYY-MM-DD');

	const autos = await models.PromotionAuto.find({
		$and: [
			{
				active: true,
				deleted: false,
				type: PromotionRuleSetBlockType.Timer,
				daysOfWeek: _.toString(time.getDay() + 1),
				$or: [
					{
						onTime: now,
					},
					{
						offTime: now,
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
	})
		.skip(skip)
		.limit(LIMIT_PER_RUN)
		.populate('promotionRulesetBlockId');

	await autos
		.filter(
			auto =>
				auto.promotionRulesetBlockId &&
				auto.promotionRulesetBlockId.active &&
				auto.promotionRulesetBlockId.ruleBlockType === PromotionRuleSetBlockType.Timer
		)
		.asyncForEach(auto => runAutoTimer(auto, now));

	if (autos.length === LIMIT_PER_RUN) {
		await runPromotionAutoTimer(skip + LIMIT_PER_RUN, time);
	}
}

function isMatchDynamic(auto) {
	if (
		!auto.promotionRulesetBlockId ||
		!auto.promotionRulesetBlockId.active ||
		auto.promotionRulesetBlockId.ruleBlockType !== PromotionRuleSetBlockType.Dynamic
	) {
		return false;
	}

	return true;
}

async function getCondition({ time, auto }) {
	const { blockId, roomTypeIds } = auto.promotionRulesetBlockId;

	const occConds = [PromotionComparisonKey.AvailableRoom, PromotionComparisonKey.Occupancy];

	const hasOccComparison = auto.comparisons.some(c => occConds.includes(c.comparisonKey));

	let availableRoomIds = [];
	let roomIds = [];

	if (hasOccComparison) {
		const roomTypes = await models.RoomType.find({ _id: roomTypeIds }).select('roomIds');
		const childRooms = await models.Room.find({
			_id: _.uniqBy(_.flatten(_.map(roomTypes, 'roomIds')), _.toString),
			'roomIds.0': { $exists: false },
		}).select('_id');

		roomIds = _.map(childRooms, '_id');

		const ctime =
			auto.timeType === PromotionAutoTimeType.Ahead
				? moment(time)
						.add(auto.hours || 1, 'hour')
						.toDate()
				: new Date(auto.comparisonTime);
		const from = new Date(ctime).zeroHours();
		const to = moment(from).add(1, 'day').toDate();
		const fromHour = moment(ctime).format('HH:mm');
		const toHour = moment(ctime).add(1, 'hour').format('HH:mm');

		const rules = await models.Block.getRules(blockId);

		availableRoomIds = await models.BlockScheduler.findAvailableRooms(roomIds, blockId, from, to, {
			rules,
			fromHour,
			toHour,
		});
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

async function runAutoDynamic(auto, time) {
	try {
		const promotionRulesetBlock = auto.promotionRulesetBlockId;

		await auto.setNextRunTime();

		const cond = await getCondition({ auto, time });

		if (cond) {
			const params = {
				promotionAutoId: auto._id,
				createdAt: new Date(),
				autoState: auto.execType,
			};

			if (auto.execType === PromotionExecType.OnOff) {
				promotionRulesetBlock.currentRules = promotionRulesetBlock.currentRules.filter(
					r => !auto._id.equals(r.promotionAutoId)
				);

				if (!auto.execValue) {
					const newRules = auto.promotionRuleTypes.map(promotionRuleType => ({
						...params,
						rule_type: promotionRuleType.rule_type,
						threshold_one: promotionRuleType.threshold_one,
					}));
					promotionRulesetBlock.currentRules.push(...newRules);
				}
			} else if (auto.execType === PromotionExecType.ValueChange) {
				const newRules = auto.promotionRuleTypes.map(promotionRuleType => {
					return {
						...params,
						rule_type: promotionRuleType.rule_type,
						threshold_one: promotionRuleType.threshold_one,
						price_change: auto.execValue,
					};
				});

				promotionRulesetBlock.currentRules.push(...newRules);
			} else if (auto.execType === PromotionExecType.ValueSet) {
				promotionRulesetBlock.currentRules = promotionRulesetBlock.currentRules.filter(
					r => !auto._id.equals(r.promotionAutoId)
				);

				const newRules = auto.promotionRuleTypes.map(promotionRuleType => ({
					...params,
					rule_type: promotionRuleType.rule_type,
					threshold_one: promotionRuleType.threshold_one,
					price_change: auto.execValue,
				}));

				promotionRulesetBlock.currentRules.push(...newRules);
			} else if (auto.execType === PromotionExecType.Reset) {
				// promotionRulesetBlock.currentRules = promotionRulesetBlock.currentRules.filter(
				// 	r => !auto._id.equals(r.promotionAutoId)
				// );

				// const newRules = auto.promotionRuleTypes.map(promotionRuleType => ({
				// 	...params,
				// 	rule_type: promotionRuleType.rule_type,
				// 	threshold_one: promotionRuleType.threshold_one,
				// }));
				// promotionRulesetBlock.currentRules.push(...newRules);

				promotionRulesetBlock.currentRules = [];
			}

			// promotionRulesetBlock.currentRules = promotionRulesetBlock.currentRules.filter(
			// 	c => c.promotionAutoId && !auto._id.equals(c.promotionAutoId)
			// );
			// promotionRulesetBlock.currentRules.push(...newRules);

			await promotionRulesetBlock.save();

			await syncPromotionRuleSetBlock(promotionRulesetBlock);
		}
	} catch (e) {
		logger.error('runAutoDynamic', time, auto, e);
	}
}

async function runPromotionAutoDynamic(skip = 0, time) {
	// time = time || moment().startOf('hour').toDate();
	// const today = moment().format('YYYY-MM-DD');
	const ctime = time || new Date();
	const today = moment(ctime).format('YYYY-MM-DD');

	const autos = await models.PromotionAuto.find({
		$and: [
			{
				active: true,
				deleted: false,
				type: PromotionRuleSetBlockType.Dynamic,
				daysOfWeek: _.toString(ctime.getDay() + 1),
			},
			{
				$or: [
					{
						runTime: null,
					},
					{
						runTime: { $lte: moment(ctime).format('YYYY-MM-DD HH-mm') },
						// lastTimeExecuted: { $lt: ctime },
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
	})
		.skip(skip)
		.limit(LIMIT_PER_RUN)
		.populate({ path: 'promotionRulesetBlockId' });

	await autos
		.filter(auto => isMatchDynamic(auto))
		.asyncForEach(auto =>
			runAutoDynamic(auto, auto.runTime ? moment(auto.runTime, 'YYYY-MM-DD HH-mm').toDate() : ctime)
		);

	if (autos.length) {
		await runPromotionAutoDynamic(skip + LIMIT_PER_RUN, time);
	}
}

async function getAutos({ promotionRulesetBlockId }) {
	const autos = await models.PromotionAuto.find({
		promotionRulesetBlockId,
		deleted: false,
	}).lean();

	return {
		autos,
	};
}

async function createAuto(body, user) {
	const auto = await models.PromotionAuto.create({
		...body,
		createdBy: user._id,
	});

	return {
		auto,
	};
}

async function updateAuto(id, body) {
	const auto = await models.PromotionAuto.findById(id);

	if (!auto) {
		throw new ThrowReturn().status(404);
	}

	_.assign(auto, body);
	await auto.save();

	return {
		auto,
	};
}

async function deleteAuto(id) {
	const auto = await models.PromotionAuto.findByIdAndDelete(id);

	if (!auto) {
		throw new ThrowReturn().status(404);
	}

	const promotionRulesetBlock = await models.PromotionRuleSetBlocks.findOne({
		_id: auto.promotionRulesetBlockId,
		'currentRules.promotionAutoId': auto._id,
	});
	if (promotionRulesetBlock) {
		promotionRulesetBlock.currentRules = promotionRulesetBlock.currentRules.filter(
			c => c.promotionAutoId && !auto._id.equals(c.promotionAutoId)
		);
		await promotionRulesetBlock.save();
		await syncPromotionRuleSetBlock(promotionRulesetBlock);
	}
}

module.exports = {
	runPromotionAutoTimer,
	runPromotionAutoDynamic,
	getAutos,
	createAuto,
	updateAuto,
	deleteAuto,
};

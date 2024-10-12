const _ = require('lodash');
// const moment = require('moment');
const AsyncLock = require('async-lock');
const mongoose = require('mongoose');

const { logger } = require('@utils/logger');
const { rangeDate } = require('@utils/date');
const { Services, ROOM_GROUP_TYPES } = require('@utils/const');

const SyncLock = new AsyncLock({ maxPending: 10000 });

async function syncAvailablityCalendar(blockId, from, to) {
	try {
		from = from.zeroHours();
		to = to.zeroHours();

		await SyncLock.acquire(`${_.toString(blockId)}_${from}_${to}`, async () => {
			const dates = rangeDate(from, to).toArray();
			if (!dates.length) return;

			const roomTypes = await mongoose
				.model('RoomType')
				.find({
					blockId,
					deleted: false,
					type: { $in: [ROOM_GROUP_TYPES.DEFAULT, ROOM_GROUP_TYPES.VIRTUAL] },
				})
				.select('roomIds')
				.lean();

			if (!roomTypes.length) return;

			const rates = await mongoose
				.model('RatePlan')
				.find({
					blockId,
					active: true,
				})
				.select('roomTypeIds')
				.lean();

			if (!rates.length) return;

			const bulks = [];
			const BlockScheduler = mongoose.model('BlockScheduler');

			const scheduleDocs = await BlockScheduler.find({
				blockId,
				date: { $gte: from, $lte: to },
			})
				.sort({ date: 1 })
				.lean();

			const block = await mongoose.model('Block').findById(blockId).select('serviceTypes rules');

			await roomTypes.asyncMap(async roomType => {
				const roomTypeRates = rates.filter(rate => rate.roomTypeIds.includesObjectId(roomType._id));
				if (!roomTypeRates.length) return;

				const includeHourService = _.includes(block.serviceTypes, Services.Hour);
				const rules = block.getRules();

				const schedules = await BlockScheduler.getSchedulesByRoomIds({
					blockId: block._id,
					schedules: scheduleDocs,
					roomIds: roomType.roomIds,
					filterEmpty: false,
					rules,
					includeHourService,
					isSync: true,
				}).then(sches => _.keyBy(sches, s => s.date.toDateMysqlFormat()));

				dates.forEach(date => {
					date = date.toDateMysqlFormat();
					const available = schedules[date] ? schedules[date].available : roomType.roomIds.length;
					const unavailableHours = _.get(schedules[date], 'unavailableHours', []);

					roomTypeRates.forEach(roomTypeRate => {
						bulks.push({
							updateOne: {
								filter: {
									blockId: mongoose.Types.ObjectId(blockId),
									roomTypeId: roomType._id,
									ratePlanId: roomTypeRate._id,
									date,
								},
								update: { available, unavailableHours },
								upsert: true,
							},
						});
					});
				});
			});

			if (!bulks.length) return;

			await mongoose.model('BlockCalendar').bulkWrite(bulks);
		});
	} catch (e) {
		logger.error('syncAvailablityCalendar', e);
	}
}

module.exports = {
	syncAvailablityCalendar,
};

const _ = require('lodash');
const mongoose = require('mongoose');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { TaskTags, UserRoles, TaskStatus, TaskSource, TaskReason, RuleDay, LAYOUT_TYPE } = require('@utils/const');
const { getArray } = require('@utils/query');
const models = require('@models');

async function getBlocksSchedule(filter, date, serviceType) {
	date = new Date(date).zeroHours();
	const preDate = new Date(date);
	preDate.setDate(preDate.getDate() - 1);
	serviceType = parseInt(serviceType) || null;
	filter = _.pickBy(filter);

	const reservations = await models.Reservation.find({ ...filter, 'dates.date': date })
		.select('bookingId blockId roomId dates')
		.populate('bookingId', '_id expectCheckIn serviceType')
		.lean();

	const preReservations = await models.Reservation.find({ ...filter, 'dates.date': preDate })
		.select('bookingId blockId roomId')
		.populate('bookingId', '_id expectCheckOut serviceType')
		.lean();

	const resObj = _.keyBy(reservations, 'roomId');
	const schedules = {};

	preReservations.forEach(pre => {
		if (serviceType && serviceType !== pre.bookingId.serviceType) {
			return;
		}

		let current = resObj[pre.roomId];
		if (current && serviceType && serviceType !== current.bookingId.serviceType) {
			current = null;
		}

		const isStaying = current && current.bookingId._id.equals(pre.bookingId._id);
		if (isStaying) {
			_.set(schedules, [pre.blockId, pre.roomId, 'staying'], pre.bookingId._id);
		} else {
			_.set(schedules, [pre.blockId, pre.roomId, 'checkOut'], pre.bookingId._id);
			_.set(schedules, [pre.blockId, pre.roomId, 'checkOutTime'], pre.bookingId.expectCheckOut);
		}
	});

	reservations.forEach(re => {
		if (serviceType && serviceType !== re.bookingId.serviceType) {
			return;
		}
		if (re.dates[0].date === date) {
			_.set(schedules, [re.blockId, re.roomId, 'checkIn'], re.bookingId._id);
			_.set(schedules, [re.blockId, re.roomId, 'checkInTime'], re.bookingId.expectCheckIn);
		}
	});

	return schedules;
}

async function getCleanningSchedule(query, user) {
	const users = getArray(query.user);
	const filterBlocks = getArray(query.blockId);
	const dateFormat = moment(query.date || new Date()).format('Y-MM-DD');

	let roomIds;
	if (query.roomId) {
		const room = await models.Room.findById(query.roomId);
		if (room) {
			roomIds = [room._id, ...(await room.getDescendants())];
		}
	}

	const { blockIds, limitRooms, filters } = await models.Host.getBlocksOfUser({ user, filterBlockIds: filterBlocks });
	const blocks = await models.Block.find({ _id: { $in: blockIds }, active: true, isProperty: true })
		.select('info.name info.shortName staffs info.taskOrder')
		.populate('staffs.maid', 'name username role');

	const cleaningCategory = await models.TaskCategory.findByTag(TaskTags.CLEANING);
	const cleaningBackCategory = await models.TaskCategory.findByTag(TaskTags.CLEANING_BACK);
	const paCategory = await models.TaskCategory.findByTag(TaskTags.PA);

	const scheduleRoomFilter = {};
	const roomQuery = { virtual: false };
	const taskQuery = {
		category: [cleaningCategory._id, cleaningBackCategory._id, paCategory._id],
		time: { $gte: new Date(`${dateFormat}T00:00:00.000Z`), $lt: new Date(`${dateFormat}T23:59:59.000Z`) },
		status: { $ne: TaskStatus.Deleted },
	};

	if (limitRooms) {
		_.assign(taskQuery, filters);
		roomQuery.$or = filters.$or.map(r =>
			_.pickBy({
				blockId: r.blockId,
				_id: r.roomIds,
			})
		);
		scheduleRoomFilter.$or = filters.$or.map(r =>
			_.pickBy({
				blockId: r.blockId,
				roomId: r.roomIds,
			})
		);
	} else {
		scheduleRoomFilter.blockId = { $in: blockIds };
		roomQuery.blockId = { $in: blockIds };
		taskQuery.blockId = { $in: blockIds };
	}

	if (roomIds) {
		_.set(roomQuery, ['_id', '$in'], roomIds);
		_.set(taskQuery, ['roomIds', '$in'], roomIds);
		_.set(scheduleRoomFilter, ['roomId', '$in'], roomIds);
	}
	if (users) {
		taskQuery.assigned = users;
	}

	const tasks = await models.Task.find(taskQuery)
		.select('blockId roomIds assigned time status description workingType category attachments')
		.populate('assigned', 'name username');

	const schedules = await getBlocksSchedule(scheduleRoomFilter, dateFormat, query.serviceType);

	const rooms = await models.Room.aggregate([
		{ $match: roomQuery },
		{ $project: { 'info.roomNo': 1, 'info.name': 1, blockId: 1 } },
		{ $group: { _id: '$blockId', data: { $push: '$$ROOT' } } },
	]).then(rms => _.keyBy(rms, '_id'));

	const data = blocks
		.map(block => {
			const blockRooms = _.get(rooms, [block._id, 'data']) || [];
			const defaultAssinged = _.compact(_.find(_.get(block.staffs, 'maid'), m => m.role !== UserRoles.REPAIRER));

			let schedule = blockRooms
				.map(r => {
					const scheduleRoom = _.get(schedules, [block._id, r._id], null);
					if (query.serviceType && !scheduleRoom) {
						return;
					}
					const cleaningTasks = tasks.filter(
						t =>
							(t.category.equals(cleaningCategory._id) || t.category.equals(cleaningBackCategory._id)) &&
							t.roomIds.some(roomId => r._id.equals(roomId))
					);

					return {
						...scheduleRoom,
						roomId: r,
						tasks: cleaningTasks.length
							? cleaningTasks
							: scheduleRoom && scheduleRoom.checkOut
							? [
									{
										category: cleaningCategory._id,
										departmentId: _.head(cleaningCategory.departmentIds),
										description: cleaningCategory.name,
										blockId: block._id,
										roomIds: [r._id],
										time: `${dateFormat}T${RuleDay.to}:00.000Z`,
										bookingId: _.compact([scheduleRoom.checkOut || scheduleRoom.checkIn]),
										assigned: defaultAssinged,
									},
							  ]
							: [],
					};
				})
				.filter(d => d && d.tasks.length);

			const paTasks = tasks.filter(t => t.blockId.equals(block._id) && t.category.equals(paCategory._id));
			if (paTasks.length) {
				schedule.push({
					tasks: paTasks,
				});
			} else {
				schedule.push({
					tasks: [
						{
							category: paCategory._id,
							departmentId: _.head(paCategory.departmentIds),
							blockId: block._id,
							description: paCategory.description,
							time: `${dateFormat}T${RuleDay.to}:00.000Z`,
							assigned: defaultAssinged,
						},
					],
				});
			}

			if (users) {
				schedule = schedule
					.map(s => {
						s.tasks = _.filter(s.tasks, t => t.assigned.some(a => users.includes(a._id.toString())));
						if (s.tasks.length) return s;
						return null;
					})
					.filter(s => s);
			}

			return { blockId: block, schedule };
		})
		.filter(d => d && d.schedule && d.schedule.length);

	return _.orderBy(data, ['blockId.info.taskOrder'], ['asc']);
}

async function getOtherSchedule(query, user) {
	const users = getArray(query.user);
	const filterBlocks = getArray(query.blockId);

	const { blockIds, filters } = await models.Host.getBlocksOfUser({ user, filterBlockIds: filterBlocks });
	const blocks = await models.Block.find({ _id: { $in: blockIds }, active: true, isProperty: true })
		.select('info.name info.shortName staffs')
		.populate('staffs.maid', 'name username role');

	const category = await models.TaskCategory.findOne({ tag: query.tag });
	if (!category) {
		throw new ThrowReturn('Not found tag!');
	}

	const taskQuery = {
		...filters,
		category: category._id,
		// time: { $gte: new Date(`${dateFormat}T00:00:00.000Z`), $lte: new Date(`${dateFormat}T23:59:59.000Z`) },
		status: { $ne: TaskStatus.Deleted },
	};

	let dateFormat;
	let timeFormat;
	const autoConfig = _.get(category.autoCreateConfigs, '[0].times[0]');

	if (query.month) {
		const mdate = moment(query.month);

		if (autoConfig && autoConfig.date) {
			dateFormat = moment(mdate).date(autoConfig.date).format('Y-MM-DD');
		} else {
			dateFormat = mdate.startOf('month').format('Y-MM-DD');
		}

		taskQuery.time = {
			$gte: new Date(`${mdate.startOf('month').format('Y-MM-DD')}T00:00:00.000Z`),
			$lte: new Date(`${mdate.endOf('month').format('Y-MM-DD')}T23:59:59.000Z`),
		};
	} else {
		dateFormat = moment(query.date).format('Y-MM-DD');
		taskQuery.time = {
			$gte: new Date(`${dateFormat}T00:00:00.000Z`),
			$lte: new Date(`${dateFormat}T23:59:59.000Z`),
		};
	}
	if (users) {
		taskQuery.assigned = users;
	}

	if (autoConfig && moment(autoConfig.time, 'HH:mm', true).isValid()) {
		timeFormat = autoConfig.time;
	} else {
		timeFormat = RuleDay.to;
	}

	const tasks = await models.Task.find(taskQuery)
		.select('blockId roomIds assigned time status description workingType category attachments')
		.populate('assigned', 'name username');

	const data = blocks
		.map(block => {
			const schedule = [];

			const taskList = tasks.filter(t => t.blockId.equals(block._id) && t.category.equals(category._id));
			if (taskList.length) {
				schedule.push({
					tasks: taskList,
				});
			} else if (!users) {
				schedule.push({
					tasks: [
						{
							category: category._id,
							departmentId: _.head(category.departmentIds),
							blockId: block._id,
							description: category.name,
							time: `${dateFormat}T${timeFormat}:00.000Z`,
						},
					],
				});
			}

			return { blockId: block, schedule };
		})
		.filter(d => d && d.schedule && d.schedule.length);

	return data;
}

async function getSchedule(query, user) {
	if (query.tag && ![TaskTags.CLEANING, TaskTags.CLEANING_BACK].includes(query.tag)) {
		return getOtherSchedule(query, user);
	}

	return getCleanningSchedule(query, user);
}

async function createSchedule(user, schedules) {
	const newTasks = [];
	const updateTasks = [];

	const categoryIds = _.flattenDeep(
		schedules.map(block => block.schedule.map(sch => sch.tasks.map(t => t.category)))
	);
	const categories = await models.TaskCategory.find({ _id: categoryIds });
	const ctgs = _.keyBy(categories, '_id');

	schedules.forEach(block => {
		block.schedule.forEach(schedule => {
			schedule.tasks.forEach(({ assigned, ...task }) => {
				const data = {
					...task,
					createdBy: user._id,
					assigned: _.compact(_.isArray(assigned) ? assigned.map(a => (a && a._id) || a) : [assigned]),
				};
				if (task._id) {
					updateTasks.push({
						_id: task._id,
						data,
						user,
					});
				} else if (data.assigned.length) {
					const ctg = ctgs[data.category];
					if (ctg) {
						data.notificationType = ctg.notificationType;
						data.reminderNotificationType = ctg.reminderNotificationType;
						data.reminder = ctg.reminder;
					}

					data.notifyOnCreate = false;
					data.status = TaskStatus.Confirmed;
					data.source = TaskSource.Cms;
					data.reason = TaskReason.Plan;
					newTasks.push(new models.Task(data));
				}
			});
		});
	});

	if (newTasks.length) {
		const err = newTasks.find(task => task.validateSync());
		if (err) {
			throw ThrowReturn(err);
		}
		await newTasks.asyncForEach(task => task.save());
	}
	if (updateTasks.length) {
		await updateTasks.asyncMap(data => models.Task.updateTask(data._id, data.data, data.user));
	}

	return {
		modified: updateTasks.length,
		created: newTasks.length,
		blockId: _.get(newTasks, [0, 'blockId']) || _.get(updateTasks, [0, 'blockId']),
	};
}

async function getScheduleTask(blockId, roomId, date) {
	const block = await models.Block.findById(blockId).select('info.name staffs.maid');
	if (!block) return;

	let schedule = await getBlocksSchedule({ blockId: block._id, roomId }, date).then(sch => sch[blockId] || {});
	const defaultAssinged = _.compact([_.get(block.staffs, ['maid', 0])]);
	const cleaningCategory = await models.TaskCategory.findByTag(TaskTags.CLEANING);
	const cleaningBackCategory = await models.TaskCategory.findByTag(TaskTags.CLEANING_BACK);

	const taskData = {
		category: cleaningCategory._id,
		departmentId: _.head(cleaningCategory.departmentIds),
		description: cleaningCategory.name,
		blockId: block._id,
		time: `${moment(date).format('Y-MM-DD')}T${RuleDay.to}:00.000Z`,
		assigned: defaultAssinged,
	};

	if (Object.keys(schedule).length > 0) {
		schedule = await _.entries(schedule).asyncMap(async ([id, value]) => {
			const room = await models.Room.findById(id).select('info.roomNo');
			const category =
				!value.checkOut && !value.checkIn && value.staying ? cleaningBackCategory : cleaningCategory;

			return {
				roomId: room,
				...value,
				tasks: [
					{
						...taskData,
						category: category._id,
						departmentId: _.head(category.departmentIds),
						description: category.name,
						roomIds: [id],
						bookingId: _.compact([value.checkOut || value.checkIn || value.staying]),
					},
				],
			};
		});
	} else {
		const room = await models.Room.findById(roomId).select('info.roomNo');
		schedule = [
			{
				roomId: room,
				tasks: [
					{
						...taskData,
						roomIds: [room._id],
					},
				],
			},
		];
	}

	return { block, schedule };
}

async function getScheduleFloor(query) {
	const { date, blockId, roomId, serviceType, maid } = query;

	const block = await models.Block.findById(blockId).select('active layout').lean();
	if (!block) return null;

	let descenRoomIds;

	if (roomId) {
		const room = await models.Room.findById(roomId);
		if (room) {
			descenRoomIds = [room._id, ...(await room.getDescendants())];
		}
	}

	if (!block.layout || !block.layout.length) {
		const rFilter = { $ne: null };
		if (descenRoomIds) {
			rFilter.$in = descenRoomIds;
		}
		const newLayout = await models.BlockLayout.find({ blockId, layoutType: LAYOUT_TYPE.Y })
			.populate({
				path: 'layouts',
				select: 'roomId',
				match: { roomId: rFilter },
				option: { sort: { order: 1 } },
			})
			.sort({ order: -1 });

		const layoutYhaveRooms = newLayout.filter(layoutY => _.some(layoutY.layouts, l => l.roomId));
		block.layout = _.entries(_.groupBy(layoutYhaveRooms, 'name')).map(([name, layouts]) => {
			return [
				name,
				..._.chain(layouts).flatten().map('layouts').flatten().map('roomId').uniqBy(_.toString).value(),
			];
		});
	}

	const roomIds = [];
	_.forEach(block.layout, layout => {
		_.forEach(layout, rId => {
			if (mongoose.Types.ObjectId.isValid(rId)) {
				const orId = mongoose.Types.ObjectId(rId);
				if (!descenRoomIds || descenRoomIds.includesObjectId(orId)) {
					roomIds.push(orId);
				}
			}
		});
	});

	const rooms = await models.Room.find({ _id: roomIds })
		.select('info.roomNo')
		.then(rs => _.keyBy(rs, '_id'));

	const schedule = await getBlocksSchedule({ blockId: block._id, roomId: descenRoomIds }, date, serviceType).then(
		sch => sch[blockId] || {}
	);

	const cleaningCtg = await models.TaskCategory.findByTag(TaskTags.CLEANING);
	const cleaningBackCtg = await models.TaskCategory.findByTag(TaskTags.CLEANING_BACK);
	const paCtg = await models.TaskCategory.findByTag(TaskTags.PA);

	const minDate = new Date(date);
	minDate.setUTCHours(0, 0, 0, 0);
	const maxDate = new Date(date);
	maxDate.setUTCHours(23, 59, 59, 59);

	const filter = {
		blockId: block._id,
		status: { $ne: TaskStatus.Deleted },
		time: { $gte: minDate, $lte: maxDate },
	};
	if (maid) filter.assigned = maid.split(',');

	const tasks = await models.Task.find({
		...filter,
		category: { $in: [cleaningCtg._id, cleaningBackCtg._id] },
		roomIds: { $in: roomIds },
	}).select('assigned time status description roomIds workingType attachments');

	const pa = await models.Task.findOne({
		...filter,
		category: paCtg._id,
	}).select('assigned time status description workingType attachments');

	return { block, schedule, tasks, rooms, pa };
}

async function updateScheduleFloor(user, body) {
	const { data: dataUpdate, date, blockId, pa } = body;

	const cleaningCtg = await models.TaskCategory.findByTag(TaskTags.CLEANING);
	const cleaningBackCtg = await models.TaskCategory.findByTag(TaskTags.CLEANING_BACK);

	await dataUpdate.asyncForEach(async item => {
		const taskUpdated = {};
		for (const roomId of item.roomIds) {
			const book = item.bookings[roomId];
			if (!book) continue;
			const category = book.staying ? cleaningBackCtg : cleaningCtg;
			const data = {
				category: category._id,
				departmentId: _.head(category.departmentIds),
				createdBy: user._id,
				blockId,
				bookingId: book.staying || book.checkOut || book.checkIn,
				roomIds: [roomId],
				description: item.description || category.name,
				assigned: item.assigned,
				time: new Date(item.date || date),
			};
			const oldTask = item.task && item.task.find(t => t.roomIds.some(r => r === roomId));
			if (oldTask && oldTask.status !== TaskStatus.Deleted) {
				taskUpdated[oldTask._id] = true;
				if (data.assigned.length === 0) data.status = TaskStatus.Deleted;
				await models.Task.updateOne({ _id: oldTask._id }, data);
			} else if (data.assigned.length > 0) {
				data.status = TaskStatus.Confirmed;
				data.source = TaskSource.Cms;
				data.reason = TaskReason.Plan;
				await models.Task.create({
					...data,
					notifyOnCreate: false,
					notificationType: category.notificationType,
					reminderNotificationType: category.reminderNotificationType,
					reminder: category.reminder,
				});
			}
		}

		await item.task
			.filter(t => !taskUpdated[t._id])
			.asyncForEach(task => models.Task.updateOne({ _id: task._id }, { status: TaskStatus.Deleted }));
	});

	if (!pa) return;

	if (pa.taskId) {
		if (pa.assigned && pa.assigned.length) {
			await models.Task.updateOne({ _id: pa.taskId }, { assigned: pa.assigned });
		} else {
			await models.Task.deleteOne({ _id: pa.taskId });
		}
	} else if (pa.assigned && pa.assigned.length) {
		const paCategory = await models.TaskCategory.findByTag(TaskTags.PA);
		await models.Task.create({
			category: paCategory._id,
			createdBy: user._id,
			blockId,
			description: paCategory.name,
			assigned: pa.assigned,
			time: new Date(pa.date || date),
			status: TaskStatus.Confirmed,
			source: TaskSource.Cms,
			reason: TaskReason.Plan,
			notifyOnCreate: false,
			notificationType: paCategory.notificationType,
			reminderNotificationType: paCategory.reminderNotificationType,
			reminder: paCategory.reminder,
		});
	}
}

module.exports = {
	getSchedule,
	createSchedule,
	getScheduleTask,
	getScheduleFloor,
	updateScheduleFloor,
};

const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');
const uuid = require('uuid').v4;
const AsyncLock = require('async-lock');

const {
	TaskTags,
	UserRoles,
	TaskStatus,
	RolePermissons,
	PayoutType,
	PayoutStates,
	TaskSource,
	TaskReason,
	BookingStatus,
	BookingCheckinType,
	CLEANING_STATE,
	LANGUAGE,
	Services,
	CHECK_ITEM_STATUS,
} = require('@utils/const');
const { Settings } = require('@utils/setting');
const { eventEmitter, EVENTS } = require('@utils/events');
const { rangeDate } = require('@utils/date');
const { getArray } = require('@utils/query');
const { logger } = require('@utils/logger');
const { getParseLog } = require('@utils/schema');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const { OTA_MAX_STAR } = require('@controllers/review/const');
const BookingActions = require('@controllers/booking/action');

const CheckList = require('./checkList');
const { getCompressImages } = require('./compress');
const { LOG_FIELDS_LABELS, LOG_VALUES_MAPPER } = require('./const/task.const');

const MAX_SIZE = 200;
const TaskLock = new AsyncLock();

async function getTaskRole(user) {
	const rs = {
		fullControl: false,
		readOnly: false,
		statusOnly: false,
		denied: false,
	};
	if (user.role !== UserRoles.ADMIN) {
		const roleGroup = await models.RoleGroup.findOne({ role: user.role }).select('groups');
		if (!roleGroup) rs.denied = true;
		else {
			const cRole = roleGroup.groups.find(r => r.name === RolePermissons.TASK);
			const doingRole = roleGroup.groups.some(r => r.name === RolePermissons.TASK_STATUS_ONLY);
			if (cRole) {
				if (cRole.methods.includes('GET')) {
					rs.readOnly = true;
				} else rs.fullControl = true;
			}
			if (doingRole) {
				rs.statusOnly = true;
			}
		}
	} else {
		rs.fullControl = true;
	}
	return rs;
}

async function getTaskCategories(role, category) {
	const rs = await models.RoleGroup.findOne({ role });
	const tasks = _.map(_.get(rs, 'tasks'), t => t.toString());

	return category && tasks.length
		? _.intersectionBy(category, tasks, _.toString)
		: category || (tasks.length ? tasks : null);
}

async function getTasks(
	{
		start,
		limit,
		disableLimit,
		blockId,
		roomId,
		status,
		from,
		to,
		category,
		sort,
		order,
		checking,
		workingType,
		isFollow,
		messageId,
		timeKey,
		assigned,
		excludeBlockId,
		hasAttachment,
		compressImage,
		excludeCategories,
		tag,
		home,
		...query
	},
	user,
	lang
) {
	const role = await getTaskRole(user);
	if (role.denied) throw new ThrowReturn().status(403);

	start = parseInt(start) || 0;
	const _limit = parseInt(limit) || 20;
	limit = disableLimit === 'true' ? 1000 : _limit;
	workingType = parseInt(workingType);
	sort = sort || 'createdAt';
	order = order || 'descend';
	timeKey = timeKey || 'time';

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
	});

	const filter = _.pickBy({
		...query,
		...filters,
		roomIds: roomId && { $in: getArray(roomId).toMongoObjectIds() },
		status: status && getArray(status),
		checking: checking && getArray(checking),
		workingType,
	});
	const $and = [];

	if (tag) {
		const ctg = await models.TaskCategory.findOne({ tag }).select('_id');
		if (ctg) {
			category = ctg._id;
		}
	}

	const categories = await getTaskCategories(user.role, category && getArray(category).toMongoObjectIds());
	if (categories) {
		filter.category = { $in: categories };
	}
	if (role.statusOnly) {
		$and.push({
			$or: [
				{ assigned: { $in: [mongoose.Types.ObjectId(user._id), null] } },
				{
					status: {
						$in: [TaskStatus.Waiting, TaskStatus.Confirmed, TaskStatus.Checked, TaskStatus.Expired],
					},
				},
			],
		});
	}
	if ($and.length) {
		filter.$and = $and;
	}
	if (from) {
		if (timeKey === 'time') from = moment(from).add(7, 'hour').toDate();
		_.set(filter, [timeKey, '$gte'], from);
	}
	if (to) {
		if (timeKey === 'time') to = moment(to).add(7, 'hour').toDate();
		_.set(filter, [timeKey, '$lte'], to);
	}
	if (isFollow) {
		filter.isFollow = isFollow === 'true' ? true : { $ne: true };
	}
	if (messageId) {
		const message = await models.Messages.findById(messageId).select('otaBookingId otaName');
		const booking =
			message.otaBookingId &&
			(await models.Booking.findOne({
				otaName: message.otaName,
				otaBookingId: message.otaBookingId,
			}).select('_id'));

		if (booking) {
			filter.bookingId = booking._id;
		} else {
			filter.messageId = message._id;
		}
	}
	if (assigned) {
		filter.assigned = { $in: getArray(assigned).toMongoObjectIds() };
	}
	if (hasAttachment) {
		filter['attachments.0'] = { $exists: hasAttachment === 'true' };
	}
	if (excludeCategories) {
		filter.category = { $nin: excludeCategories };
	}

	const [tasks, total] = await Promise.all([
		models.Task.find(filter)
			.sort({ [sort]: order === 'descend' ? -1 : 1 })
			.select('-notes')
			.skip(start)
			.limit(limit)
			.populate({
				path: 'category',
				select: 'name nameEn',
				transform: doc => {
					return lang === LANGUAGE.EN ? { name: doc.nameEn } : doc;
				},
			})
			.populate('createdBy assigned', 'name username')
			.populate('blockId', 'info.name info.shortName')
			.populate({
				path: 'bookingId',
				select: 'price from to otaName otaBookingId numberAdults numberChilden',
				populate: {
					path: 'payouts',
					select: 'currencyAmount description',
					match: {
						state: { $ne: PayoutStates.DELETED },
					},
				},
			})
			.populate('roomIds', 'info.roomNo')
			.populate('invoice'),
		models.Task.countDocuments(filter),
	]);

	if (compressImage) {
		const compressAttachments = tasks.flatMap(task => task.attachments);
		const newCheckListAttachments = await getCompressImages(_.compact(compressAttachments), 5, {
			maxWidth: MAX_SIZE,
			maxHeight: MAX_SIZE,
			// forceCompress: true,
		});

		if (newCheckListAttachments) {
			tasks.forEach(task => {
				task.attachments = _.map(
					task.attachments,
					attachment => newCheckListAttachments[attachment] || attachment
				);
			});
		}
	}

	return { tasks, total };
}

async function getTaskStatus(query, user) {
	const { filters } = await models.Host.getBlocksOfUser({ user });

	const $match = {
		...filters,
		time: { $gte: new Date().minTimes(), $lte: new Date().maxTimes() },
	};

	return this.aggregate([
		{
			$match,
		},
		{
			$group: {
				_id: '$status',
				count: { $sum: 1 },
			},
		},
	]);
}

async function getTask(taskId, user) {
	const role = await getTaskRole(user);
	const task = await models.Task.findById(taskId)
		.populate('createdBy assigned notes.createdBy', 'name username')
		.populate('blockId', 'info.name')
		.populate({
			path: 'bookingId',
			select: 'price from to otaName otaBookingId numberAdults numberChilden guestId status checkin checkout expectCheckIn expectCheckOut',
			populate: {
				path: 'guestId',
				select: 'name fullName country ota phone avatar genius',
			},
		})
		.populate('roomIds', 'info.roomNo')
		.populate('assetActionId')
		.populate('linked.taskId', 'no status')
		.populate({
			path: 'linked.checkItemId',
			select: 'status label checkListCategoryId',
			populate: { path: 'checkListCategoryId', select: 'name' },
		})
		.populate({
			path: 'checkList',
			select: '-logs',
			populate: [
				{ path: 'createdBy', select: 'username name' },
				{ path: 'checkListCategoryId', select: 'name' },
				{
					path: 'petitionIds',
					populate: { path: 'createdBy', select: 'username name' },
					select: '-logs',
				},
				{
					path: 'taskIds',
					populate: [
						{ path: 'category', select: 'name' },
						{ path: 'createdBy assigned', select: 'username name' },
					],
					select: 'time no status fee category createdBy expired assigned',
				},
			],
		})
		.lean();

	if (!task) throw new ThrowReturn('Task does not exist');

	const taskStatus = [];

	if (role.statusOnly) {
		if (!_.get(task.assigned, 'length') || _.some(task.assigned, t => t._id.toString() === user._id.toString())) {
			const statusRequireRoles = [TaskStatus.Confirmed, TaskStatus.Checked, TaskStatus.Done, TaskStatus.Deleted];
			taskStatus.push(...statusRequireRoles);
		}
	} else if (role.fullControl) {
		taskStatus.push(..._.values(TaskStatus));
	}

	const assetIssues = await models.AssetIssue.getAssetIssueByTask(task._id);
	task.assetIssues = assetIssues;
	task.enableUpdateProperty = !assetIssues.length;

	const parseLog = getParseLog(LOG_FIELDS_LABELS, LOG_VALUES_MAPPER, { parsedTxtKey: 'note' });

	task.notes = task.notes.map(note => (note.autoGen && note.field ? parseLog(note) : note));

	return { task, taskStatus };
}

async function validateAssetIssues({ category, assetIssueIds, blockId, roomIds }) {
	if (!category.isAssetTask()) throw new ThrowReturn('Category does not support add asset issue');
	const { isErr, msg } = await models.AssetIssue.validate(assetIssueIds, { blockId, roomIds });
	if (isErr) throw new ThrowReturn(msg);
}

async function createOrUpdateAssetAction({ assetActionId, createdBy, blockId, roomIds, description }) {
	const data = {
		...assetActionId,
		createdBy,
		blockId,
		roomId: _.isArray(roomIds) ? roomIds[0] : roomIds,
		description,
	};
	const assetAction = await models.AssetAction.createOrUpdate(data);
	return assetAction;
}

async function processTaskData({ data, category, checkItem, user }) {
	const processedData = {
		createdBy: user._id,
		source: TaskSource.Cms,
		linked: _.get(checkItem, '_id') ? { taskId: checkItem.taskId._id, checkItemId: checkItem._id } : null,
	};

	if (category.isAssetTask() && data.assetActionId) {
		const assetAction = await createOrUpdateAssetAction({ ...data, createdBy: user._id });
		processedData.assetActionId = assetAction._id;
	}

	if (category.tag === TaskTags.GUEST_REQUEST) {
		processedData.reason = TaskReason.GuestRequest;
	}

	return processedData;
}

async function createTask(user, data) {
	if (data.expired && data.expired < new Date().toISOString()) throw new ThrowReturn('Expired time invalid');
	const assetIssueIds = data.assetIssueIds || [];
	const isCreateFromCheckList = !!data.checkItemId;

	const category = await models.TaskCategory.findByIdAndValidate(data.category);

	if (category.isRefund()) {
		await models.Task.validateRefundTask(data);
	}

	if (assetIssueIds.length) {
		await validateAssetIssues({ category, assetIssueIds, blockId: data.blockId, roomIds: data.roomIds });
	}

	const checkItem = isCreateFromCheckList ? await models.CheckItem.findOneAndValidate(data.checkItemId) : {};
	if (isCreateFromCheckList && checkItem) {
		const blockIdOfLinkedTask = _.get(checkItem, 'taskId.blockId', '').toString();
		if (data.blockId !== blockIdOfLinkedTask) {
			throw new ThrowReturn('Block does not match with block of linked task');
		}
	}

	const processedData = await processTaskData({
		data,
		category,
		checkItem,
		user,
	});
	Object.assign(data, processedData);
	_.unset(data, 'checking');

	const task = await models.Task.create(data);

	if (isCreateFromCheckList) {
		checkItem.status = CHECK_ITEM_STATUS.FAIL;
		await checkItem.addTask(task._id, user._id);
	}

	if (assetIssueIds.length) {
		await assetIssueIds.asyncMap(assetIssueId =>
			models.AssetIssue.addTask({ assetIssueId, task, userId: user._id, isValidate: false })
		);
	}

	// if (category.isAssetTask()) {
	// 	await task.createTaskPayout(user, { categoryId: category.payoutCategory });
	// 	await task.save();
	// }

	if (data.autoMessages && data.autoMessages.length) {
		await models.TaskAutoMessage.insertMany(data.autoMessages.map(m => ({ ...m, taskId: task._id })));
	}

	return task;
}

async function getAssetActionId(task, assetActionId) {
	let _assetActionId = assetActionId;

	if (task.assetActionId || !_.isUndefined(assetActionId)) {
		if (task.assetActionId && !assetActionId) {
			await models.AssetAction.del(task.assetActionId);
			_assetActionId = null;
		} else if (task.assetActionId || assetActionId) {
			const updateData = {
				blockId: task.blockId,
				roomId: _.isArray(task.roomIds) ? task.roomIds[0] : task.roomIds,
				createdBy: task.createdBy,
				description: task.description,
			};
			const assetActionData = _.assign({ _id: task.assetActionId || undefined }, assetActionId, updateData);

			const assetAction = await models.AssetAction.createOrUpdate(assetActionData);
			_assetActionId = assetAction._id.toString();
		}
	}

	return _assetActionId;
}

async function updateTask(taskId, data, user) {
	const task = await models.Task.findById(taskId);

	const category = await models.TaskCategory.findByIdAndValidate(task.category);

	if (category.isRefund()) {
		await models.Task.validateRefundTask({
			paymentSource: data.paymentSource || task.paymentSource,
			reasonId: data.reasonId || task.reasonId,
			reasonTxt: data.reasonTxt || task.reasonTxt,
		});

		if (data.fee.unitPrice !== task.fee.unitPrice && task.payoutId) {
			throw new ThrowReturn('Khoản hoàn tiền đang chờ duyệt không thể cập nhật giá!');
		}
	}

	await task.updateData(data, user);

	if (data.expired && data.expired < new Date().toISOString()) throw new ThrowReturn('Expired time invalid');

	if (data.autoMessages && data.autoMessages.length) {
		await models.TaskAutoMessage.insertMany(data.autoMessages.map(m => ({ ...m, taskId: task._id })));
	}
	if (data.attachments && data.attachments.length) {
		const newCheckListAttachments = await getCompressImages(data.attachments, 5, {
			maxWidth: MAX_SIZE,
			maxHeight: MAX_SIZE,
			// forceCompress: true,
		});

		if (newCheckListAttachments) {
			data.attachments.forEach((attachment, index) => {
				data.attachments[index] = newCheckListAttachments[attachment] || attachment;
			});
		}
	}

	if (category.isAssetTask() && data.assetActionId !== undefined) {
		const assetActionId = await getAssetActionId(task, data.assetActionId);
		task.assetActionId = assetActionId;
		// await task.createTaskPayout(user, { categoryId: category.payoutCategory });
		await task.save();
	}

	if (category.isRefund() && !task.payoutId && task.status === TaskStatus.Done) {
		const payoutCtg = await models.PayoutCategory.findOne({ payoutType: PayoutType.REFUND });
		await models.PayoutRequestConfig.checkPermission({
			user,
			amount: task.fee.amount,
			categoryId: payoutCtg._id,
		});
		await task.createTaskPayout(user, { payoutType: PayoutType.REFUND });
		await task.save();
	}

	return task;
}

async function checkAuthStatusAction(user, task) {
	const role = await getTaskRole(user);

	if (!role.fullControl && (!role.statusOnly || !task.assigned.includesObjectId(user._id))) {
		throw new ThrowReturn().status(403);
	}
}

async function changeTaskStatus(taskId, user, data) {
	const task = await models.Task.getTaskById(taskId);

	const isDel = data.status === TaskStatus.Deleted;

	if (user) await checkAuthStatusAction(user, task, data.status);
	if (isDel) {
		const isContainCheckItem = await task.isContainCheckItem();
		if (isContainCheckItem) throw new ThrowReturn('Check list exist, can not change status');
	}

	data.source = data.source || TaskSource.Cms;

	const category = await models.TaskCategory.findByIdAndValidate(task.category);

	if (data.fromGroupMsg && category.canCompleteByMessage === false) {
		throw new ThrowReturn('Không thể thay đổi trang thái nhiệm vụ này qua tin nhắn!');
	}

	// if (category.isAssetTask()) {
	// 	if (task.assetActionId && [TaskStatus.Deleted, TaskStatus.Done].includes(task.status)) {
	// 		throw new ThrowReturn('Nhiệm vụ đã kết thúc!');
	// 	}
	// }

	let payout;
	let payouts;

	if (isDel && task.payoutId) {
		payout = await models.Payout.findById(task.payoutId);
		if (payout.isApproved()) {
			throw new ThrowReturn('Chi phí đã được duyệt, không thể xóa!');
		}
	}

	if (isDel && task.payoutIds && task.payoutIds.length) {
		payouts = await models.Payout.find({ _id: task.payoutIds });
		if (payouts.some(p => p.isApproved())) {
			throw new ThrowReturn('Chi phí đã được duyệt, không thể xóa!');
		}
	}

	if (user && !task.payoutId && category.isRefund() && task.status === TaskStatus.Done) {
		const payoutCtg = await models.PayoutCategory.findOne({ payoutType: PayoutType.REFUND });
		await models.PayoutRequestConfig.checkPermission({
			user,
			amount: task.fee.amount,
			categoryId: payoutCtg._id,
		});
		await task.createTaskPayout(user, { payoutType: PayoutType.REFUND });
	}

	await task.changeStatus(data, user);

	if (category.isAssetTask() && task.assetActionId) {
		const assetAction = await models.AssetAction.findById(task.assetActionId);
		if (task.status === TaskStatus.Done) {
			await models.AssetAction.approve(assetAction._id, user._id);
		}
		if (task.status === TaskStatus.Deleted) {
			await models.AssetAction.del(assetAction._id);
		}
	}

	if (isDel) {
		if (payout) {
			payout.state = PayoutStates.DELETED;
			payout.deletedBy = user && user._id;
			await payout.save();

			task.payoutId = null;
		}

		if (payouts) {
			await payouts.asyncMap(p => {
				p.state = PayoutStates.DELETED;
				p.deletedBy = user && user._id;
				return p.save();
			});

			task.payoutIds = [];
		}
	}

	await task.save();

	return task;
}

async function updateDoneStatus(taskId, user, data) {
	const task = await models.Task.getTaskById(taskId);

	if (task.status !== TaskStatus.Done) {
		throw new ThrowReturn('Nhiệm vụ này chưa hoàn thành!');
	}

	const note = _.findLast(task.notes, n => n.status === TaskStatus.Done);
	if (!note) {
		throw new ThrowReturn('Nhiệm vụ này chưa hoàn thành!');
	}

	note.images = _.uniq([...note.images, ...data.images]);
	await task.save();

	return { task, note };
}

async function addNote(taskId, userId, note, images) {
	const task = await models.Task.findOneAndUpdate(
		{ _id: taskId },
		{
			$push: {
				notes: {
					note,
					images,
					createdAt: new Date(),
					createdBy: userId,
				},
			},
		},
		{ new: true }
	);

	return { note: _.last(task.notes), task };
}

async function updateNote(taskId, noteId, userId, note, images) {
	const task = await models.Task.findOneAndUpdate(
		{
			_id: taskId,
			notes: {
				$elemMatch: {
					_id: noteId,
					createdBy: userId,
					autoGen: { $ne: true },
				},
			},
		},
		{
			$set: { 'notes.$.note': note, 'notes.$.images': images },
		},
		{ new: true }
	);

	return { note: _.find(task.notes, n => n._id.equals(noteId)), task };
}

async function getStats(query, user) {
	const { blockId, assigned, status, from, to, category, excludeBlockId } = query;

	const { filters } = await models.Host.getBlocksOfUser({
		user,
		filterBlockIds: blockId,
		excludeBlockId,
	});

	const sQuery = {
		assigned,
		category,
		from,
		to,
		status: status && status.split(','),
		...filters,
	};

	const { bookingIds, ...taskStats } = await models.Task.getStats(sQuery);

	const reviewsList = await models.BookingReview.find({
		bookingId: bookingIds,
	})
		.select('scores otaName rating bookingId otaBookingId')
		.lean();

	const reviewObj = _.groupBy(reviewsList, 'otaName');
	const reviews = {};
	_.forEach(OTA_MAX_STAR, (value, key) => {
		reviews[key] = {
			highestStar: value,
			data: reviewObj[key],
		};
	});
	taskStats.reviews = reviews;

	return taskStats;
}

async function getCategories(query, user) {
	const filter = {};

	const role = await models.RoleGroup.findOne({ role: user.role }).select('tasks');
	if (query.hasCheckList === 'true') filter.hasCheckList = true;

	if (query.isSub === 'true') {
		filter.parent = { $ne: null };
		if (role && role.tasks && role.tasks.length) {
			filter.parentId = { $in: role.tasks };
		}
	} else {
		filter.parent = null;
		if (role && role.tasks && role.tasks.length) {
			filter._id = { $in: role.tasks };
		}
	}

	if (query.parentId) filter.parentId = query.parentId;

	return models.TaskCategory.find(filter).sort({ order: 1 }).populate('subCategories').populate('departmentIds');
}

async function updateTaskChecking(taskId, checking, user) {
	const task = await models.Task.getTaskById(taskId);
	await task.changeCheckStatus(checking, user);
}

async function updateTaskBooking(taskId, otaBookingId) {
	const task = await models.Task.getTaskById(taskId);

	const bookings = await models.Booking.find({ otaBookingId }).select('_id');
	if (!bookings.length) throw new ThrowReturn().status(404);

	task.bookingId = _.uniqBy([...task.bookingId, ..._.map(bookings, '_id')], _.toString);
	await task.save();

	return task;
}

async function deleteTaskBooking(taskId, bookingId) {
	if (!mongoose.Types.ObjectId.isValid(bookingId)) {
		throw new ThrowReturn('Invalid bookingId!');
	}
	const task = await models.Task.getTaskById(taskId);

	task.bookingId = task.bookingId.filter(bid => bid.toString() !== bookingId);
	await task.save();

	return task;
}

async function updateVATTask(booking) {
	const tasks = await models.Task.find({ bookingId: booking._id, status: { $ne: TaskStatus.Done } });
	await tasks.asyncMap(task => task.updatePriceVAT());
}

async function onCancelReservation(booking) {
	try {
		const cleaning = await models.TaskCategory.getCleaning();
		const cleaningBack = await models.TaskCategory.getCleaningBack();

		const tasks = await models.Task.find({
			bookingId: booking,
			status: { $in: [TaskStatus.Waiting, TaskStatus.Confirmed] },
			category: { $in: [cleaning._id, cleaningBack._id] },
		}).select('_id');
		if (!tasks.length) return;

		await tasks.asyncMap(task =>
			changeTaskStatus(task._id, null, {
				status: TaskStatus.Deleted,
				source: TaskSource.Auto,
			}).catch(() => {})
		);
	} catch (e) {
		logger.error('Task_onCancelReservation', e);
	}
}

async function autoCheckoutBooking(blockId, roomIds, date) {
	try {
		const block = await models.Block.findOne({ _id: blockId, 'locker.forceCheckin': true }).select('_id');
		if (block) return;

		const bookingsNeedCheckout = await models.Booking.find({
			status: BookingStatus.CONFIRMED,
			error: 0,
			to: date,
			reservateRooms: { $in: roomIds },
			checkedIn: true,
			checkedOut: false,
		});
		if (!bookingsNeedCheckout.length) return;

		const reservations = await models.Reservation.find({
			bookingId: _.map(bookingsNeedCheckout, '_id'),
			roomId: roomIds,
		}).select('bookingId guests');

		await reservations.asyncForEach(reservation => {
			const booking = bookingsNeedCheckout.find(b => b._id.equals(reservation.bookingId));

			return reservation.guests
				.filter(guest => !guest.checkout)
				.asyncForEach(guest =>
					BookingActions.checkout({
						booking,
						guestId: guest.guestId,
						checkoutType: BookingCheckinType.A,
					}).catch(e => {
						logger.error('Task_autoCheckoutBooking_guest', e);
					})
				);
		});
	} catch (e) {
		logger.error('Task_autoCheckoutBooking', e);
	}
}

async function onTaskStatusUpdate(task, user) {
	try {
		if (_.get(task, 'linked.checkItemId')) await CheckList.syncCheckItemStatus(task, user._id);
		if (!task.roomIds || !task.roomIds.length || task.status !== TaskStatus.Done || !task.time) return;
		if (!(await task.isCleaningTask())) return;

		const date = new Date(moment(task.time).utcOffset(0).format('YYYY-MM-DD')).zeroHours();

		autoCheckoutBooking(task.blockId, task.roomIds, date);

		if (task.roomIds && task.roomIds.length) {
			await models.BlockNotes.updateCleaningState({
				blockId: task.blockId,
				roomIds: task.roomIds,
				date,
				user,
				state: CLEANING_STATE.VC,
			});
		}
	} catch (e) {
		logger.error('Task_onTaskStatusUpdate', e);
	}
}

function getDatesForTask(from, to) {
	const ranges = rangeDate(from, to, false).toArray();

	if (ranges.length <= 6) {
		return [ranges[Math.floor(ranges.length / 2)]];
	}

	return _.chunk(ranges, 3)
		.filter((r, i) => i !== 0 && r.length > 1)
		.map(r => r[0]);
}

async function onCheckin(booking) {
	try {
		if (booking.serviceType !== Services.Day) return;

		await TaskLock.acquire(`${booking._id}`, async () => {
			const days = booking.to.diffDays(booking.from);
			if (Settings.MinNightsForFreeCleaningTask.value > days) return;

			const block = await models.Block.findOne({ _id: booking.blockId, disableAutoTask: true }).select('_id');
			if (block) return;

			const cleanningTask = await models.TaskCategory.getCleaning();
			const cleaningBack = await models.TaskCategory.getCleaningBack();

			const createdTask = await models.Task.findOne({
				category: { $in: [cleanningTask._id, cleaningBack._id] },
				bookingId: booking._id,
				time: { $gt: booking.from },
				status: { $ne: TaskStatus.Deleted },
			}).select('_id');
			if (createdTask) return;

			const rooms = await models.Reservation.getReservateRooms(booking.blockId, booking._id);
			const invalidRoom = await models.Room.findOne({ _id: rooms, isOperating: false }).select('_id');
			if (invalidRoom) return;

			const dates = getDatesForTask(booking.from, booking.to);
			const tasks = await dates.asyncMap(date => {
				date.setHours(14);
				return rooms.asyncMap(roomId =>
					models.Task.create({
						category: cleaningBack._id,
						bookingId: booking._id,
						time: date,
						status: TaskStatus.Confirmed,
						reason: TaskReason.Plan,
						blockId: booking.blockId,
						roomIds: [roomId],
						description: cleaningBack.name,
						source: TaskSource.Auto,
						departmentId: _.head(cleaningBack.departmentIds),
						notifyOnCreate: false,
						notificationType: cleaningBack.notificationType,
						reminderNotificationType: cleaningBack.reminderNotificationType,
						reminder: cleaningBack.reminder,
					})
				);
			});

			eventEmitter.emit(EVENTS.TASK_CREATE_AUTO, booking, _.flatten(tasks));
		});
	} catch (e) {
		logger.error('Task_onCheckin', e);
	}
}

async function quantityStatistic({ from, to, blockId, category }, language) {
	const query = {
		time: { $gte: new Date(from).minTimes(), $lte: new Date(to).maxTimes() },
		blockId: mongoose.Types.ObjectId(blockId),
		status: { $ne: TaskStatus.Deleted },
	};
	const project = {
		category: 1,
		assigned: 1,
		roomIds: 1,
	};

	if (category) {
		const taskCategory = await models.TaskCategory.findOne({ tag: category }).select('_id').lean();
		if (taskCategory) _.set(query, 'category', taskCategory._id);
		_.set(project, 'subCategory', 1);
	}

	const tasks = await models.Task.aggregate()
		.match(query)
		.unwind({
			path: '$roomIds',
			preserveNullAndEmptyArrays: true,
		})
		.unwind({
			path: '$assigned',
			preserveNullAndEmptyArrays: true,
		})
		.project(project)
		.exec();

	const grByRooms = _.groupBy(tasks, 'roomIds');
	const grByTags = category ? _.groupBy(tasks, 'subCategory') : _.groupBy(tasks, 'category');
	const grByUsers = _.groupBy(tasks, 'assigned');

	const roomIds = _.filter(_.keys(grByRooms), key => mongoose.Types.ObjectId.isValid(key));
	const userIds = _.filter(_.keys(grByUsers), key => mongoose.Types.ObjectId.isValid(key));
	const tagIds = _.filter(_.keys(grByTags), key => mongoose.Types.ObjectId.isValid(key));

	const rooms = await models.Room.find({ _id: roomIds }).select('info.roomNo').lean();
	const users = await models.User.find({ _id: userIds }).select('name username').lean();
	const tags = await models.TaskCategory.find({ _id: tagIds }).select('name nameEn tag').lean();

	rooms.forEach(room => {
		room.total = grByRooms[room._id].length;
	});
	tags.forEach(tag => {
		tag.total = grByTags[tag._id].length;
	});
	users.forEach(user => {
		user.total = grByUsers[user._id].length;
	});

	if (grByRooms.undefined || grByRooms.null) {
		const undefinedLength = _.get(grByRooms, 'undefined.length') || 0;
		const nullLength = _.get(grByRooms, 'null.length') || 0;
		rooms.push({
			_id: uuid(),
			info: {
				roomNo: 'Khác',
			},
			total: undefinedLength + nullLength,
		});
	}

	if (grByTags.undefined || grByTags.null) {
		const undefinedLength = _.get(grByTags, 'undefined.length') || 0;
		const nullLength = _.get(grByTags, 'null.length') || 0;
		tags.push({
			_id: uuid(),
			name: 'Khác',
			tag: 'another',
			total: undefinedLength + nullLength,
		});
	}

	if (grByUsers.undefined || grByUsers.null) {
		const undefinedLength = _.get(grByUsers, 'undefined.length') || 0;
		const nullLength = _.get(grByUsers, 'null.length') || 0;
		users.push({
			_id: uuid(),
			name: 'Khác',
			username: 'another',
			total: undefinedLength + nullLength,
		});
	}
	if (language === LANGUAGE.EN) {
		_.forEach(tags, item => {
			item.name = item.nameEn;
			return item;
		});
	}

	return {
		rooms: _.orderBy(rooms, 'total', 'desc'),
		tags: _.orderBy(tags, 'total', 'desc'),
		users: _.orderBy(users, 'total', 'desc'),
		total: tasks.length,
	};
}

async function addAssetIssues({ taskId, assetIssueIds, user }) {
	if (!_.get(assetIssueIds, 'length', 0)) return assetIssueIds;

	const task = await models.Task.findById(taskId).populate('category', 'type').lean();
	if (task.category.type !== 'asset') throw new ThrowReturn('Category does not support add asset issue');

	const { isErr, msg } = await models.AssetIssue.validate(assetIssueIds, {
		blockId: task.blockId,
		roomIds: task.roomIds,
	});
	if (isErr) throw new ThrowReturn(msg);

	await assetIssueIds.asyncMap(assetIssue =>
		models.AssetIssue.addTask({ assetIssueId: assetIssue, task, userId: user._id, isValidate: false })
	);

	return { assetIssueIds };
}

async function removeAssetIssues({ taskId, assetIssueIds, user }) {
	if (!_.get(assetIssueIds, 'length', 0)) return assetIssueIds;

	const task = await models.Task.findById(taskId).populate('category', 'type').lean();
	if (task.category.type !== 'asset') throw new ThrowReturn('Category does not support add asset issue');

	const { isErr, msg } = await models.AssetIssue.validate(assetIssueIds, {
		blockId: task.blockId,
		roomIds: task.roomIds,
	});
	if (isErr) throw new ThrowReturn(msg);

	await assetIssueIds.asyncMap(assetIssue =>
		models.AssetIssue.removeTask({ assetIssueId: assetIssue, task, userId: user._id, isValidate: false })
	);

	return { assetIssueIds };
}

async function onSplitReservation(booking, newBooking) {
	try {
		const cleaning = await models.TaskCategory.getCleaning();
		const cleaningBack = await models.TaskCategory.getCleaningBack();

		const tasks = await models.Task.find({
			bookingId: booking._id,
			status: { $in: [TaskStatus.Waiting, TaskStatus.Confirmed] },
			category: { $in: [cleaning._id, cleaningBack._id] },
		});
		if (!tasks.length) return;

		const oldTo = booking.to.toDateMysqlFormat();
		const newTo = newBooking.to.toDateMysqlFormat();

		await tasks.asyncMap(task => {
			const time = new Date(task.time).toISOString().slice(0, 10);
			if (time >= oldTo && time < newTo) {
				task.bookingId = newBooking._id;
				return task.save();
			}
		});
	} catch (e) {
		logger.error('Task_onSplitReservation', e);
	}
}

async function createAutoVATTask(booking) {
	try {
		await TaskLock.acquire(`${booking._id}`, async () => {
			const block = await models.Block.findOne({ _id: booking.blockId }).select('groupIds');
			if (!block) return;

			const group = await models.UserGroup.findOne({ _id: block.groupIds[0], 'configs.autoVATTask': true });
			if (!group) return;

			const vatCtg = await models.TaskCategory.getVAT();
			const task = await models.Task.findOne({
				bookingId: booking._id,
				category: vatCtg._id,
				status: {
					$ne: TaskStatus.Deleted,
				},
			}).select('_id');
			if (task) return;

			const guest = await models.Guest.findById(booking.guestId).select('address email');

			await models.Task.create({
				category: vatCtg._id,
				bookingId: [booking._id],
				blockId: block._id,
				other: {
					address: guest.address,
					email: guest.email,
				},
			});
		});
	} catch (e) {
		logger.error('createAutoVATTask', e);
	}
}

async function cancelAutoVATTask(booking) {
	try {
		const block = await models.Block.findOne({ _id: booking.blockId }).select('groupIds');
		if (!block) return;

		const group = await models.UserGroup.findOne({ _id: block.groupIds[0], 'configs.autoVATTask': true });
		if (!group) return;

		const vatCtg = await models.TaskCategory.getVAT();
		const task = await models.Task.findOne({
			bookingId: booking._id,
			category: vatCtg._id,
			status: TaskStatus.Waiting,
			crearedBy: null,
		}).select('_id');
		if (!task) return;

		await changeTaskStatus(task._id, null, {
			status: TaskStatus.Deleted,
			source: TaskSource.Auto,
		});
	} catch (e) {
		logger.error('cancelAutoVATTask', e);
	}
}

eventEmitter.on(EVENTS.RESERVATION_UPDATE_PRICE, updateVATTask);
eventEmitter.on(EVENTS.RESERVATION_CANCEL, booking => {
	onCancelReservation(booking);
	cancelAutoVATTask(booking);
});
eventEmitter.on(EVENTS.RESERVATION_NOSHOW, booking => {
	onCancelReservation(booking);
	createAutoVATTask(booking);
});
eventEmitter.on(EVENTS.RESERVATION_CHARGED, booking => {
	onCancelReservation(booking);
	createAutoVATTask(booking);
});
eventEmitter.on(EVENTS.TASK_UPDATE_STATUS, onTaskStatusUpdate);
// eventEmitter.on(EVENTS.RESERVATION_UPDATE, onReservationUpdate);
eventEmitter.on(EVENTS.RESERVATION_CHECKIN, onCheckin);
eventEmitter.on(EVENTS.RESERVATION_SPLIT, onSplitReservation);
eventEmitter.on(EVENTS.RESERVATION_CHECKOUT, createAutoVATTask);

module.exports = {
	getTasks,
	getTask,
	createTask,
	updateTask,
	changeTaskStatus,
	addNote,
	updateNote,
	getTaskStatus,
	getStats,
	getCategories,
	updateTaskChecking,
	updateTaskBooking,
	deleteTaskBooking,
	updateDoneStatus,
	quantityStatistic,
	addAssetIssues,
	removeAssetIssues,
};

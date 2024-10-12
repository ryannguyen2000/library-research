/* eslint-disable no-lonely-if */
const _ = require('lodash');
const moment = require('moment');
const fs = require('fs');
const AsyncLock = require('async-lock');

const { eventEmitter, EVENTS } = require('@utils/events');
const {
	MessageGroupType,
	TaskStatus,
	TaskTags,
	ONE_MINUTE,
	OTTs,
	TaskPriority,
	UserRoles,
	USER_CONTACT_TYPE,
	MessageVariable,
} = require('@utils/const');
const { logger } = require('@utils/logger');
const { formatPriceWithDot } = require('@utils/price');

const models = require('@models');
const messageOTT = require('@controllers/message/ott');

const asyncLock = new AsyncLock({ timeout: ONE_MINUTE * 10, maxPending: 5000 });

const jobs = [];
const ALLOW_OTTS = [OTTs.Zalo];
const MSG_TIMEOUT = 45 * 1000;

fs.readdirSync(__dirname)
	.filter(n => n.endsWith('.auto.js'))
	.map(n => n.replace('.js', ''))
	.forEach(name => {
		const modelFile = `./${name}`;
		const model = require(modelFile);
		const modelName = name.replace('.auto', '');

		jobs.push({ ...model, jobName: modelName });
	});

jobs.sort((a, b) => (a.PRIORITY || 99) - (b.PRIORITY || 99));

function normMsg(txt, keywords) {
	txt = _.trim(txt).toLowerCase();

	if (keywords) {
		keywords.forEach(key => {
			txt = txt.replaceAll(key, '');
		});

		txt = _.trim(txt);
	}

	return txt;
}

async function findRooms(txtMsg, mthread, keywords) {
	let blockNo;
	let roomNos;
	let roomIds;
	let blockId;

	roomNos = normMsg(txtMsg, keywords);
	blockNo = _.last(roomNos.split(' '));

	if (mthread.blockIds && mthread.blockIds.length) {
		const block = await models.Block.findOne({
			_id: { $in: mthread.blockIds },
			'info.shortName': new RegExp(`^${_.escapeRegExp(blockNo)}$`, 'i'),
		}).select('_id');
		if (block) {
			blockId = block._id;
			roomNos = roomNos.replaceAll(blockNo, '').trim();
		} else {
			blockId = _.head(mthread.blockIds);
		}
	} else if (mthread.blockId) {
		blockId = mthread.blockId;
	} else if (blockNo) {
		const block = await models.Block.findOne({
			active: true,
			isProperty: true,
			groupIds: { $in: mthread.groupIds },
			'info.shortName': new RegExp(`^${_.escapeRegExp(blockNo)}$`, 'i'),
		}).select('_id');
		if (block) {
			blockId = block._id;
			roomNos = roomNos.replaceAll(blockNo, '').trim();
		}
	}

	if (blockId && roomNos) {
		const rooms = await models.Room.find({
			blockId,
			virtual: false,
			'info.roomNo': { $ne: null },
		})
			.select('_id info.roomNo info.sRoomNo')
			.lean();

		roomIds = rooms
			.filter(
				room =>
					roomNos.includes(room.info.roomNo.toLowerCase()) ||
					(room.info.sRoomNo && room.info.sRoomNo.some(sRoomNo => roomNos.includes(sRoomNo.toLowerCase())))
			)
			.map(r => r._id);
	}

	return {
		blockId,
		roomIds,
		hasPA: roomNos && roomNos.includes(TaskTags.PA),
	};
}

async function runJobs(params) {
	const user = await models.User.findOne({
		enable: true,
		otts: { $elemMatch: { ottName: params.ottName, ottId: params.ottId } },
	});

	if (!user) return;

	if (params.thread && !params.thread.isGroup && !params.thread.isUser) {
		const updateData = {
			isUser: true,
			inquiry: false,
			notification: user.role !== UserRoles.MAID,
			userType: USER_CONTACT_TYPE.USER,
		};
		await models.Messages.updateOne({ _id: params.thread._id }, updateData);
		await models.BlockInbox.updateOne({ messageId: params.thread._id }, updateData);
	}

	const msgOrigin = _.get(params.msgDoc.message, 'title') || params.msgDoc.message;
	const normMessage = _.trim(msgOrigin).toLowerCase();
	let removedAllMentionsMsg = normMessage;

	if (msgOrigin && params.msgDoc.mentions) {
		let msg = msgOrigin;
		_.forEach(params.msgDoc.mentions, m => {
			msg = msg.replace(msgOrigin.substring(m.pos, m.len), '');
		});

		removedAllMentionsMsg = _.trim(msg).toLowerCase();
	}

	for (const job of jobs) {
		if (!job.validateKeywords) {
			continue;
		}

		const vData = await job.validateKeywords({
			message: normMessage,
			thread: params.thread,
			msgDoc: params.msgDoc,
			time: params.time,
			user,
			removedAllMentionsMsg,
		});

		if (!vData.isValid) continue;

		const roomData = await findRooms(normMessage, params.thread, vData.keywords);

		const ok = await job.runJob({ ...params, ...vData, ...roomData, user });
		if (ok) {
			break;
		}
	}
}

async function onReceiveMessage(data, msg) {
	const msgDoc = _.get(msg, 'data.message');
	if (!msgDoc || !ALLOW_OTTS.includes(data.ottSource)) return;

	try {
		const time = moment(msgDoc.time);
		await asyncLock.acquire(`onMessage_${data.ottSource}_${msgDoc.toUid}`, async () => {
			await runJobs({
				msgDoc,
				thread: data.mthread,
				ottName: data.ottSource,
				ottAccount: data.ottPhone,
				time: time.isValid() ? time.toDate() : new Date(),
				ottId: msgDoc.userId,
				msgInfo: msg.data,
			});
		});
	} catch (e) {
		logger.error('onReceiveMessage', msg, e);
	}
}

async function findOttUsers(userIds, ottName, ottPhone) {
	if (!userIds || !userIds.length) return [];

	const ottFilter = { active: true };
	const userFilter = {
		_id: { $in: userIds },
		enable: true,
	};
	if (ottName) {
		ottFilter[ottName] = true;
		userFilter['otts.ottName'] = ottName;
	}
	if (ottPhone) {
		ottFilter.phone = ottPhone;
		userFilter['otts.ottPhone'] = ottPhone;
	}

	const activeOtts = await models.Ott.find(ottFilter).select('phone');
	if (!activeOtts.length) return [];

	const ottPhones = _.map(activeOtts, 'phone');
	userFilter['otts.ottPhone'] = { $in: ottPhones };
	const users = await models.User.find(userFilter).select('otts');

	const ottUsers = users.map(user =>
		user.otts.find(ott => ottPhones.includes(ott.ottPhone) && (!ottName || ott.ottName === ottName))
	);

	return _.compact(ottUsers);
}

async function getTextMsg(task, isReminder, threadBlockId) {
	const arr = [];

	if (task.category && task.category.notificationMsg) {
		let msg = task.category.notificationMsg;

		if (msg.includes(MessageVariable.BOOKING_CODE.text)) {
			msg = msg.replaceAll(
				MessageVariable.BOOKING_CODE.text,
				`mã đặt phòng ${_.map(task.bookingId, 'otaBookingId').join(' ')}`
			);
		}
		if (msg.includes(MessageVariable.FEE_AMOUNT.text)) {
			msg = msg.replaceAll(MessageVariable.FEE_AMOUNT.text, `số tiền ${formatPriceWithDot(task.fee.amount)}`);
		}
		if (msg.includes(MessageVariable.TASK_REASON.text)) {
			const reason = await task.getReasonTxt();
			msg = msg.replaceAll(MessageVariable.TASK_REASON.text, reason);
		}

		const reason = task.reasonId;
		const reasonTxt = (reason && (reason.noteRequired ? task.reasonTxt : reason.label)) || task.description || '';

		msg = msg.replaceAll(MessageVariable.TASK_REASON.text, reasonTxt);
		arr.push(msg);
	} else {
		if (task.bookingId && task.category && (task.category.isVAT() || task.category.isRefund())) {
			arr.push(_.map(task.bookingId, 'otaBookingId').join(' '));
		} else {
			arr.push(
				`${_.map(task.roomIds, 'info.roomNo').join(' ')}${
					threadBlockId ? '' : ` ${_.head(task.blockId.info.shortName) || task.blockId.info.name}`
				}`
			);
		}

		arr.push(task.description || _.get(task.subCategory, 'name') || _.get(task.category, 'name'), task.note);
	}

	const txtPriority = {
		[TaskPriority.High]: '-Khẩn cấp-',
		[TaskPriority.Mid]: '-Gấp-',
	};

	return _.compact([...arr, txtPriority[task.priority], isReminder && '-Nhắc lại-']).join('\n');
}

function sendMessage(data) {
	return messageOTT.sendOTTMessage({ ...data, timeout: MSG_TIMEOUT }).catch(e => {
		logger.error(e);
	});
}

async function autoPerson(task, userIds, mthread, isReminder, notificationType) {
	const ottUsers = await findOttUsers(userIds, _.get(mthread, 'otaName'), _.get(mthread, 'inbox.ottPhone'));
	if (!ottUsers.length) return;

	await ottUsers.asyncMap(async ottUser => {
		await asyncLock.acquire(`onMessage_${ottUser.ottName}_${ottUser.ottId}`, async () => {
			const autoData = {
				ottName: ottUser.ottName,
				ottPhone: ottUser.ottPhone,
				ottId: ottUser.ottId,
				taskId: task._id,
			};
			const msgs = [];

			await task.attachments.asyncMap(async url => {
				const msg = await sendMessage({
					ottName: ottUser.ottName,
					sender: ottUser.ottPhone,
					phone: ottUser.ottId,
					attachments: [{ url }],
				});

				if (msg) {
					const messageTime = moment(msg.message.time);
					msgs.push({
						...autoData,
						messageId: msg.message.messageId,
						messageTime: messageTime.isValid() ? messageTime.toDate() : new Date(),
					});
				}
			});

			const tMsg = await sendMessage({
				ottName: ottUser.ottName,
				sender: ottUser.ottPhone,
				phone: ottUser.ottId,
				text: await getTextMsg(task, isReminder, _.get(mthread, 'blockId')),
			});
			if (tMsg) {
				const messageTime = moment(tMsg.message.time);
				msgs.push({
					...autoData,
					messageId: tMsg.message.messageId,
					messageTime: messageTime.isValid() ? messageTime.toDate() : new Date(),
				});
			}

			if (msgs.length) {
				await models.TaskAutoMessage.insertMany(msgs.map(m => ({ ...m, notificationType })));
			}
		});
	});
}

async function autoGroup(task, mentionUsers, mthread, isReminder, notificationType) {
	if (!mthread) return;

	const ottName = mthread.otaName;
	const { ottPhone } = mthread.inbox;
	const ottId = mthread.guestId.ottIds[ottName];
	const autoData = {
		ottName,
		ottPhone,
		ottId,
		taskId: task._id,
	};

	await asyncLock.acquire(`onMessage_${ottName}_${ottId}`, async () => {
		const msgs = [];

		await task.attachments.asyncMap(async url => {
			const msg = await sendMessage({
				ottName,
				sender: ottPhone,
				phone: ottId,
				messageId: mthread._id,
				attachments: [{ url }],
			});
			if (msg) {
				const messageTime = moment(msg.message.time);
				msgs.push({
					...autoData,
					messageId: msg.message.messageId,
					messageTime: messageTime.isValid() ? messageTime.toDate() : new Date(),
				});
			}
		});

		const mentions = [];
		mentionUsers = _.uniqBy([...task.assigned, ...mentionUsers], _.toString);
		const ottUsers = await findOttUsers(mentionUsers, ottName, ottPhone);
		if (ottUsers.length) {
			ottUsers.forEach(ottUser => {
				mentions.push({ userId: ottUser.ottId });
			});
		}

		const msg = await sendMessage({
			ottName,
			sender: ottPhone,
			phone: ottId,
			messageId: mthread._id,
			text: _.compact([
				mentions.map(m => `@mention_${m.userId} `).join(''),
				await getTextMsg(task, isReminder, mthread.blockId),
			]).join('\n'),
			mentions,
		});
		if (msg) {
			const messageTime = moment(msg.message.time);
			msgs.push({
				...autoData,
				messageId: msg.message.messageId,
				messageTime: messageTime.isValid() ? messageTime.toDate() : new Date(),
			});
		}

		if (msgs.length) {
			await models.TaskAutoMessage.insertMany(msgs.map(m => ({ ...m, notificationType })));
		}
	});
}

async function getDepartmentLeaders(task) {
	if (!task.departmentId) return [];

	const department = await models.Department.findById(task.departmentId);
	if (!_.get(department, 'leaders.length')) return [];

	const time = moment(task.time).utcOffset(0);

	const users = await models.User.find({
		enable: true,
		groupIds: { $in: task.blockId.groupIds },
		role: department.leaders,
	}).select('_id');
	if (!users.length) return [];

	const usersIncharge = await models.WorkSchedule.find({
		date: time.format('Y-MM-DD'),
		userId: _.map(users, '_id'),
		times: {
			$elemMatch: {
				start: { $lte: time.format('HH:mm') },
				end: { $gte: time.format('HH:mm') },
			},
		},
	});

	const hostings = await models.Host.find({
		_id: _.map(
			usersIncharge.filter(u => !u.blockIds || !u.blockIds.length),
			'userId'
		),
	}).then(rs => _.keyBy(rs, '_id'));

	const rs = usersIncharge.filter(user => {
		user.blockIds =
			user.blockIds && user.blockIds.length ? user.blockIds : _.get(hostings, [user.userId, 'hosting'], []);

		return _.some(user.blockIds, blockId => blockId.toString() === task.blockId._id.toString());
	});

	return _.map(rs, 'userId');
}

async function sendAutoTaskMessage(task, isReminder) {
	if (![TaskStatus.Confirmed, TaskStatus.Waiting, TaskStatus.Checked].includes(task.status)) return;
	if (!isReminder && task.notifyOnCreate === false) return;
	if (task.time > new Date(`${moment().format('YYYY-MM-DD')}T23:59:59.000Z`)) return;

	const notificationType = (isReminder && task.reminderNotificationType) || task.notificationType;
	if (!notificationType) {
		return;
	}

	try {
		const users = [];

		await models.Task.populate(task, [
			{
				path: 'blockId',
				select: 'info.name info.shortName groupIds',
			},
			{
				path: 'roomIds',
				select: 'info.roomNo',
			},
			{
				path: 'category subCategory',
				select: 'name tag notificationMsg',
			},
			{
				path: 'bookingId',
				select: 'otaName otaBookingId',
			},
			{
				path: 'reasonId',
			},
		]);

		const threads = await models.Messages.find({
			isGroup: true,
			groupType: MessageGroupType.INTERNAL,
			taskNotification: true,
			groupIds: task.blockId.groupIds[0],
			blockId: { $in: [task.blockId._id, null] },
			$or: [
				{
					taskCategoryIds: task.category._id,
				},
				{
					internalGroupType: task.category.tag,
				},
				{
					departmentId: task.departmentId,
				},
			],
		})
			.sort({ blockId: -1, _id: 1 })
			.populate('guestId', 'ottIds')
			.populate('inbox', 'ottPhone')
			.lean();

		const mthread =
			threads.find(th => th.taskCategoryIds && th.taskCategoryIds.includesObjectId(task.category._id)) ||
			threads.find(th => th.internalGroupType && th.internalGroupType === task.category.tag) ||
			threads.find(th => th.departmentId && _.toString(th.departmentId) === _.toString(task.departmentId)) ||
			threads.find(th => !th.taskCategoryIds || !th.taskCategoryIds.length) ||
			threads[0];

		if (notificationType.includes('person')) {
			users.push(...task.assigned);
			await autoPerson(task, task.assigned, mthread, isReminder, notificationType);
		}
		if (notificationType.includes('manager')) {
			const managers = await getDepartmentLeaders(task);
			users.push(...managers);
			await autoPerson(task, managers, mthread, isReminder, notificationType);
		}
		if (notificationType.includes('group')) {
			await autoGroup(task, users, mthread, isReminder, notificationType);
		}
	} catch (e) {
		logger.error('sendAutoTaskMessage', e);
	}
}

eventEmitter.on(EVENTS.MESSAGE_RECEIVE, onReceiveMessage);
eventEmitter.on(EVENTS.TASK_UPDATE_ASSIGNED, sendAutoTaskMessage);

module.exports = {
	sendAutoTaskMessage,
};

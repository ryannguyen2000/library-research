const _ = require('lodash');
const mongoose = require('mongoose');

const ThrowReturn = require('@core/throwreturn');
const { eventEmitter, EVENTS } = require('@utils/events');
const { OTTs, MessageUser, ONE_DAY } = require('@utils/const');
const models = require('@models');
const OTT = require('@ott/ott');

function getSenders(messages) {
	const senders = _.uniq(_.map(messages, m => m.user));
	if (!senders.length) return {};

	return models.User.find({ _id: senders.filter(mongoose.Types.ObjectId.isValid) })
		.select('username name')
		.then(users => _.keyBy(users, '_id'));
}

async function getSender({ ottName, sender, phone, user, groupId, blockId, inbox }) {
	const query = {
		active: true,
		[ottName]: true,
	};
	if (sender) {
		query.phone = sender.replace(/^\+/, '');
	}
	if (ottName === OTTs.Facebook && phone) {
		query.phone = _.get(phone.split('_'), 1);
	}
	if (!query.phone && inbox && inbox.ottPhone && inbox.ottSource === ottName) {
		query.phone = inbox.ottPhone;
	}

	const $or = [];

	if (user && user.groupIds) {
		$or.push({ groupIds: { $in: user.groupIds } });
	}
	if (groupId) {
		$or.push({ groupIds: _.isArray(groupId) ? { $in: groupId } : groupId });
	}
	if (inbox && inbox.groupIds) {
		$or.push({ groupIds: { $in: inbox.groupIds } });
	}
	// if (groupId || user || inbox) {
	// 	const interArr = [];
	// 	if (user) interArr.push(user.groupIds);
	// 	if (groupId) interArr.push(_.isArray(groupId) ? groupId : [groupId]);

	// 	const groupIds = _.intersectionBy(...interArr, _.toString);
	// 	if (groupIds.length) {
	// 		$or.push({ groupIds: { $in: groupIds } });
	// 	}
	// }
	if (blockId && mongoose.Types.ObjectId.isValid(blockId)) {
		$or.push({
			blockId: mongoose.Types.ObjectId(blockId),
		});
	}
	if ($or.length) {
		query.$or = $or;
	}

	let otts = await models.Ott.find(query);
	if (!otts.length && _.values(OTTs).includes(ottName)) {
		const guest = await models.Guest.findOne({ [`ottIds.${ottName}`]: phone }).select('_id');
		if (!guest) {
			throw new ThrowReturn(`Ott ${ottName} ${sender} not found!`);
		}

		delete query.$or;
		otts = await models.Ott.find(query);
	}

	const ott =
		otts.find(o => o.blockId && _.toString(o.blockId) === _.toString(blockId)) ||
		otts.find(o => !o.blockId) ||
		otts[0];

	if (!ott) {
		throw new ThrowReturn(`Ott ${ottName} ${sender} not found!`);
	}

	return ott;
}

async function sendOTTMessage({
	ottName,
	messageId,
	user,
	phone,
	sender,
	groupId,
	blockId,
	ottData = null,
	inbox,
	...body
}) {
	// send message
	sender = await getSender({ ottName, sender, phone, user, groupId, blockId, inbox });

	const result = await OTT.sendMessage({ sender, ottName, phone, ...body });
	if (result.error_code) {
		throw new ThrowReturn(result.error_msg);
	}

	const senderId = user ? user._id.toString() : MessageUser.BOT;

	const rs = _.isArray(result.data) ? result.data : [result.data];

	const msgs = await _.compact(rs).asyncMap(async msg => {
		const newMessage = {
			user: senderId,
			time: msg.time ? new Date(msg.time) : new Date(),
			message: msg.message ? msg.message : body.text,
			messageId: msg.messageId,
			sender: sender.phone,
		};
		if (newMessage.messageId) {
			const mthread = messageId
				? await models.Messages.findById(messageId).select('-_id otaBookingId otaName').lean()
				: null;
			await models.OTTMessage.create({
				...ottData,
				...newMessage,
				...mthread,
				ottName,
				toId: phone,
			});
		}

		if (messageId) {
			eventEmitter.emit(EVENTS.MESSAGE_SEND, {
				senderId,
				messageId,
				ottSource: ottName,
				message: newMessage,
				groupIds: groupId || _.get(user, 'groupIds'),
			});
		}

		return newMessage;
	});

	return {
		message: _.head(msgs),
	};
}

async function getMsgActionHistories(msgs) {
	const history = {};

	const filter = _.filter(msgs, msg => _.get(msg.messageIds, 'length')).map(msg => ({
		ottName: msg.ottName,
		messageId: { $in: msg.messageIds },
	}));

	if (!filter.length) return history;

	const [histories, tasks, serviceFees, bookingProblem] = await Promise.all([
		models.History.find({
			$or: filter.map(f => ({ ottName: f.ottName, ottMessageId: f.messageId })),
		})
			.select('-_id ottMessageId ownerTime blockId roomIds')
			.lean(),
		models.TaskAutoMessage.find({
			$or: filter,
		})
			.select('-_id taskId messageId')
			.lean(),
		models.ServiceFee.find({
			deleted: false,
			messages: {
				$elemMatch: {
					$or: filter,
				},
			},
		})
			.select('messages.messageId messages.ottName serviceType')
			.lean(),
		models.BookingProblem.find({ deleted: false, $or: filter }).select('messageId').lean(),
	]);

	histories.forEach(h => {
		_.set(history, [h.ottMessageId, 'history'], h);
	});
	tasks.forEach(t => {
		_.set(history, [t.messageId, 'task'], t);
	});
	bookingProblem.forEach(bp => {
		_.set(history, [bp.messageId, 'bookingProblem'], bp);
	});
	serviceFees.forEach(s => {
		const _serviceFee = { _id: s._id, serviceType: s.serviceType };
		s.messages.forEach(msg => {
			const _serviceFees = _.get(history, [msg.messageId, 'serviceFees']);
			if (!_serviceFees) {
				_.set(history, [msg.messageId, 'serviceFees'], [_serviceFee]);
			} else {
				_serviceFees.push(_serviceFee);
			}
		});
	});

	return history;
}

async function getOTTMessages({ sender, inbox, ...params }) {
	sender = await getSender({ sender, inbox, ...params });

	const { messages, other } = await OTT.getMessages({ sender, ...params });
	const fromMeMessages = _.filter(messages, m => m.messageId && m.fromMe);

	if (fromMeMessages.length) {
		const ottMessages = await models.OTTMessage.find({
			ottName: params.ottName,
			messageId: { $in: _.map(fromMeMessages, 'messageId') },
		})
			.select('messageId user time sender')
			.lean();
		const objs = _.groupBy(ottMessages, 'messageId');

		fromMeMessages.forEach(msg => {
			const records = objs[msg.messageId];
			if (records) {
				const record =
					records.find(r => r.sender && r.sender === sender.phone) ||
					records.find(r => Math.abs(r.time - msg.time) < ONE_DAY);
				if (record && record.user) {
					msg.user = record.user;
				}
			}
		});
	}

	const senders = await getSenders(messages);

	if (_.get(other, 'info.members.length')) {
		const users = await models.User.find({
			'otts.ottId': { $in: _.map(other.info.members, 'id') },
			'otts.ottName': params.ottName,
		}).select('name username otts');

		const usersObj = _.keyBy(users, user =>
			_.get(_.find(user.otts, { ottPhone: other.account, ottName: params.ottName }), 'ottId')
		);

		other.info.members.forEach(mem => {
			mem.userId = _.get(usersObj, [mem.id, '_id']);
		});
	}

	const histories = await getMsgActionHistories([
		{ ottName: params.ottName, messageIds: _.map(messages, 'messageId') },
	]);

	return { messages, senders, other, histories };
}

async function checkOTTExists({ sender, ...params }) {
	sender = await getSender({ sender, ...params });

	return OTT.checkExists({ sender, ...params });
}

async function addOTTFriend({ sender, msg, ...params }) {
	sender = await getSender({ sender, ...params });

	const text = msg || 'Xin chào!';

	return OTT.addFriend({ sender, text, ...params });
}

async function getOTTTemplates({ ottName, sender, user }) {
	sender = await getSender({ ottName, sender, user });

	return OTT.getTemplates({ ottName, sender });
}

async function getOTTTemplate({ ottName, sender, user, ...params }) {
	sender = await getSender({ ottName, sender, user });

	return OTT.getTemplate({ ottName, ...params });
}

async function sendOTTTemplate({ sender, user, ...params }) {
	sender = await getSender({ sender, user, ...params });

	const data = await OTT.sendTemplate({ sender, ...params });

	const messageId = _.get(data, 'data.messageId');
	if (messageId) {
		const senderId = user ? user._id.toString() : MessageUser.BOT;
		const newMessage = {
			user: senderId,
			...data.data,
		};
		await models.OTTMessage.create({
			...newMessage,
			sender: sender.phone,
			ottName: params.ottName,
			messageId,
			toId: data.phone,
		});

		eventEmitter.emit(EVENTS.MESSAGE_SEND, {
			senderId,
			messageId,
			message: newMessage,
			ottSource: params.ottName,
			groupIds: params.groupId,
		});
	}

	return data;
}

async function getOTTUsers(user, { ottName, sender, ...params }) {
	sender = await getSender({ ottName, sender, user });

	return OTT.getUsers({ ottName, sender, ...params });
}

async function forwardOTTMessages(user, { ottName, phone, sender, groupId, blockId, msgIds, toIds, msg }) {
	sender = await getSender({ ottName, sender, phone, user, groupId, blockId });

	const result = await OTT.forwardOTTMessages({ sender, ottName, phone, msgIds, toIds, msg });
	if (result.error_code) {
		throw new ThrowReturn(result.error_msg);
	}

	const senderId = user ? user._id.toString() : MessageUser.BOT;
	const msgs = _.get(result, 'data.msgs');

	if (msgs && msgs.length) {
		await toIds.asyncMap(async ottId => {
			const guests = await models.Guest.find({ [`ottIds.${ottName}`]: _.toString(ottId) }).select('_id');
			const guestIds = _.map(guests, '_id');

			const mthread = await models.Messages.findOne({
				guestId: { $in: guestIds },
			})
				.select('_id otaBookingId otaName')
				.sort({ _id: -1 })
				.lean();

			return msgs.asyncMap(async m => {
				const message = {
					time: new Date(m.time),
					messageId: m.msgId,
					user: senderId,
				};

				await models.OTTMessage.create({
					...message,
					sender: sender.phone,
					ottName,
					otaBookingId: mthread && mthread.otaBookingId,
					otaName: mthread && mthread.otaName,
					toId: phone,
				});

				if (mthread) {
					eventEmitter.emit(EVENTS.MESSAGE_SEND, {
						senderId,
						messageId: mthread._id,
						ottSource: ottName,
						message,
						groupIds: groupId,
					});
				}
			});
		});
	}

	return {
		msgs: _.get(result, 'data.msgs'),
	};
}

module.exports = {
	sendOTTMessage,
	getOTTMessages,
	checkOTTExists,
	addOTTFriend,
	getOTTTemplates,
	getOTTTemplate,
	sendOTTTemplate,
	getOTTUsers,
	forwardOTTMessages,
	getMsgActionHistories,
};

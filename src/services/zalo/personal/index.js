const _ = require('lodash');
const moment = require('moment');

const { rangeDate } = require('@utils/date');
const { ZALO_TYPE } = require('./const');
const { Message, User } = require('./database');
const { parseUserInfo, parseMessage } = require('./utils');

async function getStats({ from, to, fromMe, ottPhones }) {
	const ranges = rangeDate(from, to).toArray();

	const gFilter = {};

	if (_.isBoolean(fromMe)) {
		_.set(gFilter, ['fromUid'], fromMe ? '0' : { $gt: '0' });
	}
	if (ottPhones) {
		_.set(gFilter, 'account.$in', ottPhones);
	}

	// if (from) {
	// 	_.set(gFilter, ['sendDttm', '$gte'], from.valueOf().toString());
	// }
	// if (to) {
	// 	_.set(gFilter, ['sendDttm', '$lte'], to.valueOf().toString());
	// }

	const Model = Message();

	return ranges.asyncMap(async date => {
		const filter = {
			...gFilter,
			sendDttm: {
				$gte: moment(date).startOf('day').valueOf().toString(),
				$lte: moment(date).endOf('day').valueOf().toString(),
			},
		};

		const rs = await Model.aggregate([
			{
				$match: filter,
			},
			{
				$group: {
					_id: '$toUid',
					messageCount: { $sum: 1 },
				},
			},
			{
				$group: {
					_id: null,
					totalUser: { $sum: 1 },
					totalMessage: { $sum: '$messageCount' },
				},
			},
		]).toArray();

		const totalUser = _.get(rs, [0, 'totalUser']) || 0;
		const totalMessage = _.get(rs, [0, 'totalMessage']) || 0;

		return {
			date: date.toDateMysqlFormat(),
			totalUser,
			totalMessage,
			avgMessage: totalUser ? totalMessage / totalUser : 0,
		};
	});

	// return Message()
	// 	.aggregate([
	// 		{
	// 			$match: query,
	// 		},
	// 		{
	// 			$group: {
	// 				_id: '$dateString',
	// 				totalMessage: { $sum: 1 },
	// 				user: { $addToSet: '$toUid' },
	// 			},
	// 		},
	// 		{
	// 			$project: {
	// 				_id: 0,
	// 				date: '$_id',
	// 				totalMessage: 1,
	// 				totalUser: { $size: '$user' },
	// 			},
	// 		},
	// 		{
	// 			$addFields: {
	// 				avgMessage: {
	// 					$divide: ['$totalMessage', '$totalUser'],
	// 				},
	// 			},
	// 		},
	// 		{
	// 			$sort: {
	// 				date: 1,
	// 			},
	// 		},
	// 	])
	// 	.toArray();
}

async function getFiles({ start, limit, toUids }) {
	const query = {
		toUid: { $in: toUids },
		msgType: { $in: [ZALO_TYPE.MSG_PHOTO, ZALO_TYPE.MSG_FILE] },
	};

	const [messages, total] = await Promise.all([
		Message().find(query).sort({ sendDttm: -1 }).skip(start).limit(limit).toArray(),
		Message().countDocuments(query),
	]);

	const rs = await messages.asyncMap(parseMessage);

	return { files: rs, total };
}

function getUser({ sender, phone, userId }) {
	const filter = {
		account: sender,
		$or: [],
	};
	if (phone) {
		filter.$or.push({ phone });
	}
	if (userId) {
		filter.$or.push({ 'info.userId': userId });
	}

	return User().findOne(filter);
}

async function getGroupMembers({ sender, memberIds, topMember }) {
	const members = await User()
		.find({
			account: sender,
			'info.userId': { $in: memberIds },
		})
		.toArray();

	const membersObj = _.keyBy(members, 'info.userId');

	return memberIds.map(memberId => {
		const user = membersObj[memberId];
		if (user) {
			return {
				id: memberId,
				avatar: user.info.avatar,
				displayName: user.info.zaloName,
			};
		}
		const defaultInfo = _.find(topMember, m => m.id === memberId);
		return {
			id: memberId,
			avatar: _.get(defaultInfo, 'avatar'),
			displayName: _.get(defaultInfo, 'dName'),
		};
	});
}

function getOriMessages(filter) {
	return Message().find(filter).toArray();
}

async function getMessages({ sender, phone, userId, start, limit, from, to }) {
	const user = await getUser({ sender, phone, userId });

	if (!user || !user.info) {
		return { ...user, messages: [], start, limit };
	}

	user.info = parseUserInfo(user.info);

	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	const filter = {
		// account: sender,
		toUid: user.info.userId,
	};
	if (from) {
		_.set(filter, ['sendDttm', '$gte'], new Date(from).valueOf().toString());
	}
	if (to) {
		_.set(filter, ['sendDttm', '$lte'], new Date(to).valueOf().toString());
	}

	const [messages, total] = await Promise.all([
		Message().find(filter).sort({ sendDttm: -1 }).skip(start).limit(limit).toArray(),
		Message().countDocuments(filter),
	]);

	if (user.info.isGroup) {
		user.info.members = await getGroupMembers({
			sender,
			memberIds: user.info.memberIds,
			topMember: user.info.topMember,
		});
	}

	return {
		...user,
		originMessages: messages,
		messages: await messages.reverse().asyncMap(msg => parseMessage(msg)),
		start,
		limit,
		total,
	};
}

async function getMessage({ messageId, parsed = true }) {
	const msg = await Message().findOne({ msgId: messageId });

	if (parsed && msg) {
		return parseMessage(msg);
	}

	return msg;
}

async function getUsers({ sender, start, limit, keyword, isGroup, userId, showTotal = true }) {
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 20;

	const filter = {};
	if (userId) {
		filter['info.userId'] = _.isArray(userId) ? { $in: userId } : userId;
	} else {
		filter.account = sender;
		filter.exists = true;
	}
	if (keyword) {
		filter['info.displayName'] = new RegExp(_.escapeRegExp(keyword), 'i');
	}
	if (isGroup !== undefined) {
		filter['info.isGroup'] = isGroup ? true : { $ne: true };
	}

	const users = await User().find(filter).sort({ _id: -1 }).skip(start).limit(limit).toArray();

	let total;
	if (showTotal) {
		total = await User().countDocuments(filter);
	}

	return { users, total };
}

async function findUserByPhone({ phone, account }) {
	const normPhone = phone.replace(/^\+/, '');

	const filter = {
		phone: { $in: [normPhone, `+${normPhone}`] },
		'info.userId': { $ne: null },
	};
	if (account) {
		filter.account = _.isArray(account) ? { $in: account } : account;
	}

	const user = await User().findOne(filter);
	if (!user) return null;

	return {
		ottId: user.info.userId,
	};
}

module.exports = {
	getStats,
	getFiles,
	getMessages,
	getUsers,
	getUser,
	getMessage,
	getOriMessages,
	findUserByPhone,
};

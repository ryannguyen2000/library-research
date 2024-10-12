const _ = require('lodash');
const { Message, User } = require('./database');
const { parseMessage } = require('./helper');

async function getStats({ from, to, fromMe, ottPhones }) {
	const query = {};

	if (from) {
		_.set(query, ['message.date', '$gte'], _.round(from.valueOf() / 1000));
	}
	if (to) {
		_.set(query, ['message.date', '$lte'], _.round(to.valueOf() / 1000));
	}
	if (_.isBoolean(fromMe)) {
		_.set(query, ['message.out'], fromMe);
	}
	if (ottPhones) {
		_.set(query, 'account.$in', ottPhones);
	}

	return Message()
		.aggregate([
			{
				$match: query,
			},
			{
				$group: {
					_id: '$dateString',
					totalMessage: { $sum: 1 },
					user: { $addToSet: '$userId' },
				},
			},
			{
				$project: {
					_id: 0,
					date: '$_id',
					totalMessage: 1,
					totalUser: { $size: '$user' },
				},
			},
			{
				$addFields: {
					avgMessage: {
						$divide: ['$totalMessage', '$totalUser'],
					},
				},
			},
			{
				$sort: {
					date: 1,
				},
			},
		])
		.toArray();
}

async function getMessage({ messageId, parsed = true, sender }) {
	const msg = await Message().findOne({ messageId: Number(messageId), account: sender });

	if (parsed && msg) {
		return parseMessage(msg);
	}

	return msg;
}

async function findUserByPhone({ phone, account }) {
	const normPhone = phone.replace(/^\+/, '');

	const filter = { phone: { $in: [normPhone, `+${normPhone}`] }, userId: { $ne: null } };
	if (account) {
		filter.account = _.isArray(account) ? { $in: account } : account;
	}

	const user = await User().findOne(filter);
	if (!user) return null;

	return {
		ottId: user.userId,
	};
}

module.exports = {
	getStats,
	getMessage,
	findUserByPhone,
};

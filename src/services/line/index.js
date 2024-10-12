const _ = require('lodash');
const { Message } = require('./database');

async function getStats({ from, to, fromMe, ottPhones }) {
	const query = {};

	if (from) {
		_.set(query, 'time.$gte', from.toISOString());
	}
	if (to) {
		_.set(query, 'time.$lte', to.toISOString());
	}
	if (_.isBoolean(fromMe)) {
		_.set(query, 'fromMe', fromMe);
	}
	if (ottPhones) {
		_.set(query, 'appId.$in', ottPhones);
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

async function getMessage({ messageId, parsed = true }) {
	const msg = await Message().findOne({ messageId });

	return msg;
}

module.exports = {
	getStats,
	getMessage,
};

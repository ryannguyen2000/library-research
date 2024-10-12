/* eslint-disable class-methods-use-this */
const _ = require('lodash');
const { DB_CONFIG } = require('@config/setting');
const { getOTTConnection } = require('@src/init/db');
const { COLLECTION } = require('./const');

const DB_NAME = _.last(DB_CONFIG.OTT.split('/'));

function User() {
	return getOTTConnection().getClient().db(DB_NAME).collection(COLLECTION.USER);
}

function Message() {
	return getOTTConnection().getClient().db(DB_NAME).collection(COLLECTION.MESSAGE);
}

class DataBase {
	constructor(account) {
		this.account = account;
	}

	getFindUserFilter(phone) {
		return {
			account: this.account,
			$or: [
				{
					phone,
				},
				{
					userId: phone,
				},
			],
		};
	}

	findUser(phone) {
		return User().findOne(this.getFindUserFilter(phone));
	}

	createOrUpdateUser(phone, info) {
		phone = phone || null;
		const userId = _.get(info, 'id') || null;
		const $set = { exists: !!info, info, userId };
		if (phone) $set.phone = phone;

		return User().updateOne(this.getFindUserFilter(phone || userId), { $set }, { upsert: true });
	}

	async writeMessages(user, messages) {
		if (!messages || !messages.length) return {};

		const bulks = _.map(messages, message => ({
			updateOne: {
				filter: {
					account: this.account,
					userId: user.id,
					messageId: message.id,
				},
				update: {
					$set: {
						message,
						dateString: message.date && new Date(message.date * 1000).toDateMysqlFormat(),
					},
				},
				upsert: true,
			},
		}));

		const result = await Message().bulkWrite(bulks);
		return {
			upsertedMessages: _.map(result.result.upserted, u => messages[u.index]),
		};
	}

	async findMessages(userId, options = {}) {
		const { start, limit } = options;

		const [messages, total] = await Promise.all([
			Message()
				.find({ account: this.account, userId })
				.sort({ 'message.date': -1 })
				.skip(start)
				.limit(limit)
				.toArray(),
			Message().countDocuments({ account: this.account, userId }),
		]);

		return {
			messages: messages.reverse(),
			total,
		};
	}

	updateMessage(_id, data) {
		return Message().updateOne(
			{ _id },
			{
				$set: data,
			}
		);
	}
}

module.exports = {
	User,
	Message,
	DataBase,
};

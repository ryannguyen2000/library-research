const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const { PayoutType, PayoutStates } = require('@utils/const');
const { logger } = require('@utils/logger');
const models = require('@models');

async function getCards(user, query) {
	const { start, limit } = query;

	const filter = {};

	const [cards, total] = await Promise.all([
		models.RoomCard.find(filter).skip(start).limit(limit),
		models.RoomCard.countDocuments(filter),
	]);

	return {
		cards,
		total,
	};
}

async function validateCardInfo(user, data) {
	const { expiredAt, type } = data;

	const cardInfo = {
		cardno: String,
		lockno: String,
		etime: String,
		llock: 1,
	};

	return {
		cardInfo,
	};
}

module.exports = {
	getCards,
	validateCardInfo,
};

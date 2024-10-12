const _ = require('lodash');
const { logger } = require('@utils/logger');
const { OTTs } = require('@utils/const');
const models = require('@models');

const { FacebookPage } = require('./Page');
const { Message } = require('./database');
const { parseMessage } = require('./utils');

const pages = {};

function getPage(pageId) {
	return pages[pageId];
}

function initPage(pageInfo) {
	const fbPage = pages[pageInfo.id];

	if (fbPage) {
		fbPage.setConfig(pageInfo);
	} else {
		pages[pageInfo.id] = new FacebookPage(pageInfo);
	}
}

async function loadPages() {
	const facebookOtts = await models.Ott.find({ active: true, [OTTs.Facebook]: true });

	const facebookPages = _.map(facebookOtts, `${OTTs.Facebook}Info`);
	facebookPages.forEach(initPage);

	Object.entries(pages).forEach(([id, page]) => {
		const exists = facebookPages.some(p => p.id === page.config.id && p.appId === page.config.appId);
		if (!exists) {
			page.unSubscribeWebhook();
			delete pages[id];
			logger.warn('Remove FacebookPage:', id);
		}
	});

	return pages;
}

async function getMessage({ messageId, parsed = true }) {
	const msg = await Message().findOne({ messageId });

	if (parsed && msg) {
		return parseMessage(msg);
	}

	return msg;
}

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
		_.set(query, 'pageId.$in', ottPhones);
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
					user: { $addToSet: '$psid' },
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

module.exports = {
	getPage,
	loadPages,
	getStats,
	getMessage,
};

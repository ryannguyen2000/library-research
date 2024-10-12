const path = require('path');
const moment = require('moment');

const { logger } = require('@utils/logger');
const fetch = require('@utils/fetch');
const Uri = require('@utils/uri');
const { downloadContentFromUrl, hasExists } = require('@utils/file');
const { getHeaders } = require('./helper');

async function getLogs(config, query) {
	try {
		const data = await fetch(Uri(`https://api.stringee.com/v1/call/log`, query), {
			headers: getHeaders(config),
		}).then(res => res.json());

		if (data.r === 0) return data.data;

		throw JSON.stringify(data);
	} catch (e) {
		logger.error('stringee getLogs', e);
		return {
			calls: [],
			currentPage: 1,
			limit: 10,
			totalPages: 0,
			totalCalls: 0,
			totalAnswerDurationMinutes: 0,
		};
	}
}

function getPath(callLog) {
	const timeNewVersion = new Date('2024-03-28T08:00:00.000Z');
	const isNewVer = new Date(callLog.createdAt) >= timeNewVersion;

	const fpath = isNewVer
		? `record/stringee/${moment(callLog.createdAt).format('YY/MM/DD')}/${callLog.data.id}.mp3`
		: `record/stringee/${callLog.data.id}.mp3`;

	return path.resolve(fpath);
}

async function saveRecorded(config, callLog) {
	try {
		const rsPath = getPath(callLog);

		if (await hasExists(rsPath)) {
			return rsPath;
		}

		const file = await downloadContentFromUrl({
			url: `https://api.stringee.com/v1/call/recording/${callLog.data.id}`,
			filePath: rsPath,
			options: {
				headers: {
					'X-STRINGEE-AUTH': getHeaders(config)['X-STRINGEE-AUTH'],
				},
			},
		});

		return file;
	} catch (e) {
		logger.error('stringee saveRecorded', e);
	}
}

module.exports = {
	getLogs,
	saveRecorded,
};

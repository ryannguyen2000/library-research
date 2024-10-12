const _ = require('lodash');
const isBase64 = require('is-base64');

const { USER_SYS_NAME } = require('@utils/const');
const { logger } = require('@utils/logger');
const UserLog = require('@models/user_log.model');

function getActivity(req) {
	const url = req.baseUrl;
	const activityMethods = req.app.get('activityMethods');
	return activityMethods[url];
}

function getLogType(req) {
	const types = getActivity(req);
	if (types) {
		const { pathname } = req._parsedUrl;

		const acType = _.entries(types).find(([type, data]) => {
			const { method = 'POST', key, exact } = data;
			if (key.includes('{id}')) {
				const paths = pathname.split('/');
				const trans = key
					.split('/')
					.map((k, i) => (k === '{id}' ? paths[i] : k))
					.join('/');
				return req.method === method && trans === pathname;
			}

			return req.method === method && (exact ? pathname === key : pathname.includes(key));
		});

		return acType;
	}
}

function removeBase64InJSON(json) {
	_.forOwn(json, (value, key) => {
		if (!value || !Object.prototype.hasOwnProperty.call(value, key)) return;
		if (typeof value === 'string' && isBase64(value, { mimeRequired: true, allowEmpty: false })) {
			json[key] = 'base64';
		} else if (typeof value === 'object') {
			json[key] = removeBase64InJSON(value);
		}
	});

	return json;
}

function sysLog(req, res, next) {
	if (req.method === 'GET') return next();

	const log = getLogType(req);
	if (!log || !log[0]) return next();

	const oldWrite = res.send;
	const chunks = [];

	res.send = function (chunk, ...args) {
		try {
			if (typeof chunk === 'object' && !(chunk instanceof Buffer)) chunk = JSON.stringify(chunk);
			chunks.push(Buffer.from(chunk));
			oldWrite.apply(res, [chunk, ...args]);
		} catch (err) {
			logger.error(err);
		}
	};

	res.on('finish', async () => {
		try {
			const body = Buffer.concat(chunks).toString('utf8');
			const responseData = JSON.parse(body);
			if (responseData && responseData.error_code) return;

			const [type, logData] = log;
			const data = JSON.stringify(removeBase64InJSON(req.body));

			const doc = {
				username: _.get(req.decoded, 'user.username') || _.get(req.logData, 'username') || USER_SYS_NAME.SYSTEM,
				method: req.method,
				action: req.originalUrl,
				data,
				type,
				response: responseData,
				blockId: _.get(req.logData, 'blockId'),
				roomId: _.get(req.logData, 'roomId'),
			};

			if (typeof logData.raw === 'function') {
				try {
					const { rawText } = await logData.raw(req, responseData.data);
					doc.rawText = rawText;
				} catch (e) {
					logger.error('user log get rawText err', e);
				}
			}

			await UserLog.create(doc);
			// await UserLog.create(doc, { checkKeys: false });
		} catch (err) {
			// logger.error('Write user log err', err);
		}
	});

	next();
}

module.exports = sysLog;

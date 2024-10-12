const jwt = require('jsonwebtoken');
const { logger } = require('@utils/logger');

function generateToken(config, { userId } = {}) {
	const now = Date.now();

	const header = { cty: 'stringee-api;v=1' };
	const payload = {
		jti: `${config.apiKeySid}-${Math.floor(now / 1000)}`,
		iss: config.apiKeySid,
	};
	if (userId) {
		payload.userId = userId;
		payload.icc_api = true;
		payload.exp = now + 1000 * 3600 * 48;
	} else {
		payload.rest_api = true;
		payload.exp = Math.floor((now + 24 * 60 * 60 * 1000 * 5) / 1000);
	}

	const token = jwt.sign(payload, config.apiKeySecret, { algorithm: 'HS256', header });

	return {
		token,
		exp: payload.exp,
	};
}

function checkToken(config, token) {
	return new Promise(resolve => {
		if (!token) {
			return resolve(false);
		}

		jwt.verify(token, config.apiKeySecret, err => {
			resolve(!err);
		});
	});
}

function getHeaders(config) {
	if (!config.token || config.tokenExp <= Math.floor(Date.now() / 1000)) {
		const { token, exp } = generateToken(config);
		config.token = token;
		config.tokenExp = exp;
		if (typeof config.save === 'function')
			config.save().catch(e => {
				logger.error(e);
			});
	}

	return {
		'X-STRINGEE-AUTH': config.token,
		'Content-Type': 'application/json',
	};
}

module.exports = { generateToken, checkToken, getHeaders };

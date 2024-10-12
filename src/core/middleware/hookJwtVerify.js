const jwt = require('jsonwebtoken');
const { HOOK_CONFIG } = require('@config/setting');
const { logger } = require('@utils/logger');
const ThrowReturn = require('../throwreturn');

module.exports = function (req, res, next) {
	try {
		const token = req.headers['x-access-token'] || req.query.token;
		req.decoded = jwt.verify(token, HOOK_CONFIG.SECRET_KEY);
		next();
	} catch (e) {
		logger.warn(e);
		throw new ThrowReturn().status(401);
	}
};

const jwt = require('jsonwebtoken');

const { ENVIRONMENT, JWT_CONFIG } = require('@config/setting');
const { logger } = require('@utils/logger');
const models = require('@models');
const ThrowReturn = require('../throwreturn');

const DELAY_ACTIVE_TIME = 60 * 1000 * 2;

module.exports = async function (req, res, next) {
	if (!req.validateToken || !ENVIRONMENT.REQUIRE_TOKEN) {
		return next();
	}

	try {
		const token = req.headers['x-access-token'] || req.query['x-access-token'];
		const decoded = jwt.verify(token, JWT_CONFIG.SECRET_KEY);
		const userId = decoded.user._id;

		const user = await models.User.findById(userId);
		// check enable or revoke
		if (!user || !user.enable || user.revokeKey !== decoded.user.revokeKey) {
			throw new Error(`User login invalid ${userId} ${JSON.stringify(decoded.user)}`);
		}

		if (!user.lastActive || Date.now() - user.lastActive.valueOf() > DELAY_ACTIVE_TIME) {
			user.lastActive = new Date();
			models.User.updateOne({ _id: user._id }, { lastActive: user.lastActive }).catch(e => {
				logger.error(e);
			});
		}

		req.decoded = { user };
		next();
	} catch (e) {
		logger.warn(e);
		throw new ThrowReturn().status(401);
	}
};

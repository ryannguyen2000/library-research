const express = require('express');
const _ = require('lodash');
const mongoose = require('mongoose');

const { _T } = require('@utils/translation');
const { logger } = require('@utils/logger');
const ThrowReturn = require('@core/throwreturn');
const { hostRestriction } = require('@core/middleware/hostRestriction');
const { jwtVerify, userLog, role } = require('@core/middleware');

async function createErrorLog(req, error, response) {
	try {
		const doc = {
			username: _.get(req.decoded, 'user.username') || _.get(req.logData, 'username'),
			method: req.method,
			action: req.originalUrl,
			body: req.body,
			detail: error,
			response,
		};

		await mongoose.model('UserLogError').create(doc);
	} catch (e) {
		logger.error('createErrorLog', e);
	}
}

function processException(req, res, error) {
	let error_code = 0;
	let error_msg;

	if (error instanceof ThrowReturn || error.name === 'ThrowReturn') {
		error_code = error.code;
		error_msg = error.message;
		if (error.statusCode) res.status(error.statusCode);
	} else {
		error_code = 1;
		if (error.name === 'ValidationError') {
			error_msg = _.get(_.head(_.values(error.errors)), 'message') || error.message;
			res.status(422);
		} else {
			logger.error(error);
			error_msg = 'error.sys.internal';
			res.status(500);
		}
	}

	const response = {
		error_code,
		error_msg: error_msg && _T(error_msg, req.language),
		data: error.data,
	};

	res.json(response);

	createErrorLog(req, error, response);
}

function sendData(data) {
	const response = { error_code: 0, data };
	this.json(response);
}

function safety(callback, validateToken) {
	return async function (req, res, next) {
		try {
			req.validateToken = validateToken;
			res.sendData = sendData;

			await callback(req, res, next);
		} catch (error) {
			processException(req, res, error);
		}
	};
}

function createSafetyMethod(method, middlewares, validate) {
	return function (path, ...args) {
		const validateToken = typeof _.last(args) === 'boolean' ? _.last(args) : validate;
		const funcs = [...middlewares, ...args]
			.filter(cb => typeof cb === 'function')
			.map(m => safety(m, validateToken));

		this[method](path, ...funcs);
	};
}

function routes({ middlewares = [], validate = true, options = null }) {
	const router = express.Router(options);

	router.getS = createSafetyMethod('get', middlewares, validate);
	router.postS = createSafetyMethod('post', middlewares, validate);
	router.putS = createSafetyMethod('put', middlewares, validate);
	router.deleteS = createSafetyMethod('delete', middlewares, validate);

	return router;
}

const ApiRouter = () => routes({ middlewares: [jwtVerify, role.authorize, hostRestriction, userLog] });

const OTAHeaderRouter = () => routes({ validate: false });

const PublishRouter = () => routes({ middlewares: [userLog], validate: false });

const ChatRouter = () => routes({ validate: false });

const SelfCheckinRouter = () => routes({ middlewares: [userLog], validate: false });

const HookRouter = () => routes({ validate: false });

function useCache(options = {}) {
	return (req, res, next) => {
		if (options.noCache) {
			res.setHeader('Cache-Control', 'no-cache');
		} else {
			res.setHeader('Cache-Control', `${options.private ? 'private' : 'public'}, max-age=3153600`);
		}

		next();
	};
}

module.exports = {
	Router: ApiRouter,
	Publish: PublishRouter,
	OTAHeader: OTAHeaderRouter,
	ChatRouter,
	SelfCheckin: SelfCheckinRouter,
	HookRouter,
	useCache,
};

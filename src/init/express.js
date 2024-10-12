const cors = require('cors');
const log4js = require('log4js');
const express = require('express');
const device = require('express-device');
const httpLib = require('http');
const compress = require('compression');

const { SERVER_CONFIG } = require('@config/setting');
const { logger } = require('@utils/logger');
const { LANGUAGE } = require('@utils/const');

function validateReq() {
	return (req, res, next) => {
		req.clientIp =
			req.headers['x-client-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip;

		const lang = req.headers.lang || req.query.lang || req.body.lang;
		req.language = Object.values(LANGUAGE).includes(lang) ? lang : LANGUAGE.VI;

		req.query.limit = parseInt(req.query.limit) || 10;
		req.query.limit = Math.min(req.query.limit, 1000);

		req.query.start = parseInt(req.query.start) || 0;
		req.query.start = Math.max(req.query.start, 0);

		next();
	};
}

async function initExpress() {
	const app = express();

	// start server
	const server = httpLib.createServer(app);
	const port = SERVER_CONFIG.PORT;
	server.listen(port);
	logger.info('Server is running at port: ', port);

	app.enable('trust proxy');
	app.disable('x-powered-by');

	app.use(cors({ exposedHeaders: 'Content-Disposition' }));
	app.use(
		express.json({
			limit: '20mb',
			verify: (req, res, buff) => {
				req.rawBody = buff;
			},
		})
	);
	app.use(express.urlencoded({ extended: true }));
	app.use(device.capture());
	app.use(compress());
	app.use(validateReq());

	// logger middleware
	app.use(
		log4js.connectLogger(logger, {
			level: log4js.levels.INFO,
			nolog: ['otaHeader?', '/v1/events', SERVER_CONFIG.STATIC.URI],
		})
	);

	return {
		app,
		server,
	};
}

module.exports = initExpress;

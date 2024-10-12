const _ = require('lodash');
const WebSocket = require('ws');
const qs = require('qs');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const { JWT_CONFIG, SERVER_CONFIG } = require('@config/setting');
const { logger } = require('@utils/logger');

const pingTime = 15000;

const PING = 'ping';
const PONG = 'pong';

function loadWss() {
	const modules = [];
	fs.readdirSync(__dirname)
		.filter(n => n !== 'index.js')
		.map(n => n.replace('.js', ''))
		.forEach(name => {
			const modelFile = `./${name}`;
			const modelName = name.replace('.ws', '');
			const model = require(modelFile);

			modules.push({
				...model,
				modelName,
			});
		});
	return modules;
}

const modules = loadWss();

function heartbeat(msg) {
	this.isAlive = true;

	try {
		const parsedMsg = JSON.parse(msg);

		if (parsedMsg.event === PING) {
			this.send(JSON.stringify({ event: PONG }));
		}
	} catch (e) {
		//
	}
}

function initWS() {
	const wss = new WebSocket.Server({
		port: SERVER_CONFIG.WS_PORT,
		verifyClient,
	});

	wss.on('error', function (e) {
		logger.error('Server ws error', e);
	});

	wss.on('connection', function (ws, req) {
		ws.req = req;

		ws.on('message', heartbeat);

		const wsPath = _.head(req.url.split('?'));

		const module = modules.find(m => m.path === wsPath);
		if (module) {
			module.onWebsocketConnection(ws, wss);
			ws.send(JSON.stringify({ event: 'CONNECT', message: 'connected' }));
		} else {
			ws.terminate();
		}
	});

	const interval = setInterval(function ping() {
		const jsonStr = JSON.stringify({ event: 'ping' });

		wss.clients.forEach(function (ws) {
			if (ws.isAlive === false) return ws.terminate();
			ws.isAlive = false;
			ws.send(jsonStr);
		});
	}, pingTime);

	wss.on('close', function close() {
		clearInterval(interval);
	});

	logger.info('Server ws opened');
}

function verifyClient({ req }, callback) {
	try {
		const { token } = qs.parse(req.url.split('?')[1]);
		const decoded = jwt.verify(token, JWT_CONFIG.SECRET_KEY);

		_.set(req, 'decoded.user', decoded.user);

		callback(true);
	} catch (e) {
		callback(false);
	}
}

// function onReceivedMessage() {
// 	// logger.info('received ws', data);
// 	this.isAlive = true;
// }

// function onClosed(e) {
// 	removeWs(this.req.user._id, this.req);
// }

// function onError(e) {
// 	logger.info('error ws', e);
// 	removeWs(this.req.user._id, this.req);
// }

module.exports = { init: initWS };

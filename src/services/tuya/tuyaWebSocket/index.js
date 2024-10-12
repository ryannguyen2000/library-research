/* eslint-disable no-unused-expressions */
const Event = require('events');
const WebSocket = require('ws');
const { getTuyaEnvConfig, TuyaMessageSubscribeWebsocket } = require('./config');
const { getTopicUrl, buildQuery, buildPassword, decrypt } = require('./utils');

class TuyaWebsocket {
	constructor(config) {
		this.config = {
			ackTimeoutMillis: 3000,
			subscriptionType: 'Failover',
			retryTimeout: 1000,
			maxRetryTimes: 100,
			timeout: 30000,
			logger: console.log,
			...config,
		};
		this.event = new Event();
		this.retryTimes = 0;
	}

	start() {
		this.server = this._connect();
	}

	open(cb) {
		this.event.on(TuyaMessageSubscribeWebsocket.open, cb);
	}

	message(cb) {
		this.event.on(TuyaMessageSubscribeWebsocket.data, cb);
	}

	ping(cb) {
		this.event.on(TuyaMessageSubscribeWebsocket.ping, cb);
	}

	pong(cb) {
		this.event.on(TuyaMessageSubscribeWebsocket.pong, cb);
	}

	reconnect(cb) {
		this.event.on(TuyaMessageSubscribeWebsocket.reconnect, cb);
	}

	ackMessage(messageId) {
		this.server && this.server.send(JSON.stringify({ messageId }));
	}

	error(cb) {
		this.event.on(TuyaMessageSubscribeWebsocket.error, cb);
	}

	close(cb) {
		this.event.on(TuyaMessageSubscribeWebsocket.close, cb);
	}

	_reconnect() {
		if (this.config.maxRetryTimes && this.retryTimes < this.config.maxRetryTimes) {
			const timer = setTimeout(() => {
				clearTimeout(timer);
				this.retryTimes++;
				this._connect(false);
			}, this.config.retryTimeout);
		}
	}

	_connect(isInit = true) {
		const { accessId, accessKey, env, url } = this.config;
		const topicUrl = getTopicUrl(
			url,
			accessId,
			getTuyaEnvConfig(env).value,
			`?${buildQuery({ subscriptionType: 'Failover', ackTimeoutMillis: 30000 })}`
		);
		const password = buildPassword(accessId, accessKey);
		this.server = new WebSocket(topicUrl, {
			rejectUnauthorized: false,
			headers: { username: accessId, password },
		});
		this.subOpen(this.server, isInit);
		this.subMessage(this.server);
		this.subPing(this.server);
		this.subPong(this.server);
		this.subError(this.server);
		this.subClose(this.server);
		return this.server;
	}

	subOpen(server, isInit = true) {
		server.on('open', () => {
			if (server.readyState === server.OPEN) {
				this.retryTimes = 0;
			}
			this.keepAlive(server);
			this.event.emit(
				isInit ? TuyaMessageSubscribeWebsocket.open : TuyaMessageSubscribeWebsocket.reconnect,
				this.server
			);
		});
	}

	subPing(server) {
		server.on('ping', () => {
			this.event.emit(TuyaMessageSubscribeWebsocket.ping, this.server);
			this.keepAlive(server);
			server.pong(this.config.accessId);
		});
	}

	subPong(server) {
		server.on('pong', () => {
			this.keepAlive(server);
			this.event.emit(TuyaMessageSubscribeWebsocket.pong, this.server);
		});
	}

	subMessage(server) {
		server.on('message', data => {
			try {
				this.keepAlive(server);
				const start = Date.now();
				// this.logger('INFO', `receive msg, jsonMessage=${data}`);
				const obj = this.handleMessage(data);
				// this.logger('INFO', 'the real message data:', obj);
				this.event.emit(TuyaMessageSubscribeWebsocket.data, this.server, obj);
				const end = Date.now();
				// this.logger('INFO', `business processing cost=${end - start}`);
			} catch (e) {
				this.logger('ERROR', e);
				this.event.emit(TuyaMessageSubscribeWebsocket.error, e);
			}
		});
	}

	subClose(server) {
		server.on('close', (...data) => {
			this._reconnect();
			this.clearKeepAlive();
			this.event.emit(TuyaMessageSubscribeWebsocket.close, ...data);
		});
	}

	subError(server) {
		server.on('error', e => {
			this.event.emit(TuyaMessageSubscribeWebsocket.error, this.server, e);
		});
	}

	clearKeepAlive() {
		clearTimeout(this.timer);
	}

	keepAlive(server) {
		this.clearKeepAlive();
		this.timer = setTimeout(() => {
			server.ping(this.config.accessId);
		}, this.config.timeout);
	}

	handleMessage(data) {
		const { payload, ...others } = JSON.parse(data);
		const pStr = Buffer.from(payload, 'base64').toString('utf-8');
		const pJson = JSON.parse(pStr);
		pJson.data = decrypt(pJson.data, this.config.accessKey);
		return { payload: pJson, ...others };
	}

	logger(level, ...info) {
		const realInfo = `${Date.now()} `;
		this.config.logger && this.config.logger(level, realInfo, ...info);
	}

	terminate() {
		this.server.terminate();
	}
}

module.exports = TuyaWebsocket;

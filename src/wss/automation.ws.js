const { logger } = require('@utils/logger');
const { SERVICES_EVENTS, SERVICES_EVENT_TYPES, serviceEventEmitter } = require('@utils/events');
const models = require('@models');

const ref = {};
const MAX_RETRY = 20;

const PING = 'ping';
const PONG = 'pong';

function sendRetry(ws, data, delayTime = 3000, retry = 0) {
	if (retry > MAX_RETRY) {
		logger.error('automation.ws sendRetry maxRery', data);
		return;
	}

	return new Promise(resolve => {
		try {
			ws.send(data, err => {
				if (err) {
					Promise.delay(delayTime).then(() => sendRetry(ws, data, delayTime, retry + 1));
				} else {
					resolve();
				}
			});
		} catch (e) {
			return Promise.delay(delayTime).then(() => sendRetry(ws, data, delayTime, retry + 1));
		}
	});
}

async function onMessage(msg) {
	try {
		const parsedMsg = JSON.parse(msg);

		if (parsedMsg.event === PING || parsedMsg.event === PONG) {
			return;
		}

		// console.log('automation onMessage', parsedMsg);

		if (parsedMsg.event === SERVICES_EVENT_TYPES.REQUEST_OTP) {
			const otp = await models.Passcode.findOTP({
				otaName: parsedMsg.data.otaName,
				email: parsedMsg.data.email,
			});

			sendRetry(
				this,
				JSON.stringify({
					...parsedMsg,
					result: {
						otp,
					},
				})
			);

			return;
		}

		serviceEventEmitter.emit(
			SERVICES_EVENTS.RESPONSE,
			parsedMsg,
			this.req && this.req.decoded && this.req.decoded.user
		);
	} catch (e) {
		logger.error('ws automation onMessage', e, msg);
	}
}

function onWebsocketConnection(ws, wss) {
	try {
		if (!ref.wss) {
			ref.wss = wss;
		}

		ws.on('message', onMessage);
	} catch (e) {
		logger.error('automation onWebsocketConnection', e);
	}
}

function onRequest(msg) {
	if (!ref.wss) return;

	const jsonStr = JSON.stringify(msg);

	ref.wss.clients.forEach(ws => {
		sendRetry(ws, jsonStr);
	});
}

serviceEventEmitter.on(SERVICES_EVENTS.REQUEST, onRequest);

module.exports = {
	onWebsocketConnection,
	path: '/automation',
};

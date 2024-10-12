const _ = require('lodash');

const TuyaWebsocket = require('./tuyaWebSocket');
const { TUYA_PASULAR_ENV, TuyaRegionConfigEnum } = require('./tuyaWebSocket/config');

const env = process.env.NODE_ENV;
const TUYA_ENV = env === 'production' ? TUYA_PASULAR_ENV.PROD : TUYA_PASULAR_ENV.TEST;

function init() {
	let tuyaWebSocket;
	return (accessKey, secretKey) => {
		if (_.get(tuyaWebSocket, 'terminate')) {
			tuyaWebSocket.terminate();
		}

		if (!accessKey || !secretKey) return;

		tuyaWebSocket = new TuyaWebsocket({
			accessId: accessKey,
			accessKey: secretKey,
			url: TuyaRegionConfigEnum.US,
			env: TUYA_ENV,
			maxRetryTimes: 100,
		});

		return tuyaWebSocket;
	};
}

const connection = init();

module.exports = {
	connection,
};

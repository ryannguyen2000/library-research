const TuyaRegionConfigEnum = {
	CN: 'wss://mqe.tuyacn.com:8285/',
	US: 'wss://mqe.tuyaus.com:8285/',
	EU: 'wss://mqe.tuyaeu.com:8285/',
	IN: 'wss://mqe.tuyain.com:8285/',
};

const TUYA_PASULAR_ENV = {
	PROD: 'prod',
	TEST: 'test',
};

const TuyaEnvConfig = {
	[TUYA_PASULAR_ENV.PROD]: {
		name: TUYA_PASULAR_ENV.PROD,
		value: 'event',
		desc: 'online environment',
	},
	[TUYA_PASULAR_ENV.TEST]: {
		name: TUYA_PASULAR_ENV.TEST,
		value: 'event-test',
		desc: 'test environment',
	},
};

function getTuyaEnvConfig(env) {
	return TuyaEnvConfig[env];
}

const TuyaMessageSubscribeWebsocket = {
	data: 'TUTA_DATA',
	error: 'TUYA_ERROR',
	open: 'TUYA_OPEN',
	close: 'TUYA_CLOSE',
	reconnect: 'TUYA_RECONNECT',
	ping: 'TUYA_PING',
	pong: 'TUYA_PONG',
};

module.exports = {
	TuyaRegionConfigEnum,
	TUYA_PASULAR_ENV,
	TuyaEnvConfig,
	getTuyaEnvConfig,
	TuyaMessageSubscribeWebsocket,
};

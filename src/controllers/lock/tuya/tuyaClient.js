const _ = require('lodash');
const { TuyaContext } = require('@tuya/tuya-connector-nodejs');

const { TUYA_BASE_URL } = require('@config/setting');
const { logger } = require('@utils/logger');
const { DEVICE_lOG_TYPE } = require('./const');
const TuyaSmartLock = require('./smartLock');

const MAX_RETRY = 1;

class TuyaClient {
	constructor({ accessKey, secretKey, uid }) {
		this.tuya = new TuyaContext({
			baseUrl: TUYA_BASE_URL,
			accessKey,
			secretKey,
		});
		this.accessKey = accessKey;
		this.secretKey = secretKey;
		this.smartLock = new TuyaSmartLock({ tuya: this.tuya, accessKey, secretKey });
		this.uid = uid;
	}

	isExist({ accessKey, secretKey, uid }) {
		return this.accessKey === accessKey && this.secretKey === secretKey && this.uid === uid;
	}

	async call(path, method, body, retry = 0) {
		try {
			const res = await this.tuya.request({
				path,
				method,
				body,
			});
			if (!res.success) throw new Error(res.msg);
			return res.result;
		} catch (error) {
			if (retry < MAX_RETRY) return this.call(path, method, body, retry + 1);
			logger.error(`Tuya client: ${error.message}`);
			return { error_code: 1, msg: error.message };
		}
	}

	// ACCOUNT
	getAccountInfo() {
		const uid = this.uid || '';
		const path = `/v1.0/users/${uid}/infos`;
		const method = 'GET';
		return this.call(path, method);
	}

	// HOME
	async getHomes() {
		const uid = this.uid || '';
		const path = `/v1.0/users/${uid}/homes`;
		const method = 'GET';
		const homes = await this.call(path, method);
		return homes;
	}

	createHome({ name, geoName }) {
		const uid = this.uid || '';
		const path = '/v1.0/home/create-home';
		const method = 'POST';
		const body = {
			home: { name, geo_name: geoName },
			uid,
		};

		return this.call(path, method, body);
	}

	modifyHome(homeId, update) {
		const path = `/v1.0/homes/${homeId}`;
		const method = 'PUT';
		const body = _.pick(update, ['name', 'geoName']);
		return this.call(path, method, body);
	}

	deleteHome(homeId) {
		const path = `/v1.0/homes/${homeId}`;
		const method = 'DELETE';
		return this.call(path, method);
	}

	// ROOM
	addRoomToHome(homeId, roomName) {
		let path = `/v1.0/homes/${homeId}/room`;
		const method = 'POST';
		const body = { name: roomName };
		return this.call(path, method, body);
	}

	getRooms(homeId) {
		let path = `/v1.0/homes/${homeId}/rooms`;
		const method = 'GET';
		return this.call(path, method);
	}

	modifyRoom({ homeId, roomId, name }) {
		const path = `/v1.0/homes/${homeId}/rooms/${roomId}`;
		const method = 'PUT';
		const body = { name };
		return this.call(path, method, body);
	}

	deleteRoom(homeId, roomId) {
		const path = `/v1.0/homes/${homeId}/rooms/${roomId}`;
		const method = 'DELETE';
		return this.call(path, method);
	}

	// DEVICE
	getDevice(deviceId) {
		const path = `/v1.0/devices/${deviceId}`;
		const method = 'GET';
		return this.call(path, method);
	}

	getDevicesByHomeId(homeId) {
		const path = `/v1.0/homes/${homeId}/devices`;
		const method = 'GET';
		return this.call(path, method);
	}

	modifyDevice(deviceId, { name }) {
		const path = `/v1.0/devices/${deviceId}`;
		const method = 'PUT';
		const body = { name };
		return this.call(path, method, body);
	}

	addDeviceToRoom(homeId, roomId, deviceIds) {
		const path = `/v1.0/homes/${homeId}/rooms/${roomId}/devices`;
		const method = 'PUT';
		const body = { device_ids: deviceIds };
		return this.call(path, method, body);
	}

	// DEVICE LOGS
	getDeviceLogs({ deviceId, from, to, type }) {
		const path = `/v1.0/devices/${deviceId}/logs`;
		const method = 'GET';

		const body = {
			type: type || DEVICE_lOG_TYPE.DATA_POINT_REPORT,
			start_time: new Date(from).getTime(),
			end_time: new Date(to).getTime(),
			size: 20,
		};
		return this.call(path, method, body);
	}
}

module.exports = TuyaClient;

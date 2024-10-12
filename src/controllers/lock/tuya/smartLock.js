const _ = require('lodash');
const crypto = require('crypto');

const { logger } = require('@utils/logger');

function encrypt(text, key) {
	const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
	let encrypted = cipher.update(text, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	return encrypted;
}

function decrypt(text, key) {
	text = Buffer.from(text, 'hex');
	const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
	let decrypted = decipher.update(text, 'hex', 'utf8');
	decrypted += decipher.final('utf8');
	return decrypted;
}

const MAX_RETRY = 2;

class TuyaSmartLock {
	constructor({ tuya, accessKey, secretKey }) {
		this.tuya = tuya;
		this.accessKey = accessKey;
		this.secretKey = secretKey;
	}

	async call(path, method, body, retry = 0) {
		try {
			const res = await this.tuya.request({
				path,
				method,
				body,
			});
			if (!res.success) throw new Error(res.msg);
			return _.get(res, 'result', {});
		} catch (error) {
			if (retry < MAX_RETRY) return this.call(path, method, body, retry + 1);

			logger.error(`Tuya Smart Lock: ${error.message}`);
			return { error_code: 1, msg: error.message };
		}
	}

	getLogs({ deviceId, from, to, pageSize, pageNo, showMediaInfo }) {
		const path = `/v1.1/devices/${deviceId}/door-lock/open-logs`;
		const method = 'GET';
		const body = {
			page_no: pageNo || 1,
			page_size: pageSize || 20,
			start_time: new Date(from).getTime(),
			end_time: new Date(to).getTime(),
			show_media_info: !!showMediaInfo,
		};
		return this.call(path, method, body);
	}

	getImg({ deviceId, bucket, filePath }) {
		const path = `/v1.0/devices/${deviceId}/movement-configs`;
		const method = `GET`;
		const body = {
			bucket,
			file_path: filePath,
		};

		return this.call(path, method, body);
	}

	// DOOR LOCK PASSWORD
	getPwdTicket(deviceId) {
		const path = `/v1.0/devices/${deviceId}/door-lock/password-ticket`;
		const method = 'POST';
		return this.call(path, method);
	}

	async encodePassword(deviceId, password) {
		const ticket = await this.getPwdTicket(deviceId);
		const ticketId = _.get(ticket, 'ticket_id', '');
		const ticketKey = _.get(ticket, 'ticket_key', '');
		const originalTicketKey = decrypt(ticketKey, this.secretKey);
		const encryptedPassword = encrypt(password, originalTicketKey).toUpperCase();

		return { ticketId, encryptedPassword };
	}

	getPasswords(deviceId, valid = true) {
		const path = `/v1.0/devices/${deviceId}/door-lock/temp-passwords`;
		const method = 'GET';
		const body = { valid };
		return this.call(path, method, body);
	}

	getPassword(deviceId, passwordId) {
		const path = `/v1.0/devices/${deviceId}/door-lock/temp-password/${passwordId}`;
		const method = 'GET';
		return this.call(path, method);
	}

	getPasswordStatus(deviceId, passwordId) {
		const path = `/v1.0/devices/${deviceId}/door-lock/temp-password/${passwordId}`;
		const method = 'GET';
		return this.call(path, method);
	}

	// type
	// `1`: A password can only be used once before it expires.
	// `0`: A password can be used as many times as needed before it expires.
	async createTempPassword({ deviceId, name, password, effectiveTime, invalidTime }, isOTP = false, retry = 0) {
		try {
			const path = `/v1.0/devices/${deviceId}/door-lock/temp-password`;
			const method = 'POST';
			const { ticketId, encryptedPassword } = await this.encodePassword(deviceId, password);
			const body = {
				device_id: deviceId,
				name: isOTP ? `OTP-${name}` : name,
				password: encryptedPassword,
				effective_time: effectiveTime,
				invalid_time: invalidTime,
				password_type: 'ticket',
				ticket_id: ticketId,
				type: isOTP ? 1 : 0,
			};

			const res = await this.call(path, method, body);
			return res || {};
		} catch (error) {
			if (retry < MAX_RETRY) {
				this.createTempPassword({ deviceId, name, password, effectiveTime, invalidTime }, isOTP, retry + 1);
			}
		}
	}

	async updateTempPassword({ deviceId, name, passwordId, password, effectiveTime, invalidTime }, retry = 0) {
		try {
			const path = `/v1.0/devices/${deviceId}/door-lock/temp-passwords/${passwordId}/modify-password`;
			const method = 'PUT';
			const { ticketId, encryptedPassword } = await this.encodePassword(deviceId, password);
			const body = {
				name,
				password: encryptedPassword,
				effective_time: effectiveTime,
				invalid_time: invalidTime,
				password_type: 'ticket',
				ticket_id: ticketId,
			};

			const res = await this.call(path, method, body);
			return res;
		} catch (error) {
			if (retry < MAX_RETRY) {
				return this.updateTempPassword(
					{ deviceId, name, passwordId, password, effectiveTime, invalidTime },
					retry + 1
				);
			}
		}
	}

	async createDynamicPassword(deviceId) {
		const path = `/v1.0/devices/${deviceId}/door-lock/dynamic-password`;
		const method = 'GET';

		return this.call(path, method);
	}

	deleteTempPassword(deviceId, passwordId) {
		const path = `/v1.0/devices/${deviceId}/door-lock/temp-passwords/${passwordId}`;
		const method = 'DELETE';
		return this.call(path, method);
	}
}

module.exports = TuyaSmartLock;

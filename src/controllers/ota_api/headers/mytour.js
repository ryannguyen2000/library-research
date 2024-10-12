const _ = require('lodash');
const fetch = require('node-fetch');
const { logger } = require('@utils/logger');
const { generateAppHash } = require('@utils/header/mytour');

const URI = 'https://gate.mytour.vn/auth/login';

function login(ota) {
	const apphash = generateAppHash();
	return fetch(URI, {
		method: 'POST',
		headers: {
			accept: '*/*',
			'content-type': 'application/json',
			appid: _.get(ota, 'other.appid'),
			caid: _.get(ota, 'other.caid'),
			apphash,
			deviceinfo: 'HMS',
			timestamp: Date.now(),
			version: _.get(ota, 'other.version'),
		},
		body: JSON.stringify({ account: ota.username, password: ota.password }),
	}).then(res => res.json());
}

async function getHeaders(accountData) {
	const data = await login(accountData);

	if (data.code === 200) {
		return {
			data: {
				token: data.data.loginToken,
				other: {
					caid: data.data.caId,
				},
			},
		};
	}
	logger.error('Mytour get header err: ', data.message);
	return {
		error_code: 1,
	};
}

module.exports = {
	getHeaders,
};

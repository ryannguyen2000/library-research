const fetch = require('@utils/fetch');
const { md5 } = require('@utils/crypto');
const { logger } = require('@utils/logger');

const URI_API = 'https://production-api.go2joy.vn/api/v1/web/ha/sign-in';

async function getHeaders(accountData) {
	try {
		const data = await fetch(URI_API, {
			method: 'POST',
			headers: {
				Accept: '*/*',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				userId: accountData.username,
				password: md5(accountData.password),
				remember: 1,
			}),
		}).then(res => res.json());

		return {
			data: {
				token: data.data.accessToken,
				other: {
					expiresAt: data.data.expiresAt,
				},
			},
		};
	} catch (e) {
		logger.error('go2joy getHeaders error', e);
		return {
			error_code: 1,
		};
	}
}

module.exports = {
	getHeaders,
};

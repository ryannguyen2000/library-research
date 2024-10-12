const fetch = require('@utils/fetch');

const URI = 'https://tourapi.tripi.vn/v3/account/login';

async function getHeaders(accountData) {
	const token = await fetch(URI, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8',
		},
		body: JSON.stringify({
			email: accountData.username,
			password: accountData.password,
		}),
	}).then(res => {
		return {
			token: res.headers.raw().login_token[0],
			expiry: res.headers.raw().expiry[0],
		};
	});

	if (!token || !token.token) {
		return {
			error_code: 1,
		};
	}

	return {
		data: {
			token: token.token,
			other: {
				expiry: token.expiry,
			},
		},
	};
}

module.exports = {
	getHeaders,
};

const fetch = require('@utils/fetch');

const URI = 'https://apiv2.grabhotel.net/account/login';

async function getHeaders(accountData) {
	const data = await fetch(URI, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json;charset=UTF-8',
		},
		body: JSON.stringify({ pass: accountData.password, provider: 'normal', username: accountData.username }),
	}).then(res => res.json());

	if (!data || !data.token)
		return {
			error_code: 1,
		};

	return {
		data: {
			token: data.token,
			other: {
				...data.data,
				refresh_token: data.refresh_token,
			},
		},
	};
}

module.exports = {
	getHeaders,
};

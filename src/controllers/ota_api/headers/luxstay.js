const fetch = require('@utils/fetch');
const { getCookie, generateCookie } = require('@utils/cookie');

const URI = 'https://host.luxstay.net/login';
const URI_API = 'https://host.luxstay.net/auth-api/public/login';

async function getHeaders(accountData) {
	let preCookie = await fetch(URI, {
		headers: {
			Accept: '*/*',
			Host: 'host.luxstay.net',
		},
	}).then(res => generateCookie(res.headers.raw()['set-cookie']));

	const data = await fetch(URI_API, {
		method: 'POST',
		headers: {
			accept: 'application/json, text/plain, */*',
			'accept-language': 'vi',
			'content-type': 'application/json;charset=UTF-8',
			Host: 'host.luxstay.net',
			authority: 'host.luxstay.net',
			cookie: preCookie,
		},
		body: JSON.stringify({ email: accountData.username, password: accountData.password }),
	}).then(res => res.json());

	if (!data || !data.data || !data.data.access_token)
		return {
			error_code: 1,
		};

	const __cfduid = getCookie(preCookie, '__cfduid');

	return {
		data: {
			cookie: `__cfduid=${__cfduid}; token=${data.data.access_token}; refresh_token=${data.data.refresh_token}`,
			token: data.data.access_token,
			other: {
				authorization: `${data.data.token_type} ${data.data.access_token}`,
			},
		},
	};
}

module.exports = {
	getHeaders,
};

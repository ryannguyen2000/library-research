const cherrio = require('cheerio');
const fetch = require('@utils/fetch');
const { generateCookie, getCookie } = require('@utils/cookie');

const URI = 'https://quickstay.vn/partner/login';

const defaultHeaders = {
	Accept: '*/*',
	'Content-Type': 'application/x-www-form-urlencoded',
	Host: 'quickstay.vn',
	Origin: 'https://quickstay.vn',
	Referer: 'https://quickstay.vn/partner/login',
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.111 Safari/537.36',
};

async function getToken() {
	const res = await fetch(URI, {
		headers: defaultHeaders,
	});

	const preCookie = generateCookie(res.headers.raw()['set-cookie']);
	const $ = cherrio.load(await res.text());
	const token = $('meta[name=csrf-token]').attr('content');

	return {
		preCookie,
		token,
	};
}

async function getHeaders(accountData) {
	const { preCookie, token } = await getToken();

	if (!preCookie)
		return {
			error_code: 1,
		};

	const cookie = await fetch(URI, {
		method: 'POST',
		headers: {
			...defaultHeaders,
			Cookie: preCookie,
		},
		redirect: 'manual',
		body: new URLSearchParams(`_token=${token}&email=${accountData.username}&password=${accountData.password}`),
	}).then(res => {
		return generateCookie(res.headers.raw()['set-cookie']);
	});

	return {
		data: {
			cookie,
			other: {
				'X-CSRF-TOKEN': token,
				'X-XSRF-TOKEN': decodeURIComponent(getCookie(cookie, 'XSRF-TOKEN')),
			},
		},
	};
}

// getHeaders({
// 	username: 'reservation@tb.com',
// 	password: 'motel123',
// });

module.exports = {
	getHeaders,
};

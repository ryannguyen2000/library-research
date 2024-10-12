const _ = require('lodash');

function getCookie(cookie = '', name, multi) {
	const arrayOfCookie = cookie.split(';');
	const rs = [];
	for (let ck of arrayOfCookie) {
		const [key, value] = ck.split('=');
		if (key.trim() === name) {
			if (multi) {
				rs.push(unescape(value));
			} else {
				return unescape(value);
			}
		}
	}
	return multi ? rs : '';
}

function setCookie(cookie = '', newCookie = '') {
	const arrayOfCookie = cookie.split(';');
	const arrayOfNewCookie = newCookie.split(';');

	arrayOfNewCookie.forEach(newCk => {
		let [newKey, newValue] = newCk.split('=');
		newKey = newKey.trim();
		for (let i = 0; i < arrayOfCookie.length; i++) {
			let key = arrayOfCookie[i].split('=')[0].trim();
			if (key === newKey) {
				arrayOfCookie[i] = newCk;
				return;
			}
		}
		arrayOfCookie.push(`${newKey}=${newValue}`);
	});

	return arrayOfCookie.join(';').toString();
}

function generateCookie(cookieArray) {
	if (cookieArray && cookieArray.length) return cookieArray.join(';');
	return '';
}

function parseCookies(cookies) {
	const rs = {};
	if (!cookies) return rs;
	if (_.isString(cookies)) cookies = cookies.split(';');

	cookies.forEach(cookie => {
		[cookie] = cookie.split(';');
		let index = cookie.indexOf('=');
		let key = _.trim(cookie.substr(0, index));
		let value = _.trim(cookie.substr(index + 1));
		if (!key) return;
		rs[key] = value;
	});

	return rs;
}

function stringifyCookies(cookieObj) {
	return _.entries(cookieObj)
		.map(([key, value]) => `${key}=${value}`)
		.join('; ');
}

module.exports = {
	getCookie,
	setCookie,
	generateCookie,
	stringifyCookies,
	parseCookies,
};

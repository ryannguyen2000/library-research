const mongoose = require('mongoose');
// const _ = require('lodash');

const fetch = require('@utils/fetch');
const { generateCookie } = require('@utils/cookie');

const defaultHeaders = {
	Accept: 'application/json',
	'content-type': 'application/json; utf8',
	Origin: 'https://ycs.agoda.com',
	Referer: 'https://ycs.agoda.com/en-us/kipp/public/login',
};

async function sendOTP(username) {
	const res = await fetch(
		'https://ycs.agoda.com/en-us/kipp/api/login/SendOTP?referrer=http%3A%2F%2Fycs.agoda.com%2Fen-us%2Fkipp%2Fapp%2Fsettings%2Fpropertysearch',
		{
			method: 'POST',
			headers: defaultHeaders,
			body: JSON.stringify({
				Username: username,
				RememberMe: true,
				OtpTarget: 1,
			}),
		}
	);

	const data = await res.json();
	const cookie = generateCookie(res.headers.raw()['set-cookie']);

	if (data.OTPToken) {
		return {
			OTPToken: data.OTPToken,
			cookie,
		};
	}

	return Promise.reject(`Get OTP error ${JSON.stringify(data)}`);
}

async function verifyOTP(username, OTPToken, OTPCode, cookie) {
	const res = await fetch('https://ycs.agoda.com/en-us/kipp/api/login/VerifyOTP', {
		method: 'POST',
		headers: {
			...defaultHeaders,
			Cookie: cookie,
		},
		body: JSON.stringify({
			Username: username,
			OTPToken,
			OTPCode,
			PersistCookie: true,
			OtpTarget: 1,
		}),
	});

	const data = await res.json();
	if (data.Status === 'LoginSuccessful') {
		return {
			cookie: generateCookie(res.headers.raw()['set-cookie']),
		};
	}
	return Promise.reject(`VerifyOTP error ${JSON.stringify(data)}`);
}

// const WaitTime = 120 * 1000;

async function getOTP(email, otaName) {
	// const t1 = Date.now() + WaitTime;

	// let pin;

	// while (!pin) {
	// 	const passcode = await mongoose
	// 		.model('Passcode')
	// 		.findOne({ to: new RegExp(_.escapeRegExp(email), 'i'), createdAt: { $gte: time } })
	// 		.sort({ $natural: -1 });

	// 	pin = passcode && passcode.code;

	// 	if (pin) break;
	// 	if (Date.now() > t1) return Promise.reject(`Get OTP timeout ${email}`);

	// 	await Promise.delay(500);
	// }

	// return pin;

	return await mongoose.model('Passcode').findOTP({
		otaName,
		email,
	});
}

async function getHeaders(accountData) {
	const OTPData = await sendOTP(accountData.username);

	const OTPCode = await getOTP(accountData.username, accountData.name);

	const data = await verifyOTP(accountData.username, OTPData.OTPToken, OTPCode, OTPData.cookie);

	if (data.cookie) {
		return {
			data: {
				cookie: data.cookie,
			},
		};
	}

	return {
		error_code: 1,
	};
}

module.exports = {
	getHeaders,
};

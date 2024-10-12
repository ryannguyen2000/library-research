// const mongoose = require('mongoose');

const fetch = require('@utils/fetch');
const { logger } = require('@utils/logger');
// const { getCookie, generateCookie } = require('@utils/cookie');
const { getTravelokaHeader } = require('@controllers/ota_api/header_helper');

// function getTeraCookie(accountData) {
// 	return fetch('https://tera.traveloka.com/v2/login/', {
// 		headers: {
// 			Cookie: accountData.cookie,
// 			// Origin: 'https://tera.traveloka.com',
// 			// Referer: 'https://tera.traveloka.com',
// 		},
// 	});
// 	// return fetch('https://tera.traveloka.com/v2/login/', {
// 	// 	headers: {
// 	// 		cookie: accountData.cookie,
// 	// 		Origin: 'https://tera.traveloka.com',
// 	// 		Referer: 'https://tera.traveloka.com',
// 	// 	},
// 	// }).then(res => generateCookie(res.headers.raw()['set-cookie']));
// }

// async function getAwsToken(accountData) {
// 	const uri = `https://cognito-idp.ap-southeast-1.amazonaws.com/`;

// 	const res = await fetch(uri, {
// 		method: 'POST',
// 		headers: {
// 			'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
// 			'X-Amz-User-Agent': 'aws-amplify/5.0.4 js',
// 			'content-type': 'application/x-amz-json-1.1',
// 			Origin: 'https://tera.traveloka.com',
// 			Referer: 'https://tera.traveloka.com',
// 		},
// 		body: JSON.stringify({
// 			AuthFlow: 'USER_PASSWORD_AUTH',
// 			// ClientId: 'rhpctq49brasm2n0ku9a27qc0',
// 			ClientId: accountData.other.ClientId,
// 			AuthParameters: { USERNAME: accountData.username, PASSWORD: accountData.password },
// 			ClientMetadata: {},
// 		}),
// 	});

// 	const json = await res.json();

// 	logger.info('getAwsToken', json);

// 	// const res2 = await fetch(uri, {
// 	// 	method: 'POST',
// 	// 	headers: {
// 	// 		'X-Amz-Target': 'AWSCognitoIdentityProviderService.GetUser',
// 	// 		'X-Amz-User-Agent': 'aws-amplify/5.0.4 js',
// 	// 		'content-type': 'application/x-amz-json-1.1',
// 	// 		Origin: 'https://tera.traveloka.com',
// 	// 		Referer: 'https://tera.traveloka.com',
// 	// 	},
// 	// 	body: JSON.stringify({
// 	// 		AccessToken: json.AuthenticationResult.AccessToken,
// 	// 	}),
// 	// });
// 	// const json2 = await res2.json();

// 	// logger.info('getAwsToken GetUser', json2);

// 	// AccessToken: 'eyJraWQiOiJDTXZDcXJmZDlrb2lZc2NaQm5ua0JPQzdyblYwU080Y0N2TlpcLzRWelwva2M9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI5MjAzMjM4YS0xYzFlLTQ5OWEtOGJjOC00OGMzOGIwNTQ1MjQiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGhlYXN0LTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGhlYXN0LTFfQnFYNHR4YmdjIiwiY2xpZW50X2lkIjoicmhwY3RxNDlicmFzbTJuMGt1OWEyN3FjMCIsIm9yaWdpbl9qdGkiOiIzYmIzYTVkNi0wY2NlLTQyZTUtOWVkZi01ZGQzZGVhNmFmMzQiLCJldmVudF9pZCI6IjU5MzllMDRiLTY0MzQtNDNhMS1hYTFmLTdkNjg2YzU0YzRhZiIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE3MTk4MjAyNjcsImV4cCI6MTcxOTgyMzg2NywiaWF0IjoxNzE5ODIwMjY3LCJqdGkiOiJkNzI1ZGU5Mi03N2M5LTQ1OWQtYWU4MS0yMWRlZmNmYzdmMjIiLCJ1c2VybmFtZSI6Ijc3MDMxMzcwLTFmZDItNDg0ZS1hY2M3LWZmYjdhMmMyZjZmMSJ9.HxtX-t7wd41N9DIiUZpx0thkwCiHu9EFhalKhgiVaZgU8gzQ3r4rU7urUTTi-qi72ZQ7ODbscRvd3t-Mwjk8ugLZeUpOgUVcnObMegotyLOsJYIbfFUJc69fV3zvZD3kYl8GvyNRqx65xulTUQ60f9P6MIp5o7RuZxauo8fIsxJnw9ykNrcc7hyM5S9du0XKdCxIn56AYeljnz43Qv4LS2qNjZCcu_ZMVvqTs3CwLBq_3D4YdG4K5w0WgF6h7NeV9K9yDYsUU-3kAWDWkonoFmjNQlhiYZAbSXP3iri9R6RodsxjxVLZfcesaRjQFk8d1Cs5MLNBl9s181ORFGG_CQ';
// 	// ExpiresIn: 3600;
// 	// IdToken: 'eyJraWQiOiJEblwvS1l3WEs3TUtydldxcjc2bXBsOWthdFJlMkhlYWxFbnE3RXhxazJVQT0iLCJhbGciOiJSUzI1NiJ9.eyJodHRwczpcL1wvdHZsa1wvcGVybWlzc2lvbnMiOiJINHNJQUFBQUFBQUFBNHVPQlFBcHUwd05BZ0FBQUE9PSIsImh0dHBzOlwvXC90dmxrXC9ncm91cHMiOiJINHNJQUFBQUFBQUFBNHVPQlFBcHUwd05BZ0FBQUE9PSIsInN1YiI6IjkyMDMyMzhhLTFjMWUtNDk5YS04YmM4LTQ4YzM4YjA1NDUyNCIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGhlYXN0LTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGhlYXN0LTFfQnFYNHR4YmdjIiwiY29nbml0bzp1c2VybmFtZSI6Ijc3MDMxMzcwLTFmZDItNDg0ZS1hY2M3LWZmYjdhMmMyZjZmMSIsImh0dHBzOlwvXC90dmxrXC9jb21wcmVzc2lvbi1tZXRob2QiOiJnemlwIiwib3JpZ2luX2p0aSI6IjNiYjNhNWQ2LTBjY2UtNDJlNS05ZWRmLTVkZDNkZWE2YWYzNCIsImF1ZCI6InJocGN0cTQ5YnJhc20ybjBrdTlhMjdxYzAiLCJldmVudF9pZCI6IjU5MzllMDRiLTY0MzQtNDNhMS1hYTFmLTdkNjg2YzU0YzRhZiIsInRva2VuX3VzZSI6ImlkIiwiYXV0aF90aW1lIjoxNzE5ODIwMjY3LCJuYW1lIjoiYWRtaW5AY296cnVtLmNvbSIsImV4cCI6MTcxOTgyMzg2NywiaWF0IjoxNzE5ODIwMjY3LCJqdGkiOiJjMjkzZTJkNi1jNTAxLTRkNTktYTE2Mi1kM2ZlYzM3OTc1MjAiLCJlbWFpbCI6ImFkbWluQGNvenJ1bS5jb20ifQ.IJXwOSuAz8Fjn-n_DMBLE5O5Fwc0qiIuqhw6mDwvJZMNx6fT0i2s3zJtzvN5qPrztft6OCrVzI_u1guMmEQgxjrVv9FK46MynOsLLPtnmeMKzLpnm66aKZziiXnwz72nE_7HscsrnfG-KCxr6KemM-7epNlzMIYe-qIQsk8dyvY9evGCAqMrnglnL468qhcsF4F371oUj45EJHUwpJ6Vgx9mHaxH-5KllHozGJBxBOmgWtSQshOCtraxOqg-UXLfaomSNp6kBqujOzq1FZOnzoioeZ7iRlfrX7spbvuMFFs9luo7tt6ARZXQo82iB81YmlZfJfgMWKqAJgUwF-N-WQ';
// 	// RefreshToken: 'eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ.Z9Es0JFpmcwoWkjnZ0vCXccKspSOZu5oCWjxZ85ivFjThn7tCXEe0NMrB__V7LZZkkkK8txqwzZDmdxnWcBsVStVL_ReiVhwwkfCA-Ryv1Sr8pAjdHhn0kHgJL3kkL01rL7P4UhupS4PaW1q6rMkb42OPLvNxdQhgrkNeYjGRK3YKoYYSalM4FgHX_-_r1gYosXn4YH0j41xuzNYSVRp4ep_7EFY3FxJxd7UNoJc_uBrKUaG9TO11C6CEuL3FwO3UuzzKW9YSFyOGuXgqQUQ9MEJg6w9cKmTAQGbhS7O8_mzzA8GtmgqrVZpmGCQyujKk3F_FHWEyD9NL7MTbkMQtw.6kX6SefzV_7anpvL.6A4QWp0HaTu4epMJ2ZtdMfkD6eR_RKXsAdXauL5h2va1zqaXbCN8NfpCVwYfnP7uctPRGaRgdy9YcxaZsQLi1lqDQPDoUkr6SsnxHqGsrb-VyvSr3o9kABJqlEQjaDFHEt1MJ62JiPAh3zn1aPMe31wIFE4T63r-V3gbVVsilujH5DGGGX-tZIzfiPMvdgfOTHNLE4QfndkjGSwcQ3uHD-bxxI1o-LlHe8tQAd0jnQWzviXbAnC7oR_s7YiCAARKKJc8PgyuXWXPDQgv2YJxz047tRohghsIUjUR3WxW9mHUqP0ZPhqGVT9WKHNLQIdYXGgwAzG5bLaeBj3dzDZYsotGrXkpert2DeMLu8gudODZ7-zlozL0-ELOfcmM87YIIDUxroFGrsXcDXNNW60q_QtTlAL4jKEXFnCBUvz84WhohKK_Rd1Vg679_5xRtLPIQD6zvR9OWbcIXFChPq77_hDrC2LmjBWKkHNe9o9KHiYpTgt20nSw8IlcedirD4zsr2NoeyY1zuaqfBDuBo4Zq7ofZJtqbcnIW_Ckwn5s1uuofxffBfIYFEHJWcmjWIITRuPkRgDtLglTo5rb1qNCq66aRr7P9QVlfeN8zYRCFIJsbSdGYytR3fOP6iGGIXNWcXO_2zKQA-NshpqR1RMyf82Si73493Vo-gJQ3HvBMTWHUkLcXmcpuQ2ZtJ-pBOI_B5s5Ms1LTHtZdBZh3gMpEzl9LeV_362nEJFg69hau5rsF--SIAzylaczyYrP0vjCIlVxCTJHQBclBpp4phnBUlNm5UoVWPhyG69gGfgCpqVZouaChRyrIVeC2BH7G1izDrOXqGSdDwJDq7Qmk8jnHJKWFxhzGxLnp4iu_cVavPGixqaViWznKXLmqhdBpWoBE2JsYuHbAs8YaCYZ-8PCBNYJNDoRX-6Po_WJwgVfiUah3kjYbKA_HNGlxORnyV38_XNVBrm0FYT3J8f73tWIZftagAM5BQSIZgGhYbYTePIBvCJzxHK7zLRgNU5XIJSbKX3nemHtsRdRDw7nzGIxSOb7c53vMqKRduiIsquomBAHPepe6Be_kn94FQPqnykG2I6onaD-Rk9WyXUkHV8YYvs5DWGOb1B9AenawO2TZ0o3XU9rwrjW5L8wAnQjPUWIOL2RVJc6iIGu6kREVx1jvBs7zs-fxf1fLQ81sZuIz7K7XRDGD-0ZgZD7R2FKkbXcqUgdzqUONZv0n5iZLOCRy6aCo-xhO5DYXgxww3hTK78WICN1Xi8QnTrrbTAA-Glh9_lrzwMYTNkNA8GMOfkiEn8F-7apcVqw3Oyc1Vs_czc5McnLDgN3K_W87HVOxpyU_ilOmDIXrgU.vixz7Gc3r5vEb4TohBOxBQ';
// 	// TokenType: 'Bearer';

// 	return json.AuthenticationResult;
// }

// async function getContext(loginData, token) {
// 	return fetch('https://astcnt-public.ast.traveloka.com/api/v2/login', {
// 		method: 'POST',
// 		headers: {
// 			'content-type': 'application/json',
// 			accept: '*/*',
// 			origin: 'https://tera.traveloka.com',
// 			referer: 'https://tera.traveloka.com/',
// 			Authorization: `Bearer ${token}`,
// 			'X-Hnet': loginData.context.hnetSession,
// 			// 'X-Hnet-Did':
// 			// e53fd4e66ac3b9d80711cc912d2ebe764d24dde3ef147d5977a8960c222e52ad
// 			'X-Hnet-Lifetime': loginData.context.hnetLifetime,
// 			'X-Hnet-Session': loginData.context.hnetSession,
// 		},
// 		body: JSON.stringify(loginData),
// 	}).then(res => res.json());
// }

// function validateOTP(context, accountData, otp, otpTokenId, token) {
// 	const body = JSON.stringify({
// 		data: {
// 			email: accountData.username,
// 			pid: otp,
// 			tokenId: otpTokenId,
// 		},
// 		context: {
// 			hnetLifetime: context.hnetLifetime,
// 			hnetSession: context.hnetSession,
// 		},
// 		auth: {
// 			key: 'dummy',
// 			password: 'dummy',
// 			username: 'dummy',
// 		},
// 	});

// 	const headers = {
// 		'content-type': 'application/json',
// 		accept: '*/*',
// 		origin: 'https://tera.traveloka.com',
// 		referer: 'https://tera.traveloka.com/',
// 		Authorization: `Bearer ${token}`,
// 		'X-Hnet': context.hnetSession,
// 		// 'X-Hnet-Did':
// 		// e53fd4e66ac3b9d80711cc912d2ebe764d24dde3ef147d5977a8960c222e52ad
// 		'X-Hnet-Lifetime': context.hnetLifetime,
// 		'X-Hnet-Session': context.hnetSession,
// 	};

// 	logger.info('validateOTP', headers, body);

// 	return fetch('https://astlapi-public.ast.traveloka.com/api/v1/mfa/verification/validate', {
// 		method: 'POST',
// 		headers,
// 		body,
// 	}).then(res => res.json());
// }

// async function getHeaders(accountData) {
// 	if (!accountData.cookie) {
// 		return {
// 			error_code: 1,
// 		};
// 	}

// 	const res = await getTeraCookie(accountData);

// 	const checkCookie = generateCookie(res.headers.raw()['set-cookie']);
// 	console.log(checkCookie);

// 	if (getCookie(checkCookie, 'hnet-lifetime-0001')) {
// 		return;
// 	}

// 	// return;

// 	const { IdToken } = await getAwsToken(accountData);

// 	const loginData = {
// 		data: {},
// 		context: {
// 			// hnetLifetime:
// 			// 	getCookie(cookie, 'hnet-lifetime-0001') || getCookie(accountData.cookie, 'hnet-lifetime-0001'),
// 			// hnetSession: getCookie(cookie, 'hnet-session-0001') || getCookie(accountData.cookie, 'hnet-session-0001'),
// 			hnetLifetime: getCookie(accountData.cookie, 'hnet-lifetime-0001'),
// 			hnetSession: getCookie(accountData.cookie, 'hnet-session-0001'),
// 		},
// 		auth: accountData.other.auth,
// 	};

// 	let data = await getContext(loginData, IdToken, accountData);

// 	if (data.data && data.data.loginResult === 'MFA_REQUIRED') {
// 		logger.info('MFA_REQUIRED', JSON.stringify(data));

// 		const otp = await mongoose.model('Passcode').findOTP({
// 			otaName: accountData.name,
// 			email: accountData.username,
// 		});

// 		if (otp) {
// 			data = await validateOTP(data.context, accountData, otp, data.data.otp.tokenId, IdToken);
// 		}
// 	}

// 	if (data.data && data.data.loginResult === 'LOGIN_SUCCESS') {
// 		logger.info('LOGIN_SUCCESS', JSON.stringify(data));

// 		return {
// 			data: {
// 				other: {
// 					context: {
// 						hnetLifetime: data.context.hnetLifetime || loginData.context.hnetLifetime,
// 						hnetSession: data.context.hnetSession,
// 					},
// 				},
// 				token: IdToken,
// 			},
// 		};
// 	}

// 	logger.error('traveloka getHeaders', JSON.stringify(data));

// 	return {
// 		error_code: 1,
// 	};
// }

async function changeHotelSession(otaInfo, propertyId, retried = 0) {
	if (!propertyId || otaInfo.other.hotelId === propertyId) {
		return otaInfo.other.context;
	}

	const uri = 'https://astcnt-public.ast.traveloka.com/v1/account/changeHotelSession';
	const body = JSON.stringify({
		context: otaInfo.other.context,
		auth: otaInfo.other.auth,
		data: {
			hotelId: propertyId,
		},
	});
	const headers = getTravelokaHeader(otaInfo);

	const results = await fetch(uri, {
		method: 'POST',
		headers,
		body,
	});
	// if (!results.ok) {
	// 	logger.error('changeHotelSession', body, headers, await results.text());
	// 	throw new Error(`traveloka change hotel sessison error`);
	// }

	const json = await results.json();

	if (json.status !== 'SUCCESS') {
		if (json.message === 'LOGIN_SESSION_EXPIRED' && retried < 1) {
			await require('@controllers/ota_helper').updateOTAConfig(otaInfo);

			return changeHotelSession(otaInfo, propertyId, retried + 1);
		}

		logger.error('changeHotelSession', body, JSON.stringify(json));
		throw new Error(`traveloka change hotel sessison error`);
	}

	const newContext = {
		hnetLifetime: json.context.hnetLifetime || 1,
		hnetSession: json.context.hnetSession,
	};

	otaInfo.set('other.context', newContext);
	otaInfo.set('other.hotelId', propertyId.toString());
	await otaInfo.save();

	// otaInfo.other.context = {
	// 	hnetLifetime: json.context.hnetLifetime || 1,
	// 	hnetSession: json.context.hnetSession,
	// };

	return newContext;
}

module.exports = {
	// getHeaders,
	changeHotelSession,
};

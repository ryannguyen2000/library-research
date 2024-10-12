const urlRegex = require('url-regex');

const { CSV_CONFIG } = require('@config/setting');
const fetch = require('@utils/fetch');
const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');

function checkUrl(url) {
	const isValid = urlRegex().test(url);
	if (!isValid) throw new ThrowReturn('Url is not valid!');
	return isValid;
}

function getHeader() {
	return {
		Authorization: `Basic ${Buffer.from(`${CSV_CONFIG.API_KEY}:${CSV_CONFIG.API_SECRET}`).toString('base64')}`,
	};
}

async function detectPassport(url) {
	checkUrl(url);

	const res = await fetch(
		`${CSV_CONFIG.API_URL}/backend/api/v1/request/ocr/cmt/get_infor_all?url=${encodeURIComponent(url)}`,
		{
			headers: getHeader(),
		}
	);

	if (!res.ok) {
		const txt = await res.text();
		logger.error(txt);
		throw new ThrowReturn('Server error!');
	}

	return res.json();
}

function getTextBase64(b64 = '') {
	return b64.replace(/^data:image\/(jpeg|png);base64,/, '');
}

async function detectPassportBase64(base64) {
	base64 = getTextBase64(base64);

	if (!base64) {
		return {
			valid: 'False',
		};
	}

	const data = await fetch(`${CSV_CONFIG.API_URL}/backend/api/v1/request/ocr/cmt/get_infor_allbase64`, {
		headers: {
			...getHeader(),
			'Content-Type': 'application/json',
		},
		method: 'POST',
		body: JSON.stringify({
			image: base64,
		}),
	});

	const json = await data.json();
	if (!data.ok) {
		logger.error(json);
		throw new ThrowReturn(json.detail || 'Server error!');
	}
	return json;
}

module.exports = {
	detectPassport,
	detectPassportBase64,
};

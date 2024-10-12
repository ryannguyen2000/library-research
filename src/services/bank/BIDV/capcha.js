const FormData = require('form-data');
const _ = require('lodash');
const fetch = require('../../../utils/fetch');

const API_KEY = 'K88008143088957';
const MAX_RETRY = 1;

async function detectCapcha(capchaUrl, retry = 0) {
	const base64 = `data:image/jpg;base64, ${capchaUrl}`;

	const formData = new FormData();
	formData.append('base64Image', base64);
	formData.append('language', 'eng');
	formData.append('isOverlayRequired', 'false');
	formData.append('detectOrientation', 'false');
	formData.append('isCreateSearchablePdf', 'false');
	formData.append('isSearchablePdfHideTextLayer', 'false');
	formData.append('scale', 'false');
	formData.append('isTable', 'false');
	formData.append('OCREngine', '1');
	// formData.append('filetype', 'JPG');

	const res = await fetch('https://api.ocr.space/parse/image', {
		method: 'POST',
		headers: {
			apikey: API_KEY,
			...formData.getHeaders(),
		},
		body: formData,
	});

	if (!res.ok) {
		if (retry < MAX_RETRY) return detectCapcha(capchaUrl, retry + 1);
		throw new Error(`detectCapcha error ${await res.text()}`);
	}

	const data = await res.json();
	const parsedText = _.get(data, 'ParsedResults[0].ParsedText');
	const capcha = parsedText && parsedText.match(/\d|\w/g).join('').slice(0, 6);
	if (!capcha || capcha.length !== 6) {
		if (retry < MAX_RETRY) return detectCapcha(capchaUrl, retry + 1);
		throw new Error(`detectCapcha error ${JSON.stringify(data)}`);
	}
	return capcha;
}

module.exports = {
	detectCapcha,
};

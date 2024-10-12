const crypto = require('crypto');
const moment = require('moment');
const _ = require('lodash');
const { LANGUAGE } = require('./const');

const btoa = text => {
	return Buffer.from(text, 'binary').toString('base64');
};

const atob = base64 => {
	return Buffer.from(base64, 'base64').toString('binary');
};

function sha256(text) {
	return crypto.createHash('sha256').update(text).digest('hex');
}

function formatPrice(price, currency = 'VND') {
	if (!price) return '';

	return `${Number(price).toLocaleString()}${currency !== 'VND' ? ` ${currency}` : ''}`;
}

function fib(n) {
	const phi = (1 + Math.sqrt(5)) / 2;
	const asymp = phi ** n / Math.sqrt(5);

	return Math.round(asymp);
}

function toEnglishText(number) {
	const units = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
	const tens = ['', 'ten', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
	const teens = [
		'ten',
		'eleven',
		'twelve',
		'thirteen',
		'fourteen',
		'fifteen',
		'sixteen',
		'seventeen',
		'eighteen',
		'nineteen',
	];
	if (number < 10) {
		return units[number];
	}
	if (number < 20) {
		return teens[number - 10];
	}
	if (number < 40) {
		return `${tens[Math.floor(number / 10)]} ${units[number % 10]}`;
	}
}

function toVietnameseText(number) {
	const text = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
	if (number < 10) {
		return text[number];
	}
	if (number < 20) {
		return number % 10 ? `mười ${text[number % 10]}` : 'mười';
	}
	if (number < 40) {
		return `${text[Math.floor(number / 10)]} mươi ${text[number % 10]}`;
	}
}

function formatDateDiffText(startDate, endDate, language) {
	const isEn = language === LANGUAGE.EN;
	const duration = moment.duration(moment(endDate).diff(moment(startDate)));
	const years = duration.years() > 0 ? `${duration.years()} năm ` : '';
	const months =
		duration.months() > 0
			? `${duration.months().toString().padStart(2, '0')} (${
					!isEn ? toVietnameseText(duration.months()) : toEnglishText(duration.months())
			  }) ${!isEn ? 'tháng' : 'months'} `
			: '';
	const days =
		duration.days() > 0
			? `${duration.days().toString().padStart(2, '0')} (${
					!isEn ? toVietnameseText(duration.days()) : toEnglishText(duration.days())
			  }) ${!isEn ? 'ngày' : 'days'}	`
			: '';
	const formattedDuration = years + months + days;

	return formattedDuration.trim();
}

function equalConditions(con, value) {
	if (!_.isObject(con)) return con === value;

	return _.entries(con).every(([operator, opValue]) => {
		if (operator === 'gt') return value > opValue;
		if (operator === 'gte') return value >= opValue;
		if (operator === 'lt') return value < opValue;
		if (operator === 'lte') return value <= opValue;
		if (operator === 'ne') return value !== opValue;
		if (operator === 'in') return _.includes(opValue, value);
		if (operator === 'nin') return !_.includes(opValue, value);
		return false;
	});
}

function isDocx(url) {
	if (typeof url !== 'string') return false;
	return url.match(/\.doc(x)*$/i) != null;
}

function isXlsx(url) {
	if (typeof url !== 'string') return false;
	return url.match(/\.xls(x)*$/i) !== null;
}

function isImageUrl(url) {
	if (typeof url !== 'string') return false;
	return url.match(/^http[^?]*.(jpg|jpeg|gif|png|tiff|bmp|svg)(\?(.*))?$/gim) != null;
}

function extractEmails(text) {
	return text && text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi);
}

function doIf(_if, _then, _else) {
	return (...args) => (_if(...args) ? _then(...args) : _else(...args));
}

function randomColor() {
	const letters = '0123456789ABCDEF';

	let color = '#';

	for (let i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}

	return color;
}

module.exports = {
	atob,
	btoa,
	sha256,
	formatPrice,
	fib,
	formatDateDiffText,
	equalConditions,
	isDocx,
	isXlsx,
	extractEmails,
	doIf,
	isImageUrl,
	randomColor,
};

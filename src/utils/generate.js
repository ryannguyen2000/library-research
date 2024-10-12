const mongoose = require('mongoose');
const { customAlphabet } = require('nanoid');

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 6);

async function genBookingCode(func) {
	const code = nanoid();
	const otaBookingId = func ? func(code) : code;

	if (await mongoose.model('Booking').findOne({ otaBookingId }).select('_id')) {
		return genBookingCode(func);
	}

	return otaBookingId;
}

function removeAccents(str, lowwer = true) {
	str = str || '';
	if (lowwer) {
		str = str.toLowerCase();
	}

	return str
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'D');
}

function removeSpecChars(str) {
	return removeAccents(str, false).replace(/[^a-zA-Z0-9\s]/g, '');
}

function genUrl(name, removeAccent = true) {
	if (!name) return name;
	if (removeAccent) name = removeAccents(name);
	const decoded = name.replace(/[^a-zA-Z0-9]/g, '-');
	let url = '';
	for (let c of decoded) {
		if (c !== '-' || url[url.length - 1] !== '-') {
			url += c;
		}
	}
	if (url[url.length - 1] === '-') {
		url = url.slice(0, url.length - 1);
	}
	return url.toLowerCase();
}

function genSlug(name, removeAccent = true) {
	return `${genUrl(name, removeAccent)}-${customAlphabet('0123456789', 4)()}`;
}

module.exports = {
	genBookingCode,
	nanoid,
	genUrl,
	genSlug,
	removeAccents,
	removeSpecChars,
};

const { parsePhoneNumber } = require('libphonenumber-js');
const { VirtualBookingPhone } = require('@utils/const');

const MIGRATE_FROM_MAP = [
	'84162',
	'84163',
	'84164',
	'84165',
	'84166',
	'84167',
	'84168',
	'84169',
	'84120',
	'84121',
	'84122',
	'84123',
	'84124',
	'84125',
	'84126',
	'84127',
	'84128',
	'84129',
	'84186',
	'84188',
	'84199',
];

const MIGRATE_TO_MAP = [
	'8432',
	'8433',
	'8434',
	'8435',
	'8436',
	'8437',
	'8438',
	'8439',
	'8470',
	'8479',
	'8477',
	'8483',
	'8484',
	'8485',
	'8476',
	'8481',
	'8478',
	'8482',
	'8456',
	'8458',
	'8459',
];

function convert11To10(phone) {
	if (phone.length < 5) {
		return phone;
	}

	if (phone[0] === '0') {
		phone = `84${phone.slice(1)}`;
	}

	const h = phone.slice(0, 5);
	const idx = MIGRATE_FROM_MAP.indexOf(h);
	if (idx !== -1) {
		return MIGRATE_TO_MAP[idx] + phone.slice(5);
	}

	return phone;
}

function phoneToInternationalFormat(phone) {
	let p = phone;
	if (p[0] === '0') {
		p = `84${p.slice(1)}`;
	}

	return convert11To10(p);
}

function formatInternational(phone) {
	if (!phone) {
		return phone;
	}

	if (phone.length > 16) {
		return phone;
	}

	try {
		const p0 = convert11To10(phone);
		const p1 = `+${p0.replace(/^\s*\+/, '')}`;
		return parsePhoneNumber(p1).formatInternational();
	} catch (err) {
		return phone;
	}
}

function generatePhoneList(phone) {
	if (!phone) return [];
	phone = phone.toString().replace(/\D/g, '');
	if (phone[0] === '0') {
		return [phone, `84${phone.slice(1)}`, `+84${phone.slice(1)}`];
	}
	if (phone.substring(0, 2) === '84') {
		return [phone, `0${phone.slice(2)}`, `+${phone}`];
	}
	return [phone, `+${phone}`];
}

function normPhone(phone, prefix = true) {
	if (!phone) return phone;

	phone = phone.replace(/\D/g, '');

	if (phone.startsWith('084')) phone = `${phone.slice(1)}`;

	if (phone.startsWith('0')) phone = `84${phone.slice(1)}`;

	if (phone.startsWith('840')) phone = `84${phone.slice(3)}`;

	if (phone.startsWith('8484') && phone.length > 12) phone = `${phone.slice(2)}`;

	phone = convert11To10(phone);
	if (phone && phone.length < 6) phone = '';

	return phone ? `${prefix ? '+' : ''}${phone}` : '';
}

function isVirtualPhone(phone) {
	phone = normPhone(phone);
	if (!phone) return true;
	return phone.length <= 8 || phone.length >= 14 || VirtualBookingPhone.some(vPhone => phone.includes(vPhone));
}

function isVNPhone(phone) {
	return !!phone && phone.startsWith('+84');
}

module.exports = {
	convert11To10,
	phoneToInternationalFormat,
	formatInternational,
	generatePhoneList,
	normPhone,
	isVirtualPhone,
	isVNPhone,
};

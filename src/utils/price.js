const _ = require('lodash');

const VN_NUMBER_WORD = {
	0: 'không',
	1: 'một',
	2: 'hai',
	3: 'ba',
	4: 'bốn',
	5: 'năm',
	6: 'sáu',
	7: 'bảy',
	8: 'tám',
	9: 'chín',
};
const TH = ['mươi', 'trăm', 'nghìn', 'triệu', 'tỉ'];

function toWord(number) {
	let rs = '';
	let numberInt = parseInt(number);
	const numberArr = _.filter([...number]);

	if (numberInt === 0) return '';
	if (numberInt > 99 && numberInt % 100 === 0) {
		return `${VN_NUMBER_WORD[numberInt / 100]} trăm `;
	}
	if (numberInt < 10) return VN_NUMBER_WORD[number];
	if (numberInt < 100 && numberInt % 10 === 0 && number[0] !== '0') {
		if (numberInt === 10) return 'mười';
		return `${VN_NUMBER_WORD[numberInt / 10]} mươi`;
	}

	const _th = TH.slice(0, numberArr.length - 1).reverse();

	_.forEach(numberArr, (_number, index) => {
		const suffix = _th[index] || '';

		if (_number === '0' && !suffix) {
			return;
		}

		if (_number === '0' && suffix === 'mươi') {
			rs += 'lẻ ';
			return;
		}

		if (_number === '1' && suffix !== 'trăm') {
			if (suffix === 'mươi') {
				rs += `mười `;
				return;
			}
			if (!suffix && _.includes(['0', '1'], numberArr[index - 1])) {
				rs += 'một ';
			} else {
				rs += 'mốt ';
			}
			return;
		}

		if (_number === '5' && !suffix) {
			rs += numberArr[index - 1] === '0' ? 'năm' : `lăm`;
			return;
		}

		rs += `${VN_NUMBER_WORD[_number]} ${suffix} `;
	});
	return rs;
}

function convertNumber2VietnameseWord(number) {
	const prices = formatPrice({ price: number }).split(',');
	const _th = TH.slice(1, prices.length + 1).reverse();
	let rs = '';

	_.forEach(prices, (_number, index) => {
		const suffix = _th[index] || '';
		if (parseInt(_number) === 0) return;
		const number2Word = toWord(_number);

		if (suffix === 'trăm') {
			rs += `${number2Word}`;
			return;
		}
		rs += `${number2Word} ${suffix}, `;
	});

	rs = rs.replace(/\s+/g, ' ').trim();
	if (rs[rs.length - 1] === ',') {
		rs = rs.substring(0, rs.length - 1);
	}
	return _.upperFirst(rs);
}

function formatPrice({ price, defaultValue, currency }) {
	if (!defaultValue) defaultValue = '';

	price = Number(price) || defaultValue;

	if (currency) {
		return `${price.toLocaleString()} ${currency}`;
	}
	return `${price.toLocaleString()}`;
}

function formatPriceWithDot(price, char = '.') {
	if (!price) return 0;
	return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, char);
}

const NIL = 'zero';
const NUMBERS = [
	'',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
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
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const UNITS = ['', '', 'hundred', 'thousand', 'million', 'billion', 'trillion'];
const ZEROS = [
	0, 1, 2, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81,
	84, 87, 90, 93, 96, 99, 102, 105, 108, 111, 114, 117, 120, 123, 153, 183, 213, 243, 273, 303, 306, 333, 336, 363,
	366, 393, 423, 453, 483, 513, 543, 573, 603, 903, 1203, 1503, 1803, 2103, 2403, 2703, 3003,
];

function convertNumber2EnglishWord(n) {
	n = n
		.toString()
		.replace(/[^0-9]/g, '')
		.replace(/^0+/, '');

	if (!n.length || n.length > ZEROS[ZEROS.length - 1]) return '';
	if (!Number(n)) return NIL;

	if (n < 20) return NUMBERS[n];
	if (n < 100) return TENS[Math.floor(n / 10)] + NUMBERS[n % 10];

	const { length } = n;
	const index = ZEROS.findIndex(_n => _n > length - 1) - 1;

	const [major, minor] = [n.substring(0, length - ZEROS[index]), n.substring(length - ZEROS[index])].map(
		convertNumber2EnglishWord
	);

	return `${major} ${UNITS[index]} ${minor || ''}`;
}

module.exports = {
	formatPrice,
	formatPriceWithDot,
	convertNumber2VietnameseWord,
	convertNumber2EnglishWord,
};

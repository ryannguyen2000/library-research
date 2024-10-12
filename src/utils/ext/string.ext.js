/* eslint-disable no-bitwise */
// string extensions

const format = require('string-format');

module.exports = { format };

/**
 * string format. See more at https://www.npmjs.com/package/string-format
 *
 * @param {any} args arguments to string format
 */
String.prototype.format = function (...args) {
	return format(this, ...args);
};

/**
 * Java String.hashCode
 * @return {Number} hash-code of string
 */
String.prototype.hashCode = function () {
	let hash = 0;
	for (let i = 0; i < this.length; i++) {
		const char = this.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash &= hash;
	}
	return hash;
};

String.prototype.includesMany = function (...args) {
	return args.every(k => this.includes(k));
};

String.prototype.includesOneOf = function (...args) {
	for (const k of args) {
		if (this.includes(k)) return true;
	}
	return false;
};

String.prototype.replaceAll = function (search, replaceValue) {
	return this.replace(new RegExp(search, 'g'), replaceValue || '');
};

String.prototype.indicesOf = function (str) {
	let time = 0;
	let position = -1;
	do {
		position = this.indexOf(str, position + 1);
		time += position >= 0 ? 1 : 0;
	} while (position >= 0);
	return time;
};

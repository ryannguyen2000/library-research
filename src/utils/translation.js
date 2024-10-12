const format = require('string-format');
const _ = require('lodash');
const fs = require('fs');

const languages = {};
fs.readdirSync('config/language')
	.filter(n => n !== 'index.js')
	.forEach(name => {
		const key = name.replace('.json', '');
		try {
			const modelFile = `@config/language/${name}`;
			const data = require(modelFile);
			languages[key] = data;
		} catch {
			languages[key] = {};
		}
	});

/**
 * translate function
 *
 * @param {[type]}    key      [description]
 * @param {[type]}    language [description]
 * @param {...[type]} options  [description]
 */
function T(key, language, ...options) {
	const sentense = _.get(languages, [language, key], key);
	return options.length ? format(sentense, ...options) : sentense;
}

module.exports = {
	T,
	_T: T,
};

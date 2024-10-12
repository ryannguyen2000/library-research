const fs = require('fs');

/**
 * Callback for adding two numbers.
 *
 * @callback execFunc
 * @param {String|object} planId -  .
 * @param {String} blockId -  .
 * @param {Array<object>} rates -  .
 * @param {Array<String>} roomIds -  .
 */

/**
 * @typedef {Object} Algorithm
 * @property {string} name -
 * @property {execFunc} exec -  .
 */

/**
 *
 *
 * @returns {Object.<string,Algorithm>}
 */
function loadAlgorithms() {
	const modules = {};
	fs.readdirSync(__dirname)
		.filter(n => n.includes('algorithm.js'))
		.map(n => n.replace('.js', ''))
		.forEach(name => {
			const modelFile = `./${name}`;
			const modelName = name.replace('.algorithm', '');
			// eslint-disable-next-line import/no-dynamic-require
			const model = require(modelFile);
			modules[modelName] = model;
		});
	return modules;
}

module.exports = {
	loadAlgorithms,
	Algorithms: loadAlgorithms(),
};

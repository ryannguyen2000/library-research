const _ = require('lodash');

function getArray(value) {
	if (!value) return value;
	return _.compact(_.isArray(value) ? value : _.split(value, ','));
}

module.exports = {
	getArray,
};

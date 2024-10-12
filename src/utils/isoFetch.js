const _ = require('lodash');

require('isomorphic-fetch');

const DEFAULT_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36';

function sfetch(url, options) {
	options = options || {};

	// options.redirect = options.redirect || 'follow';
	// options.follow = 10;

	if (!_.get(options, ['headers', 'User-Agent'])) _.set(options, ['headers', 'User-Agent'], DEFAULT_AGENT);

	return fetch(url, options);
}

module.exports = sfetch;

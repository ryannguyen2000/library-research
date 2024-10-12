module.exports = function (uri, params) {
	params = params || {};
	const keys = Object.keys(params);
	const appends = [];

	for (const key of keys) {
		if (Array.isArray(params[key])) {
			appends.push(...params[key].map(param => `${key}=${encodeURIComponent(param)}`));
		} else {
			appends.push(`${key}=${encodeURIComponent(params[key])}`);
		}
	}

	return `${uri}?${appends.join('&')}`;
};

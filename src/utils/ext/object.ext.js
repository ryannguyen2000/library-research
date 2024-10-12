/**
 * [filter description]
 * @return {[type]} [description]
 */
Object.filter = function (obj, attributes) {
	const ret = {};
	attributes.forEach(attr => {
		if (obj[attr]) ret[attr] = obj[attr];
	});
	return ret;
};

Object.removeEmpty = function (obj) {
	Object.keys(obj).forEach(key => Object.keys(obj[key]).length === 0 && delete obj[key]);
};

/**
 * Filter the value not null in object
 *
 * @param {Object} obj object to filter
 */
Object.notNull = function (obj) {
	return Array.dict(Object.entries(obj).filter(([_, v]) => v));
};

Object.changeKeys = function (obj, keys) {
	const ret = {};
	Object.entries(obj).forEach(([k, v]) => {
		const new_k = keys[k] || k;
		ret[new_k] = v;
	});
	return ret;
};

Object.toPascalKeys = function UnderscoreToPascalKeys(obj) {
	const ret = {};
	Object.entries(obj).forEach(([k, v]) => {
		const new_k = k
			.split('_')
			.map(key => key[0].toUpperCase() + key.slice(1).toLowerCase())
			.join('');
		ret[new_k] = v;
	});
	return ret;
};

function to_snake(key) {
	let prev = 0;
	const words = [];

	for (let i = 1; i < key.length; i++) {
		const c = key[i];
		if (c === c.toUpperCase()) {
			words.push(key.slice(prev, i));
			prev = i;
		}
	}
	words.push(key.slice(prev));

	return words.map(w => w.toLowerCase()).join('_');
}

Object.to_snake_keys = function (obj) {
	const ret = {};
	Object.entries(obj).forEach(([k, v]) => {
		const new_k = to_snake(k);
		ret[new_k] = v;
	});
	return ret;
};

Object.revert = function (obj) {
	return Object.entries(obj).reduce(
		(acc, cur) => ({
			...acc,
			[cur[1]]: cur[0],
		}),
		{}
	);
};

Object.sort = function (obj) {
	const sorted = {};

	Object.keys(obj)
		.sort()
		.forEach(a => {
			sorted[a] = obj[a];
		});

	return sorted;
};

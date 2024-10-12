/**
 * GeneratorFunction class
 */
const GF = Object.getPrototypeOf(function*() {
	console.log('func');
});

// default callback
const defaultCallback = v => v;

/**
 * convert GeneratorFunction to Array.
 *
 * @return {Array}
 */
GF.prototype.toArray = function() {
	return [...this];
};

/**
 * Convert Array to Generator.
 *
 * @return {GeneratorFunction}
 */
Array.prototype.toGenerator = function*() {
	for (const v of this) yield v;
};

/**
 * count number of element.
 *
 * @return {Number}
 */
GF.prototype.count = function() {
	let index = 0;
	for (const _ of this) index++;
	return index;
};

/**
 * The same of `Array.forEarch` function.
 *
 * @param {Function} callback
 */
GF.prototype.forEach = function(callback) {
	let index = 0;
	for (const v of this) {
		callback(v, index++, this);
	}
};

/**
 * The same of `Array.reduce` function.
 *
 * @param {Function} callback
 * @param {any} initialValue
 */
GF.prototype.reduce = function(callback, initialValue) {
	let accumulator = initialValue;
	let index = 0;
	for (const v of this) {
		accumulator = callback(accumulator, v, index++, this);
	}

	return accumulator;
};

GF.prototype.minByComparator = function(comparator) {
	const first = this.next();
	if (first.done) return undefined;

	let target = first.value;

	do {
		const { value, done } = this.next();
		if (done) break;

		if (comparator(value, target) < 0) target = value;
	} while (true);

	return target;
};

GF.prototype.maxByComparator = function(comparator) {
	return this.minByComparator((a, b) => -comparator(a, b));
};

GF.prototype.min = function(callback) {
	const first = this.next();
	if (first.done) return undefined;

	callback = callback || defaultCallback;
	let index = 0;

	let target = first.value;
	let targetValue = callback(target, index++, this);

	do {
		const { value, done } = this.next();
		if (done) break;

		const newValue = callback(value, index++, this);
		if (targetValue > newValue) {
			(target = value), (targetValue = newValue);
		}
	} while (true);

	return target;
};

GF.prototype.max = function(callback) {
	const first = this.next();
	if (first.done) return undefined;

	callback = callback || defaultCallback;
	let index = 0;

	let target = first.value;
	let targetValue = callback(target, index++, this);

	do {
		const { value, done } = this.next();
		if (done) break;

		const newValue = callback(value, index++, this);
		if (targetValue < newValue) {
			(target = value), (targetValue = newValue);
		}
	} while (true);

	return target;
};

/**
 * Sum all Number in GeneratorFunction.<br>
 * The element in GeneratorFunction must be Number
 *
 * @return {Number}
 */
GF.prototype.sum = function() {
	let total = 0;
	for (const v of this) total += v;
	return total;
};

GF.prototype.avg = function() {
	let total = 0.0;
	let index = 0;
	for (const v of this) {
		(total += v), index++;
	}
	return total / index;
};

GF.prototype.round_avg = function() {
	return Math.round(this.avg());
};

GF.prototype.map = function*(callback) {
	let index = 0;
	for (const v of this) {
		yield callback(v, index++, this);
	}
};

GF.zip = function*(...iterables) {
	const iterators = iterables.map(it => (Array.isArray(it) ? it[Symbol.iterator]() : it));

	while (true) {
		const nexts = iterators.map(it => it.next());
		if (nexts.some(n => n.done)) break;
		yield nexts.map(n => n.value);
	}
};

GF.prototype.once = function*(size) {
	while (size--) {
		const { value, done } = this.next();
		if (done) break;
		yield value;
	}
};

GF.prototype.chunk = function*(size) {
	while (true) {
		const once = [...this.once(size)];
		if (!once.length) break;
		yield once;
	}
};

GF.chain = function*(...iterables) {
	for (const it of iterables) {
		for (const e of it) {
			yield e;
		}
	}
};

GF.range = function*(...args) {
	let start = 0;
	let stop = 0;
	let step = 1;

	if (args.length === 1) {
		[stop] = args;
	} else if (args.length == 2) {
		[start, stop] = args;
		step = stop > start ? 1 : -1;
	} else {
		[start, stop, step] = args;
	}

	if (step > 0) {
		for (let i = start; i < stop; i += step) {
			yield i;
		}
	} else {
		for (let i = start; i > stop; i += step) {
			yield i;
		}
	}
};

GF.prototype.takeWhile = function*(callback) {
	callback = callback || defaultCallback;
	let index = 0;
	for (const v of this) {
		if (!callback(v, index++, this)) break;
		yield v;
	}
};

GF.prototype.dropWhile = function*(callback) {
	callback = callback || defaultCallback;

	let start = false;
	let index = 0;

	for (const v of this) {
		if (!start && !callback(v, index++, this)) {
			start = true;
		}

		if (start) yield v;
	}
};

GF.prototype.find = function(callback) {
	let index = 0;
	for (const v of this) {
		if (callback(v, index++, this)) {
			return v;
		}
	}
	return undefined;
};

GF.prototype.findIndex = function(callback) {
	let index = 0;
	for (const v of this) {
		if (callback(v, index, this)) {
			return index;
		}

		index++;
	}
	return -1;
};

GF.prototype.first = function(callback) {
	return this.find(callback || (v => 1));
};

GF.prototype.filter = function*(callback) {
	let index = 0;
	for (const v of this) {
		if (callback(v, index++, this)) {
			yield v;
		}
	}
};

GF.prototype.some = function(callback) {
	let index = 0;
	for (const v of this) {
		if (callback(v, index++, this)) {
			return true;
		}
	}
	return false;
};

GF.prototype.every = function(callback) {
	return !this.some(callback);
};

/**
 * Slice to number of step next
 *
 * @param {Number} step number of next step to slice, must be greater than zero
 */
GF.prototype.slice = function*(step) {
	let index = 0;
	for (const v of this) {
		if (index++ < step) continue;
		yield v;
	}
};

GF.prototype.groupBy = function(callback) {
	callback = callback || defaultCallback;
	const groups = {};
	let index = 0;

	for (const it of this) {
		const key = callback(it, index++, this);
		const group = (groups[key] = groups[key] || []);
		group.push(it);
	}
	return groups;
};

GF.prototype.distinct = function*(callback) {
	callback = callback || defaultCallback;

	let index = 0;
	const s = new Set();

	for (const item of this) {
		const key = callback(item, index++, this);

		if (s.has(key)) continue;

		s.add(key);
		yield item;
	}
};

module.exports = GF;

function* g() {
	for (let i = 0; i < 20; i++) {
		yield i;
	}
}

console.log([1, 2, 3, 4].toGenerator().minByComparator((a, b) => b - a));

// console.log('min', g().min());
// console.log('max', g().max());

// console.log('count', g().count());
// console.log('count', [1, 2, 4].toGenerator().count());

// console.log('count', g().slice(10).count());

// console.log('distinct', [1, 1, 2, 2, 3].toGenerator().distinct().toArray());

// // console.log(g().reduce((a, b) => a + b, 0));

// console.log(g().map(v => v + 1).toArray());
// g().forEach(v=>console.log(v));

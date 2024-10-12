require('./array.ext.js');

// default callback
const defaultCallback = v => v;

/**
 * javascript Generator wrapper class
 */
class Iterable {
	/**
	 * create Iterable from javascript Generator
	 *
	 * read more at `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators`
	 *
	 * @param  {Generator} generator function
	 */
	constructor(generator) {
		this.generator = generator;
		this.reset();
	}

	/**
	 * create Iterable from javascript Generator
	 *
	 * read more at `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators`
	 *
	 * @param  {Generator} generator [description]
	 * @return {Iterable}           [description]
	 */
	static from(generator) {
		return new Iterable(generator);
	}

	/**
	 * next function
	 *
	 * @return {Function} [description]
	 */
	next() {
		return this.iter.next();
	}

	/**
	 * reset generator
	 */
	reset() {
		this.iter = this.generator[Symbol.iterator]();
	}

	/**
	 * set is `Symbol.iterator`
	 */
	[Symbol.iterator]() {
		return this;
	}

	/**
	 * count the number item of iterable.
	 *
	 * @return {Number} number of item
	 */
	count() {
		let index = 0;
		for (const v of this) index++;
		return index;
	}

	/**
	 * iterable `forEach`
	 *
	 * @param  {Function} callback [description]
	 */
	forEach(callback) {
		let index = 0;
		for (const v of this) {
			callback(v, index++, this);
		}
	}

	/**
	 * Same as Array.reduce
	 *
	 * @param  {Function} callback     reduce function
	 * @param  {any}   initialValue     init value for reduce
	 * @return {any}                value of reduce
	 */
	reduce(callback, initialValue) {
		let accumulator = initialValue;

		let index = 0;
		for (const v of this) {
			accumulator = callback(accumulator, v, index++, this);
		}

		return accumulator;
	}

	/**
	 * sum all items
	 *
	 * @return {Number} [description]
	 */
	sum() {
		let total = 0;
		for (const v of this) total += v;
		return total;
	}

	/**
	 * avg of all items
	 *
	 * @return {Number} [description]
	 */
	avg() {
		let total = 0.0;
		let index = 0;
		for (const v of this) {
			total += v;
			index++;
		}
		return total / index;
	}

	/**
	 * round avg
	 *
	 * @return {Number} [description]
	 */
	round_avg() {
		return Math.round(this.avg());
	}

	*__imap(callback) {
		let index = 0;
		for (const v of this) {
			yield callback(v, index++, this);
		}
	}

	/**
	 * [imap description]
	 *
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	imap(callback) {
		return new Iterable(this.__imap(callback));
	}

	/**
	 * [map description]
	 *
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	map(callback) {
		return [...this.__imap(callback)];
	}

	static *__izip(...iterables) {
		const iterators = iterables.map(iterable => iterable[Symbol.iterator]());
		while (true) {
			const nexts = iterators.map(it => it.next());
			if (nexts.some(n => n.done)) break;
			yield nexts.map(n => n.value);
		}
	}

	/**
	 * [izip description]
	 *
	 * @param  {...[type]} iterables [description]
	 * @return {[type]}              [description]
	 */
	static izip(...iterables) {
		return new Iterable(Iterable.__izip(...iterables));
	}

	/**
	 * [zip description]
	 * @param  {...[type]} iterables [description]
	 * @return {[type]}              [description]
	 */
	static zip(...iterables) {
		return [...Iterable.__izip(...iterables)];
	}

	*__ione(size) {
		while (size--) {
			const { value, done } = this.iter.next();
			if (done) break;
			yield value;
		}
	}

	*__ichunk(size) {
		while (true) {
			const one = [...this.__ione(size)];
			if (!one.length) break;
			yield one;
		}
	}

	/**
	 * [ichunk description]
	 *
	 * @param  {Number} size [description]
	 * @return {[type]}      [description]
	 */
	ichunk(size = 1) {
		return new Iterable(this.__ichunk(size));
	}

	/**
	 * [ichunk description]
	 *
	 * @param  {[type]} iterable [description]
	 * @param  {Number} size     [description]
	 * @return {[type]}          [description]
	 */
	static ichunk(iterable, size = 1) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);
		return iterable.ichunk(size);
	}

	/**
	 * [chunk description]
	 *
	 * @param  {[type]} size [description]
	 * @return {[type]}      [description]
	 */
	chunk(size = 1) {
		return [...this.__ichunk(size)];
	}

	/**
	 * [chunk description]
	 *
	 * @param  {[type]} iterable [description]
	 * @param  {Number} size     [description]
	 * @return {[type]}          [description]
	 */
	static chunk(iterable, size = 1) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.chunk(size);
	}

	static *__ichain(...iterables) {
		for (const it of iterables) {
			for (const e of it) {
				yield e;
			}
		}
	}

	/**
	 * [ichain description]
	 *
	 * @param  {...[type]} iterables [description]
	 * @return {[type]}              [description]
	 */
	static ichain(...iterables) {
		return new Iterable(Iterable.__ichain(...iterables));
	}

	/**
	 * [chain description]
	 * @param  {...[type]} iterables [description]
	 * @return {[type]}              [description]
	 */
	static chain(...iterables) {
		return [...Iterable.__ichain(...iterables)];
	}

	static *__irange(...args) {
		let start = 0;
		let stop = 0;
		let step = 1;

		if (args.length === 1) {
			[stop] = args;
		} else if (args.length === 2) {
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
	}

	/**
	 * [irange description]
	 * @param  {...[type]} args [description]
	 * @return {[type]}         [description]
	 */
	static irange(...args) {
		return new Iterable(Iterable.__irange(...args));
	}

	/**
	 * [range description]
	 * @param  {...[type]} args [description]
	 * @return {[type]}         [description]
	 */
	static range(...args) {
		return [...Iterable.__irange(...args)];
	}

	static *__dot(accumulator, iterable) {
		for (const arr of accumulator) {
			yield* iterable.map(v => [...arr, v]);
		}
	}

	static *__iproduct(iterables, repeat = 1) {
		// convert each iterable to array
		const arrays = iterables.map(iterable => [...iterable]);

		// repeat arrays
		let pools = [];
		while (repeat--) {
			pools = [...pools, ...arrays];
		}

		let accumulator = [[]];
		for (const iterable of pools) {
			accumulator = Iterable.__dot(accumulator, iterable);
		}
		yield* accumulator;
	}

	/**
	 * [iproduct description]
	 *
	 * @param  {[type]} iterables [description]
	 * @param  {Number} repeat    [description]
	 * @return {[type]}           [description]
	 */
	static iproduct(iterables, repeat = 1) {
		return new Iterable(Iterable.__iproduct(iterables, repeat));
	}

	/**
	 * [product description]
	 *
	 * @param  {[type]} iterables [description]
	 * @param  {Number} repeat    [description]
	 * @return {[type]}           [description]
	 */
	static product(iterables, repeat = 1) {
		return [...Iterable.__iproduct(iterables, repeat)];
	}

	*__ipermutations(r = undefined) {
		const pool = [...this];
		const n = pool.length;

		r = r || n;
		if (r > n) return;

		let indices = Array.range(n);
		const cycles = Array.range(n, n - r, -1);
		yield indices.slice(0, r).map(i => pool[i]);

		while (n) {
			let i;
			for (i = r - 1; i >= 0; i--) {
				cycles[i] -= 1;
				if (cycles[i] === 0) {
					indices = [...indices.slice(0, i), ...indices.slice(i + 1), indices[i]];
					cycles[i] = n - i;
				} else {
					const j = cycles[i];
					[indices[i], indices[indices.length - j]] = [indices[indices.length - j], indices[i]];
					yield indices.slice(0, r).map(_i => pool[_i]);
					break;
				}
			}
			if (i < 0) {
				break;
			}
		}
	}

	/**
	 * [ipermutations description]
	 * @param  {[type]} r [description]
	 * @return {[type]}   [description]
	 */
	ipermutations(r = undefined) {
		return new Iterable(this.__ipermutations(r));
	}

	/**
	 * [ipermutations description]
	 *
	 * @param  {[type]} iterable [description]
	 * @param  {[type]} r        [description]
	 * @return {[type]}          [description]
	 */
	static ipermutations(iterable, r) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.ipermutations(r);
	}

	/**
	 * [permutations description]
	 * @param  {[type]} r [description]
	 * @return {[type]}   [description]
	 */
	permutations(r = undefined) {
		return [...this.__ipermutations(r)];
	}

	/**
	 * [permutations description]
	 *
	 * @param  {[type]} iterable [description]
	 * @param  {[type]} r        [description]
	 * @return {[type]}          [description]
	 */
	static permutations(iterable, r) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.permutations(r);
	}

	*__icombinations(r = undefined) {
		const pool = [...this];
		const n = pool.length;

		r = r || n;
		if (r > n) return;

		const indices = Array.range(r);
		yield indices.map(i => pool[i]);

		while (true) {
			let i;
			for (i = r - 1; i >= 0; i--) {
				if (indices[i] !== i + n - r) break;
			}
			if (i < 0) break;

			indices[i] += 1;
			for (let j = i + 1; j < r; j++) {
				indices[j] = indices[j - 1] + 1;
			}

			yield indices.map(_i => pool[_i]);
		}
	}

	/**
	 * [icombinations description]
	 * @param  {[type]} r [description]
	 * @return {[type]}   [description]
	 */
	icombinations(r = undefined) {
		return new Iterable(this.__icombinations(r));
	}

	/**
	 * [icombinations description]
	 *
	 * @param  {[type]} iterable [description]
	 * @param  {[type]} r        [description]
	 * @return {[type]}          [description]
	 */
	static icombinations(iterable, r) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.icombinations(r);
	}

	/**
	 * [combinations description]
	 * @param  {[type]} r [description]
	 * @return {[type]}   [description]
	 */
	combinations(r = undefined) {
		return [...this.__icombinations(r)];
	}

	/**
	 * [combinations description]
	 *
	 * @param  {[type]} iterable [description]
	 * @param  {[type]} r        [description]
	 * @return {[type]}          [description]
	 */
	static combinations(iterable, r) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.combinations(r);
	}

	*__itakeWhile(callback) {
		callback = callback || defaultCallback;
		let index = 0;
		for (const v of this) {
			if (!callback(v, index++, this)) break;

			yield v;
		}
	}

	/**
	 * [itakeWhile description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	itakeWhile(callback) {
		return new Iterable(this.__itakeWhile(callback));
	}

	/**
	 * [itakeWhile description]
	 *
	 * @param  {[type]}   iterable [description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	static itakeWhile(iterable, callback) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.itakeWhile(callback);
	}

	/**
	 * [takeWhile description]
	 *
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	takeWhile(callback) {
		return [...this.__itakeWhile(callback)];
	}

	/**
	 * [takeWhile description]
	 *
	 * @param  {[type]}   iterable [description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	static takeWhile(iterable, callback) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.takeWhile(callback);
	}

	*__idropWhile(callback) {
		callback = callback || defaultCallback;

		let start = false;
		let index = 0;
		for (const v of this) {
			if (!start && !callback(v, index++, this)) {
				start = true;
			}

			if (start) yield v;
		}
	}

	/**
	 * [idropWhile description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	idropWhile(callback = undefined) {
		return new Iterable(this.__idropWhile(callback));
	}

	/**
	 * [idropWhile description]
	 *
	 * @param  {[type]}   iterable [description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	static idropWhile(iterable, callback) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.idropWhile(callback);
	}

	/**
	 * [dropWhile description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	dropWhile(callback = undefined) {
		return [...this.__idropWhile(callback)];
	}

	/**
	 * [dropWhile description]
	 *
	 * @param  {[type]}   iterable [description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	static dropWhile(iterable, callback) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.dropWhile(callback);
	}

	/**
	 * find the first item of iterable
	 *
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	find(callback) {
		let index = 0;
		for (const v of this) {
			if (callback(v, index++, this)) {
				return v;
			}
		}
		return undefined;
	}

	/**
	 * find index of the first item of iterable
	 *
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	findIndex(callback) {
		let index = 0;
		for (const v of this) {
			if (callback(v, index, this)) {
				return index;
			}
			index++;
		}
		return -1;
	}

	/**
	 * get first item of iterable
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	first(callback = undefined) {
		return this.find(callback || (v => 1));
	}

	*__ifiler(callback) {
		let index = 0;
		for (const v of this) {
			if (callback(v, index++, this)) {
				yield v;
			}
		}
	}

	/**
	 * [ifilter description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	ifilter(callback) {
		return new Iterable(this.__ifiler(callback));
	}

	/**
	 * [ifilter description]
	 *
	 * @param  {[type]}   iterable [description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	static ifilter(iterable, callback) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.ifilter(callback);
	}

	/**
	 * [filter description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	filter(callback) {
		return [...this.ifilter(callback)];
	}

	/**
	 * [filter description]
	 *
	 * @param  {[type]}   iterable [description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	static filter(iterable, callback) {
		iterable = iterable instanceof Iterable ? iterable : Iterable.from(iterable);

		return iterable.filter(callback);
	}

	/**
	 * [some description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	some(callback) {
		let index = 0;
		for (const v of this) {
			if (callback(v, index++, this)) {
				return true;
			}
		}
	}

	/**
	 * [every description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	every(callback) {
		return !this.some(callback);
	}

	*__islice(begin, end = undefined) {
		if (begin >= end) return;

		let index = 0;
		for (const v of this) {
			if (index++ < begin) continue;
			if ((end || end === 0) && index > end) break;
			yield v;
		}
	}

	/**
	 * [islice description]
	 * @param  {[type]} begin [description]
	 * @param  {[type]} end   [description]
	 * @return {[type]}       [description]
	 */
	islice(begin, end = undefined) {
		return new Iterable(this.__islice(begin, end));
	}

	/**
	 * [slice description]
	 * @param  {[type]} begin [description]
	 * @param  {[type]} end   [description]
	 * @return {[type]}       [description]
	 */
	slice(begin, end = undefined) {
		return [...this.__islice(begin, end)];
	}

	*__isplice(start, deleteCount = undefined, ...items) {
		yield* this.__islice(0, start);
		yield* items;

		let done = false;
		if (deleteCount) {
			while (deleteCount-- && !done) {
				({ done } = this.next());
			}
		}
		if (!done) yield* this;
	}

	/**
	 * [isplice description]
	 * @param  {[type]}    start       [description]
	 * @param  {[type]}    deleteCount [description]
	 * @param  {...[type]} items       [description]
	 * @return {[type]}                [description]
	 */
	isplice(start, deleteCount = undefined, ...items) {
		return new Iterable(this.__isplice(start, deleteCount, ...items));
	}

	/**
	 * [splice description]
	 * @param  {[type]}    start       [description]
	 * @param  {[type]}    deleteCount [description]
	 * @param  {...[type]} items       [description]
	 * @return {[type]}                [description]
	 */
	splice(start, deleteCount = undefined, ...items) {
		return [...this.isplice(start, deleteCount, ...items)];
	}
}

module.exports = Iterable;

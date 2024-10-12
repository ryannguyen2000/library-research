const mongoose = require('mongoose');

// array extension
const Iterable = require('./array.iterable');

Array.Iterable = Iterable;
Array.iterable = Iterable.from;

/**
 * sum all values in iterable
 * @param  {[type]} iterable [description]
 * @return {[type]}          [description]
 */
Array.sum = function (iterable) {
	return Iterable.from(iterable).sum();
};

/**
 * sum all values in array
 * @return {[type]} [description]
 */
Array.prototype.sum = function () {
	return Array.sum(this);
};

/**
 * [avg description]
 * @param  {[type]} iterable [description]
 * @return {[type]}          [description]
 */
Array.avg = function (iterable) {
	return Iterable.from(iterable).avg();
};

/**
 * averange of all values in array
 * @return {[type]} [description]
 */
Array.prototype.avg = function () {
	return Array.avg(this);
};

Array.round_avg = function (iterable) {
	return Iterable.from(iterable).round_avg();
};

/**
 * round averange of all values in array
 * @return {[type]} [description]
 */
Array.prototype.round_avg = function () {
	return Array.round_avg(this);
	// return Math.round(this.avg());
};

/**
 * python itertools.izip
 *
 * @param {...Iterable} iterables     	[description]
 * @yield {Iterable<Array>}    			[description]
 */
Array.izip = Iterable.izip;

/**
 * python build-in zip function.
 * see more: https://docs.python.org/3/library/functions.html#zip
 *
 * @param  {...[type]} rows [description]
 * @return {[type]}         [description]
 */
Array.zip = Iterable.zip;

/**
 * python itertools.chain function
 * @param  {...[type]} iterables [description]
 * @return {[type]}              [description]
 */
Array.ichain = Iterable.ichain;

/**
 * python itertools.chain function to array
 * @param  {...[type]} iterables [description]
 * @return {[type]}              [description]
 */
Array.chain = Iterable.chain;

/**
 * sepeprator iterable to chunks, each chuck have `size` element.
 * note: each chunk is array (not only iterable)
 *
 * @param {[type]} iterable      [description]
 * @param {[type]} size          [description]
 * @yield {[type]} [description]
 */
Array.ichunk = Iterable.ichunk;

/**
 * [chunk description]
 * @type {[type]}
 */
Array.chunk = Iterable.chunk;

/**
 * [chunk description]
 * @param  {[type]} size [description]
 * @return {[type]}      [description]
 */
Array.prototype.chunk = function (size) {
	return Array.chunk(this, size);
};

/**
 * convert pairs of values to dict(object)
 * @param  {[type]} pairs [description]
 * @return {[type]}       [description]
 */
Array.dict = function (pairs) {
	const d = {};
	for (const [key, value] of pairs) {
		d[key] = value;
	}

	return d;
};

Array.prototype.toDict = function (callback) {
	const d = {};
	this.forEach((item, ...args) => {
		const key = callback(item, ...args);
		d[key] = item;
	});
	return d;
};

Array.object = Array.dict;

// map to Object
Object.dict = Array.dict;

/**
 * python build-in irange
 * @param {...[type]} args          [description]
 * @yield {[type]}    [description]
 */
Array.irange = Iterable.irange;

/**
 * python build-in range
 * @param  {...[Number]} args [description]
 * @return {Array}         [description]
 */
Array.range = Iterable.range;

/**
/**
 * python itertools.product
 * @param  {Array<Iterable>} iterables [description]
 * @param  {Number} repeat    [description]
 * @return {Iterable<Array>}           [description]
 */
Array.iproduct = Iterable.iproduct;

/**
 * python itertools.product
 * @param  {Array<Iterable>} 	iterables [description]
 * @param  {Number} repeat    	[description]
 * @return {Array<Array>}      	[description]
 */
Array.product = Iterable.product;

/**
 * [*ipermutations description]
 * @param {[type]} iterable      [description]
 * @param {[type]} r             [description]
 * @yield {[type]} [description]
 */
Array.ipermutations = Iterable.ipermutations;

/**
 * [*ipermutations description]
 * @param {[type]} r             [description]
 * @yield {[type]} [description]
 */
Array.prototype.ipermutations = function (r = undefined) {
	return Array.ipermutations(this, r);
};

/**
 * [permutations description]
 * @param  {[type]} iterable [description]
 * @param  {[type]} r        [description]
 * @return {[type]}          [description]
 */
Array.permutations = Iterable.permutations;

/**
 * [permutations description]
 * @param  {[type]} r [description]
 * @return {[type]}   [description]
 */
Array.prototype.permutations = function (r = undefined) {
	return Array.permutations(this, r);
};

/**
 * [*icombinations description]
 * @param {[type]} iterable      [description]
 * @param {[type]} r             [description]
 * @yield {[type]} [description]
 */
Array.icombinations = Iterable.icombinations;

/**
 * [combinations description]
 * @param  {[type]} iterable [description]
 * @param  {[type]} r        [description]
 * @return {[type]}          [description]
 */
Array.combinations = Iterable.combinations;

/**
 * [*icombinations description]
 * @param {[type]} r             [description]
 * @yield {[type]} [description]
 */
Array.prototype.icombinations = function (r = undefined) {
	return Array.icombinations(this, r);
};

/**
 * [combinations description]
 * @param  {[type]} r [description]
 * @return {[type]}   [description]
 */
Array.prototype.combinations = function (r = undefined) {
	return Array.combinations(this, r);
};

// default callback
const defaultCallback = v => v;

/**
 * [groupBy description]
 * @param  {[type]} iterable [description]
 * @param  {[type]} callback  [description]
 * @return {[type]}          [description]
 */
Array.groupBy = function (iterable, callback = undefined) {
	callback = callback || defaultCallback;
	const groups = {};
	let index = 0;
	for (const it of iterable) {
		const key = callback(it, index++, iterable);
		const group = (groups[key] = groups[key] || []);
		group.push(it);
	}
	return groups;
};

/**
 * [groupBy description]
 * @param  {[type]} callback [description]
 * @return {[type]}         [description]
 */
Array.prototype.groupBy = function (callback = undefined) {
	return Array.groupBy(this, callback);
};

/**
 * lodash countBy at https://lodash.com/docs/4.17.5#countBy
 *
 * @param  {[type]} iterable [description]
 * @param  {[type]} callback  [description]
 * @return {[type]}          [description]
 */
Array.countBy = function (iterable, callback = undefined) {
	callback = callback || defaultCallback;
	const groups = {};
	let index = 0;
	for (const it of iterable) {
		const key = callback(it, index++, iterable);
		groups[key] = groups[key] || 0;
		groups[key]++;
	}
	return groups;
};

/**
 * lodash countBy at https://lodash.com/docs/4.17.5#countBy
 *
 * @param  {[type]} callback [description]
 * @return {[type]}         [description]
 */
Array.prototype.countBy = function (callback = undefined) {
	return Array.countBy(this, callback);
};

/**
 * lodash dropWhile at https://lodash.com/docs/4.17.5#dropWhile
 * @param {[type]} iterable      [description]
 * @param {[type]} callback       [description]
 * @yield {[type]} [description]
 */
Array.idropWhile = Iterable.idropWhile;

/**
 * lodash dropWhile at https://lodash.com/docs/4.17.5#dropWhile
 * @param {[type]} iterable      [description]
 * @param {[type]} callback       [description]
 * @yield {[type]} [description]
 */
Array.dropWhile = Iterable.dropWhile;

/**
 * lodash dropWhile at https://lodash.com/docs/4.17.5#dropWhile
 * @param {[type]} iterable      [description]
 * @param {[type]} callback       [description]
 * @yield {[type]} [description]
 */
Array.prototype.dropWhile = function (callback = undefined) {
	return Array.dropWhile(this, callback);
};

/**
 * lodash takeWhile at https://lodash.com/docs/4.17.5#takeWhile
 * @param {[type]} iterable      [description]
 * @param {[type]} callback       [description]
 * @yield {[type]} [description]
 */
Array.itakeWhile = Iterable.itakeWhile;

/**
 * lodash takeWhile at https://lodash.com/docs/4.17.5#takeWhile
 * @param {[type]} iterable      [description]
 * @param {[type]} callback       [description]
 * @yield {[type]} [description]
 */
Array.takeWhile = Iterable.takeWhile;

/**
 * lodash takeWhile at https://lodash.com/docs/4.17.5#takeWhile
 * @param {[type]} iterable      [description]
 * @param {[type]} callback       [description]
 * @yield {[type]} [description]
 */
Array.prototype.takeWhile = function (callback = undefined) {
	return Array.takeWhile(this, callback);
};

/**
 * [ifilter description]
 * @param  {[type]}   iterable [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Array.ifilter = Iterable.ifilter;

/**
 * [filter description]
 * @param  {[type]}   iterable [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Array.filter = Iterable.filter;

/**
 * get the first item of array
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Array.prototype.first = function (callback = undefined) {
	return this.find(callback || (v => 1));
};

/**
 * get the last item of array
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
Array.prototype.last = function (callback = undefined) {
	callback = callback || (v => 1);

	for (let i = this.length - 1; i >= 0; i--) {
		if (callback(this[i], i, this)) {
			return this[i];
		}
	}
	return undefined;
};

Array.prototype.shuffle = function () {
	const ret = [...this];
	for (let i = ret.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[ret[i], ret[j]] = [ret[j], ret[i]];
	}
	return ret;
};

Array.prototype.asyncForEach = async function (callback) {
	for (let index = 0; index < this.length; index++) {
		// eslint-disable-next-line no-await-in-loop
		await callback(this[index], index, this);
	}
};

Array.prototype.syncMap = async function (callback) {
	const results = [];
	for (let index = 0; index < this.length; index++) {
		// eslint-disable-next-line no-await-in-loop
		const result = await callback(this[index], index);
		results.push(result);
	}
	return results;
};

Array.prototype.asyncMap = function (callback) {
	return Promise.all(this.map(callback));
};

Array.prototype.distinct = function () {
	return this.toGenerator().distinct();
};

Array.prototype.idistinct = function () {
	return this.toGenerator().idistinct();
};

function arrayDiff(oldArray, newArray) {
	const array = oldArray.concat(newArray.filter(value => !oldArray.includes(value)));

	const removed = [];
	const added = [];
	const none = [];

	array.forEach(value => {
		if (oldArray.includes(value)) {
			if (newArray.includes(value)) {
				none.push(value);
			} else {
				removed.push(value);
			}
		} else {
			added.push(value);
		}
	});

	// const removed = array.filter(value => oldArray.includes(value) === true && newArray.includes(value) === false);
	// const added = array.filter(value => oldArray.includes(value) === false && newArray.includes(value) === true);
	// const none = array.filter(value => oldArray.includes(value) === true && newArray.includes(value) === true);

	return [removed, added, none];
}

Array.prototype.diff = function (newArray) {
	return arrayDiff(this, newArray);
};

Array.diff = function (oldArray, newArray) {
	return arrayDiff(oldArray, newArray);
};

//
function arrayFilterNotIn(array1, array2) {
	return array1.filter(v => !array2.includes(v));
}

Array.prototype.filterNotIn = function (array2) {
	return arrayFilterNotIn(this, array2);
};

Array.filterNotIn = function (array1, array2) {
	return arrayFilterNotIn(array1, array2);
};

// filterNotIn
function arrayFilterObjectIdsNotIn(array1, array2) {
	return array1.filter(v1 => !array2.find(v2 => v2.equals(v1)));
}
Array.prototype.filterObjectIdsNotIn = function (array2) {
	return arrayFilterObjectIdsNotIn(this, array2);
};
Array.filterObjectIdsNotIn = function (array1, array2) {
	return arrayFilterObjectIdsNotIn(array1, array2);
};

// arrayFilterIn
function arrayFilterIn(array1, array2) {
	return array1.filter(v => array2.includes(v));
}
Array.prototype.filterIn = function (array2) {
	return arrayFilterIn(this, array2);
};
Array.filterIn = function (array1, array2) {
	return arrayFilterIn(array1, array2);
};

// arrayFilterObjectIdsIn
function arrayFilterObjectIdsIn(array1, array2) {
	return array1.filter(v1 => array2.find(v2 => v2.equals(v1)));
}
Array.prototype.filterObjectIdsIn = function (array2) {
	return arrayFilterObjectIdsIn(this, array2);
};
Array.filterObjectIdsIn = function (array1, array2) {
	return arrayFilterObjectIdsIn(array1, array2);
};

function toMongoObjectIds(arr) {
	return arr.filter(mongoose.Types.ObjectId.isValid).map(mongoose.Types.ObjectId);
}

Array.prototype.toMongoObjectIds = function () {
	return toMongoObjectIds(this);
};
Array.toMongoObjectIds = function (array) {
	return toMongoObjectIds(array);
};

function includesObjectId(arr, id) {
	return arr.find(v => v.equals(id));
}
Array.prototype.includesObjectId = function (id) {
	return includesObjectId(this, id);
};
Array.includesObjectId = function (array, id) {
	return includesObjectId(array, id);
};

function indexOfObjectId(arr, id) {
	return arr.findIndex(v => v.equals(id));
}
Array.prototype.indexOfObjectId = function (id) {
	return indexOfObjectId(this, id);
};
Array.indexOfObjectId = function (array, id) {
	return indexOfObjectId(array, id);
};

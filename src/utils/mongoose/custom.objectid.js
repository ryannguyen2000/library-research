/* eslint-disable prefer-rest-params */
const mongoose = require('mongoose');

const { ObjectId } = mongoose.Types;

String.prototype.equals = function (objectId) {
	return objectId && this.toString() === objectId.toString();
};

const regex = new RegExp('^[0-9a-fA-F]{24}$');

const _indexOf = Array.prototype.indexOf;

function isObjectId(element) {
	return (
		element instanceof ObjectId || //
		(typeof element === 'string' && regex.test(element))
	);
}

/**
 * override `indexOf` for `ObjectId` element
 */
Array.prototype.indexOf = function (element, fromIndex = 0) {
	if (!isObjectId(element)) {
		return _indexOf.apply(this, arguments);
	}

	for (let i = fromIndex; i < this.length; i++) {
		if (isObjectId(this[i]) && this[i].equals(element)) return i;
	}

	return -1;
};

const _includes = Array.prototype.includes;
/**
 * override `includes` for `ObjectId` element
 */
Array.prototype.includes = function (element, fromIndex = 0) {
	if (!isObjectId(element)) {
		return _includes.apply(this, arguments);
	}

	return this.indexOf(element, fromIndex) !== -1;
};

Array.prototype.contains = Array.prototype.includes;

module.exports = ObjectId;

// function test() {
// 	let a = [1, 2, 3, 4, 5].map(() => new ObjectId());
// 	let x = new ObjectId(a[2]);

// 	console.log(a[2].equals(x));
// 	console.log(a.indexOf(x));
// }

// test();

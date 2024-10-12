const moment = require('moment');
const _ = require('lodash');
const ThrowReturn = require('@core/throwreturn');

const CLASSES = {
	DateTime: { Format: 'YYYY-MM-DD HH:mm:mm' },
	Date: { Format: 'YYYY-MM-DD' },
	Time: { Format: 'HH:mm:mm' },
};

const CLASS_LENGTHS = _.chain(CLASSES)
	.values()
	.keyBy(_Class => _Class.Format.length)
	.value();

for (let [_Name, _Class] of _.entries(CLASSES)) {
	_Class.now = () => moment().format(_Class.Format);

	/**
	 * Get range date or datetime from to
	 *
	 * @param {} from (includes)
	 * @param {} to (not includes)
	 */
	_Class.range = function* (from, to, options) {
		from = from[`to${_Name}`]();
		to = to[`to${_Name}`]();

		// prettier-ignore
		if (!options) 
            options = { value: from < to ? 1 : -1, unit: 'days' };

		// prettier-ignore
		options =
            (!_.isNaN(options) && { value: options, unit: 'days' })  // number
            || (_.isArray(options) && { value: options[0], unit: options[1] }) // array
            || options; // object

		let { value = 1, unit = 'days' } = options;
		if (!value) {
			throw new ThrowReturn('`value` must be non-zero');
		}

		if ((value > 0 && from > to) || (value < 0 && from < to)) {
			throw new ThrowReturn(`Infinity loop detection with {from:\`${from}\`, to:\`${to}}\`, value:${value}}`);
		}

		while ((value > 0 && from < to) || (value < 0 && from > to)) {
			yield from;
			from = from.add(value, unit);
		}
	};
	_Class.rangeArray = (from, to) => [..._Class.range(from, to)];
}

_.assign(String, CLASSES);

String.prototype.add = function (value, unit) {
	let _Class = CLASS_LENGTHS[this.length];
	return moment(this.toString()).add(value, unit).format(_Class.Format);
};

String.prototype.subtract = function (value, unit) {
	let _Class = CLASS_LENGTHS[this.length];
	return moment(this.toString()).subtract(value, unit).format(_Class.Format);
};

String.prototype.addDays = function (value) {
	return this.add(value, 'days');
};

String.prototype.subtractDays = function (value) {
	return this.subtract(value, 'days');
};

String.prototype.tomorrow = function () {
	return this.addDays(1);
};

String.prototype.yesterday = function () {
	return this.subtractDays(1);
};

String.prototype.toDate = function () {
	return this.slice(0, String.Date.Format.length);
};

String.prototype.toTime = function () {
	return this.slice(String.DateTime.Format.length - String.Time.Format.length);
};

String.prototype.toDateTime = function () {
	return moment(this.toString()).format(String.DateTime.Format);
};

// Date.prototype.toDate = function() {
// 	return moment(this).format(String.Date.Format);
// };

// Date.prototype.toTime = function() {
// 	return moment(this).format(String.Time.Format);
// };

// Date.prototype.toDateTime = function() {
// 	return moment(this).format(String.DateTime.Format);
// };

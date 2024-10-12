const _ = require('lodash');

const Operators = ['$and', '$or', '$in', '$nor'];

function isPureObject(obj) {
	return obj && obj.constructor.toString().startsWith('function Object()');
}

const canReduce = t => t === undefined || (isPureObject(t) && _.isEmpty(t));

function op(query, operator) {
	if (!_.isArray(query)) return query;

	if (query.length === 0) return {};
	if (query.length === 1) return query[0];
	return { [operator]: query };
}

function optimize(query) {
	// normalize array
	if (_.isArray(query))
		return query
			.map(v => optimize(v)) //
			.filter(v => !canReduce(v));

	// normalize object
	if (isPureObject(query)) {
		query = _.chain(query)
			.entries()
			.map(([k, v]) => [k, optimize(v)])
			.filter(([k, v]) => !canReduce(v))
			.fromPairs()
			.value();

		let values = [];
		for (let [k, v] of _.entries(query)) {
			if (Operators.includes(k)) {
				let value = op(v, k);
				delete query[k];
				if (value) {
					values.push(value);
				}
			}
		}
		if (_.keys(query).length + values.length > 1) {
			query = _.assign(query, ...values);
		} else if (values.length) {
			query = _.head(values);
		}
		// rút gọn các operator cho array
		// if (keys.length == 1 && Operators.includes(keys[0])) return op(query[keys[0]], keys[0]);
	}
	return query;
}

const FUNCTION_NAMES = [
	'remove',
	'deleteOne',
	'deleteMany',
	'find',
	'findById',
	'findOne',
	'count',
	'countDocuments',
	'where',
	'$where',
	'findOneAndUpdate',
	'findByIdAndUpdate',
	'findOneAndDelete',
	'findByIdAndDelete',
	'findOneAndReplace',
	'findOneAndRemove',
	'findByIdAndRemove',
	'create',
	'insertMany',
	'bulkWrite',
	'update',
	'updateMany',
	'updateOne',
	'replaceOne',
	'aggregate',
];

function applyOptimize(model) {
	for (const name of FUNCTION_NAMES) {
		const f = model[name];
		model[name] = function (...args) {
			args = args.map(arg => (_.isArray(arg) || isPureObject(arg) ? optimize(arg) : arg));
			return f.call(model, ...args);
		};
	}
	return model;
}

module.exports = {
	applyOptimize,
	optimize,
};

// let query = {
// 	error: 0,
// 	status: { $in: ['confirmed'] },
// 	$or: [{ blockId: '5dfc5c0f9a63f518e0b1e449' }, { listingId: { $in: [] } }],
// 	from: { $lte: new Date('2020-04-30T00:00:00.000Z') },
// 	to: { $gt: new Date('2020-03-31T00:00:00.000Z') },
// };

// query = {
// 	status: { $in: ['confirmed'] },
// };

// query = { $or: [{ blockId: '5dfc5c0f9a63f518e0b1e449' }, { listingId: { $in: [] } }], error: 0 };

// console.log(op([{ blockId: '5dfc5c0f9a63f518e0b1e449' }], '$or'));
// // let date = new Date('2020-04-30T00:00:00.000Z');
// // console.log(canReduce(date));

// // console.log(_.isObject(date) && _.isEmpty(date));
// // query = { $lte: new Date('2020-04-30T00:00:00.000Z') };

// let oQuery = optimize(query);
// console.log(oQuery);

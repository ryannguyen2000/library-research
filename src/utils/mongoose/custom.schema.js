const mongoose = require('mongoose');

// function as class
function _Ref(options) {
	let { ref, ...newOptions } = options;
	let model = typeof ref !== 'string' ? ref : undefined;
	ref = typeof ref !== 'string' ? ref.modelName : ref;
	const validate = {
		validator: async _id => {
			if (_id === null || _id === undefined) return true;

			let obj = await (model || mongoose.model(ref)).findById(_id).select('_id');
			return !!obj;
		},
		message: `'${ref}' document is not exists`,
	};

	return {
		ref,
		type: mongoose.Schema.Types.ObjectId,
		validate,
		...newOptions,
	};
}

function Ref(options) {
	return _Ref(options);
}

const _Schema = mongoose.Schema;

function Schema(definition, ...args) {
	let schema = new _Schema(definition, ...args);

	Object.entries(definition).forEach(([k, v]) => {
		if (
			// v instanceof _Ref &&
			v.virtual
		) {
			schema.virtual(v.virtual, {
				ref: v.ref,
				localField: k,
				foreignField: '_id',
				justOne: true,
			});

			// pascal case
			let Virtual = v.virtual.replace(/^(.)/, c => c.toUpperCase());

			// write get object for this schema
			schema.methods[`get${Virtual}`] = function (query = {}) {
				query._id = this[k];

				let refModel = v.ref instanceof mongoose.Model ? v.ref : mongoose.model(v.ref);

				return refModel.findOne(query);
			};
		}
	});
	return schema;
}

Object.assign(Schema, _Schema);

module.exports = { Schema, Ref };

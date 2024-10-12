const _ = require('lodash');
const ThrowReturn = require('@core/throwreturn');

async function create(req, res, cfg) {
	if (cfg.module.create) {
		return await cfg.module.create(req, res);
	}

	let objectInfo = req.body[cfg.name];
	let object = await cfg.Model.create(objectInfo);

	return res.sendData({ [cfg.name]: object });
}

async function modify(req, res, cfg) {
	if (cfg.module.modify) {
		return await cfg.module.modify(req, res);
	}

	req.body[cfg.name]._id = req.params.id;
	let objectInfo = req.body[cfg.name];

	let object = await cfg.Model.findById(objectInfo._id);
	if (!object) {
		throw new ThrowReturn(`${cfg.name} id ${objectInfo._id} not found`);
	}
	Object.assign(object, objectInfo);
	object = await object.save();

	res.sendData({ [cfg.name]: _.pick(object, _.keys(objectInfo)) });
}

async function list(req, res, cfg) {
	if (cfg.module.list) {
		return await cfg.module.list(req, res);
	}
	let { start, limit, ...query } = _.pickBy(req.query);

	let promise = cfg.Model.find(query);
	if (start && !cfg.skipPaniagation) {
		promise = promise.skip(parseInt(start));
	}
	if (limit && !cfg.skipPaniagation) {
		promise = promise.limit(parseInt(limit));
	}
	let objs = await promise.sort({ _id: -1 }).lean();
	let total = await cfg.Model.countDocuments(query);

	res.sendData({ [`${cfg.name}s`]: objs, total });
}

async function view(req, res, cfg) {
	if (cfg.module.view) {
		return await cfg.module.view(req, res);
	}

	let { id } = req.params || req.query;
	let object = await cfg.Model.findById(id).lean();
	if (!object) {
		throw new ThrowReturn('Không tìm thấy Object này');
	}
	res.sendData({ [cfg.name]: object });
}

async function del(req, res, cfg) {
	if (cfg.module.del) {
		return await cfg.module.del(req, res);
	}

	let { id } = req.params;
	let object = await cfg.Model.deleteOne({ _id: id });
	if (!object) {
		throw new ThrowReturn('Không tìm thấy Object này');
	}
	res.sendData({ [cfg.name]: object });
}

module.exports = { create, list, view, modify, del };

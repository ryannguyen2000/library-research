const ThrowReturn = require('@core/throwreturn');

function get(model) {
	return async (req, res) => {
		const data = await model.find().lean();
		res.sendData({ data });
	};
}

function create(model) {
	return async (req, res) => {
		req.body.createdBy = req.decoded.user._id;
		const data = await model.create(req.body);
		res.sendData({ data });
	};
}

function update(model) {
	return async (req, res) => {
		const { id } = req.params;
		const data = await model.findById(id);
		if (!data) throw new ThrowReturn('Not Found!');

		Object.assign(data, req.body);
		await data.save();

		res.sendData({ data });
	};
}

function del(model, afterDelete) {
	return async (req, res) => {
		const { id } = req.params;
		const data = await model.findByIdAndDelete(id);
		if (data && typeof afterDelete === 'function') {
			await afterDelete(data);
		}
		res.sendData();
	};
}

module.exports = {
	get,
	create,
	update,
	del,
};

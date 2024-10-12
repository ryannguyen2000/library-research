const _ = require('lodash');
const models = require('@models');

async function get(req, res) {
	const provinceId = parseInt(req.query.provinceId);

	const districts = provinceId ? await models.District.find({ provinceId }).lean() : [];

	res.sendData({ districts });
}

async function update(req, res) {
	const { id } = req.params;

	const district = await models.District.findByIdAndUpdate(id, _.pick(req.body, ['location', 'name']));

	res.sendData({ district });
}

module.exports = {
	get,
	update,
};

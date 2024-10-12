const _ = require('lodash');
const models = require('@models');

async function get(req, res) {
	const provinces = await models.Province.find().lean();

	res.sendData({ provinces });
}

async function update(req, res) {
	const { id } = req.params;

	const province = await models.Province.findByIdAndUpdate(id, _.pick(req.body, ['location', 'name']));

	res.sendData({ province });
}

module.exports = {
	get,
	update,
};

const _ = require('lodash');
const models = require('@models');

async function get(req, res) {
	const districtId = parseInt(req.query.districtId);

	const wards = districtId ? await models.Ward.find({ districtId }) : [];

	res.sendData({ wards });
}

async function update(req, res) {
	const { id } = req.params;

	const ward = await models.Ward.findByIdAndUpdate(id, _.pick(req.body, ['location', 'name']));

	res.sendData({ ward });
}

module.exports = {
	get,
	update,
};

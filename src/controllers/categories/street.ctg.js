const models = require('@models');

const get = async (req, res) => {
	const districtId = parseInt(req.query.districtId);

	const streets = districtId ? await models.Street.find({ districtId }).lean() : [];

	res.sendData({ streets });
};

module.exports = {
	get,
};

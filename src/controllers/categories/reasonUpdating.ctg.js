const models = require('@models');

async function get(req, res) {
	const filter = { parentId: null };

	if (req.query.type) {
		filter.type = req.query.type;
	}

	const reasons = await models.ReasonUpdating.find(filter).populate('childrens').sort({ order: -1, _id: -1 });

	res.sendData({ reasons });
}

module.exports = {
	get,
};

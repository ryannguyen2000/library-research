const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

async function list(req, res) {
	const { start = 0, limit = 20, timeStart, timeEnd, ...query } = req.query;

	if (timeStart) query['configs.timeStart'] = { $gte: new Date(timeStart) };
	if (timeEnd) query['configs.timeEnd'] = { $gte: new Date(timeEnd) };

	const promise = models.KPI.find(query)
		.populate('createdBy', 'name username')
		.sort({ $natural: -1 })
		.skip(parseInt(start))
		.limit(parseInt(limit));

	const data = await promise;
	const total = await models.KPI.countDocuments(query);

	return res.sendData({ KPIs: data, total });
}

async function create(req, res) {
	const data = req.body;
	data.createdBy = req.decoded.user._id;

	const KPI = await models.KPI.create(data);

	res.sendData({ KPI });
}

async function modify(req, res) {
	const { id } = req.params;

	const KPI = await models.KPI.findById(id);
	if (!KPI) throw new ThrowReturn('Không tồn tại!');

	Object.assign(KPI, req.body);

	await KPI.save();

	res.sendData({ KPI });
}

async function view(req, res) {
	const { id } = req.params;

	const KPI = await models.KPI.findById(id).populate('createdBy', 'username name');

	return res.sendData({ KPI });
}

async function del(req, res) {
	const { id } = req.params;

	const data = await models.KPIUser.findOne({ KPIId: id }).select('_id');
	if (data) {
		throw new ThrowReturn('Nhiệm vụ đã được nhận, không thể xóa!');
	}

	await models.KPI.findByIdAndDelete(id);

	res.sendData();
}

async function getTypes(req, res) {
	const { type } = req.query;
	const data = {};
	if (type === 'review') {
		data.airbnb = ['accuracy', 'checkin', 'cleanliness', 'communication', 'location', 'value'];
		data.booking = ['staff', 'cleanliness', 'location', 'comfort', 'value', 'services'];
		data.traveloka = ['cleanliness', 'comfort', 'location', 'service', 'food'];
		data.agoda = [];
	}

	res.sendData(data);
}

module.exports = { view, modify, del, list, create, getTypes };

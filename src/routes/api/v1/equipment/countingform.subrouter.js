const _ = require('lodash');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

// Form sử dụng là form nào
const FormModel = models.EquipmentCountingForm;

// tạo form kiểm đếm
async function create(req, res) {
	let formInfo = req.body.form;
	let userId = req.decoded.user._id;

	let form = await FormModel.create({ ...formInfo, createdBy: userId });

	return res.sendData({ form });
}

async function modify(req, res) {
	let formInfo = req.body.form;

	let form = await FormModel.findById(formInfo._id);
	if (!form || form.isApproved()) {
		throw new ThrowReturn('Form không tìm thấy hoặc đã duyệt rồi');
	}

	Object.assign(form, formInfo);

	await form.save();

	return res.sendData({ form: _.pick(form, _.keys(formInfo)) });
}

// duyệt kiểm đếm kho vật tư
async function approve(req, res) {
	let formInfo = req.body.form;
	let userId = req.decoded.user._id;

	let form = await FormModel.findById(formInfo._id);
	if (!form || form.isApproved()) {
		throw new ThrowReturn('Form không tìm thấy hoặc đã duyệt rồi');
	}

	const groups = _.groupBy(form.equipments, e => e.storeId.toString());

	await Object.keys(groups).asyncForEach(async storeId => {
		let store = await models.EquipmentStore.findById(storeId);
		if (!store) {
			throw new ThrowReturn(`Không tìm thấy kho hàng ${storeId}`);
		}
		store = await store.setEquipmentsAsync(groups[storeId].reduce((a, c) => [...a, c.equipments], []));
	});

	form = await form.setApproveAsync(userId);

	return res.sendData({ form: _.pick(form, ['approved']) });
}

async function list(req, res) {
	const { start, limit, ...query } = req.query;
	const promise = FormModel.find(query).select('-equipments');

	if (start) promise.skip(parseInt(start));
	if (limit) promise.limit(parseInt(limit));

	promise.populate('createdBy', 'username name').populate('storeId', 'name');

	const forms = await promise;

	return res.sendData({ forms });
}

async function view(req, res) {
	const { id } = req.params;

	const form = await FormModel.findById(id)
		.populate('createdBy', 'username name')
		.populate('approved.userId', 'username name');

	return res.sendData({ form });
}

module.exports = { view, list, create, modify, approve };

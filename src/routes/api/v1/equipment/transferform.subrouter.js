const _ = require('lodash');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

// Form sử dụng là form nào
const FormModel = models.EquipmentTransferForm;

// tạo form chuyển vật tư
async function create(req, res) {
	let formInfo = req.body.form;
	let userId = req.decoded.user._id;

	let fromStore = await models.EquipmentStore.findById(formInfo.fromStoreId);
	let toStore = await models.EquipmentStore.findById(formInfo.toStoreId);
	if (!fromStore || !toStore) {
		throw new ThrowReturn('Không tìm thấy kho hàng');
	}
	fromStore.substractAvailable(formInfo.equipments);

	formInfo.actionAt = formInfo.actionAt || String.Date.now();

	// chỉ lấy YYYY-MM là 7 ký tự
	formInfo.forMonth = formInfo.actionAt.slice(0, 7);
	let form = await FormModel.create({ ...formInfo, createdBy: userId });

	return res.sendData({ form });
}

// sửa đổi form chuyển vật tư
async function modify(req, res) {
	let formInfo = req.body.form;
	let userId = req.decoded.user._id;

	let form = await FormModel.findById(formInfo._id);
	if (!form || form.isApproved()) {
		throw new ThrowReturn('Form không tìm thấy hoặc đã duyệt rồi');
	}
	Object.assign(form, formInfo, { createdBy: userId });

	let fromStore = await models.EquipmentStore.findById(form.fromStoreId);
	let toStore = await models.EquipmentStore.findById(form.toStoreId);
	if (!fromStore || !toStore) {
		throw new ThrowReturn('Không tìm thấy kho hàng');
	}

	fromStore.substractAvailable(form.equipments);

	form.actionAt = form.actionAt || String.Date.now();

	// chỉ lấy YYYY-MM là 7 ký tự
	form.forMonth = form.actionAt.slice(0, 7);
	await form.save();

	return res.sendData({ form: _.pick(form, _.keys(formInfo)) });
}

// duyệt chuyển vật tư từ kho này sang kho khác
async function approve(req, res) {
	let formInfo = req.body.form;
	let userId = req.decoded.user._id;

	let form = await models.EquipmentTransferForm.findById(formInfo._id);
	if (!form || form.isApproved()) {
		throw new ThrowReturn('Form không tìm thấy hoặc đã duyệt rồi');
	}

	let fromStore = await models.EquipmentStore.findById(form.fromStoreId);
	let toStore = await models.EquipmentStore.findById(form.toStoreId);

	if (!fromStore || !toStore) {
		throw new ThrowReturn('Không tìm thấy kho hàng');
	}

	let { from, to } = await fromStore.transferEquipmentsAsync(form.equipments, toStore);
	form = await form.setApproveAsync(userId);
	return res.sendData({ from, to });
}

async function list(req, res) {
	const { start = 0, limit = 10, ...query } = req.query;
	const forms = await FormModel.find(query)
		.select('-equipments')
		.skip(parseInt(start))
		.limit(parseInt(limit))
		.populate('createdBy', 'username name')
		.populate('fromStoreId', 'name')
		.populate('toStoreId', 'name');

	return res.sendData({ forms });
}

async function view(req, res) {
	const { id } = req.params;

	const form = await FormModel.findById(id)
		.populate('createdBy', 'username name')
		.populate('approved.userId', 'username name');

	return res.sendData({ form });
}

module.exports = { create, modify, approve, list, view };

/**
 * 2020-03-30: Không dùng api buyform nữa. Chỉ quản từ phần nhập vào kho trở đi
 */
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

// Form sử dụng là form nào
const FormModel = models.EquipmentBuyForm;

// tạo form mua hàng
async function create(req, res) {
	let formInfo = req.body.form;
	let userId = req.decoded.user._id;
	let { requestIds = [] } = formInfo;

	let requestForms = await models.EquipmentRequestForm.find({ _id: { $in: requestIds } });

	let notFindIds = requestIds.filter(id => requestForms.every(form => form._id.toString() !== id));

	if (notFindIds.length > 0) {
		throw new ThrowReturn(`Không tìm thấy các form yêu cầu ${notFindIds.join(',')}`);
	}

	let form = await FormModel.create({ ...formInfo, createdBy: userId });

	return res.sendData({ form });
}

// sửa form mua hàng vật tư
async function modify(req, res) {
	let formInfo = req.body.form;
	let userId = req.decoded.user._id;

	let form = await FormModel.findById(formInfo._id);

	if (!form || form.isApproved()) {
		throw new ThrowReturn('Form không tìm thấy hoặc đã duyệt rồi');
	}

	let { requestIds = [] } = formInfo;

	let requestForms = await models.EquipmentRequestForm.find({ _id: { $in: requestIds } });
	let notFindIds = requestIds.filter(id => requestForms.every(f => f._id.toString() !== id));
	if (notFindIds.length > 0) {
		throw new ThrowReturn(`Không tìm thấy các yêu cầu ${notFindIds.join(',')}`);
	}

	Object.assign(form, formInfo, { createdBy: userId });
	form = await form.save();
	return res.sendData({ form });
}

// duyệt form mua vật tư
async function approve(req, res) {
	let formInfo = req.body.form;
	let userId = req.decoded.user._id;

	let form = await FormModel.findById(formInfo._id);

	if (!form || form.isApproved()) {
		throw new ThrowReturn('Form không tìm thấy hoặc đã duyệt rồi');
	}

	let buyStore = await models.EquipmentStore.getBuyStore();
	buyStore = await buyStore.addEquipmentsAsync(form.equipments);

	form = await form.setApproveAsync(userId);
	return res.sendData({ form, buy: buyStore });
}

module.exports = { create, modify, approve };

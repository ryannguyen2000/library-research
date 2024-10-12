const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

// Form sử dụng là form nào
const FormModel = models.EquipmentRequestForm;

// tạo form yêu cầu mua vật tư từng nhà
async function create(req, res) {
	let userId = req.decoded.user._id;
	let formInfo = req.body.form;

	let form = await FormModel.create({ ...formInfo, createdBy: userId });

	return res.sendData({ form });
}

// sửa form yêu cầu mua vật tư từng nhà
async function modify(req, res) {
	let userId = req.decoded.user._id;
	let formInfo = req.body.form;

	let form = await FormModel.findById(formInfo._id);

	if (!form || form.isApproved()) {
		throw new ThrowReturn('Form không tìm thấy hoặc đã duyệt rồi');
	}

	Object.assign(form, formInfo, { createdBy: userId });
	form = await form.save();
	return res.sendData({ form: _.pick(form, _.keys(formInfo)) });
}

// duyệt form yêu cầu mua vật tư từng nhà
async function approve(req, res) {
	let formInfo = req.body.form;

	let userId = req.decoded.user._id;

	let form = await FormModel.findById(formInfo._id);

	if (!form || form.isApproved()) {
		throw new ThrowReturn('Form không tìm thấy hoặc đã duyệt rồi');
	}

	form = await form.setApproveAsync(userId);
	return res.sendData({ form: { approved: form.approved } });
}

async function list(req, res) {
	const { start, limit, ...query } = req.query;
	const promiseForms = FormModel.find(query);

	if (start) {
		promiseForms.skip(parseInt(start));
	}
	if (limit) {
		promiseForms.limit(parseInt(limit));
	}

	promiseForms.populate('createdBy', 'username name');

	const forms = await promiseForms;
	const total = await FormModel.countDocuments(query);

	return res.sendData({ forms, total });
}

async function view(req, res) {
	const { id } = req.params;

	const form = await FormModel.findById(id)
		.populate('createdBy', 'username name')
		.populate('approved.userId', 'username name');

	return res.sendData({ form });
}

module.exports = { create, modify, approve, list, view };

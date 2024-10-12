const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

async function getRegisterConfigs(req, res) {
	const configs = await models.GuestRegistrationConfig.find({ blockId: req.params.blockId }).lean();
	res.sendData({ configs });
}

async function createRegisterConfig(req, res) {
	const config = await models.GuestRegistrationConfig.create({
		...req.body,
		blockId: req.params.blockId,
		createdBy: req.decoded.user._id,
	});
	res.sendData({ config });
}

async function updateRegisterConfig(req, res) {
	const config = await models.GuestRegistrationConfig.findByIdAndUpdate(req.params.id, req.body, { new: true });
	if (!config) throw new ThrowReturn('Config not found!', req.params.id);

	res.sendData({ config });
}

async function deleteRegisterConfig(req, res) {
	const config = await models.GuestRegistrationConfig.findByIdAndDelete(req.params.id);
	if (!config) throw new ThrowReturn('Config not found!', req.params.id);

	res.sendData();
}

module.exports = {
	getRegisterConfigs,
	createRegisterConfig,
	updateRegisterConfig,
	deleteRegisterConfig,
};

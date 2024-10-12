const { AutoEvents, MessageVariable } = require('@utils/const');
const router = require('@core/router').Router();
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

async function getListingChatAuto(req, res) {
	const { listingId, otaName } = req.params;

	const templates = await models.ChatAutomatic.list(listingId, otaName);
	res.sendData({ templates, events: Object.values(AutoEvents), variables: MessageVariable });
}

async function addCustomAuto(req, res) {
	const { listingId, otaName } = req.params;
	const listing = await models.Listing.findById(listingId);
	if (!listing || !listing.getOTA(otaName)) {
		throw new ThrowReturn('Listing not found');
	}
	const template = await models.ChatAutomatic.customTemplate(listing._id, otaName, req.body);
	res.sendData({ template });
}

async function updateCustomAuto(req, res) {
	const { autoId } = req.params;

	const template = await models.ChatAutomatic.updateTemplate(autoId, req.body);
	res.sendData({ template });
}

async function activeAllTemplate(req, res) {
	const { listingId, otaName } = req.params;
	const { active = true } = req.body;

	await models.ChatAutomatic.activeAllTemplates(listingId, otaName, active);
	res.sendData();
}

async function activeTemplate(req, res) {
	const { listingId, otaName, autoId } = req.params;
	const { active = true } = req.body;

	await models.ChatAutomatic.activeTemplate(autoId, listingId, otaName, active);
	res.sendData();
}

async function reInit(req, res) {
	await require('@automation/message').initJob();

	res.sendData();
}

router.putS('/message/reInit', reInit, true);
router.putS('/message/:autoId', updateCustomAuto, true);
router.getS('/message/:listingId/:otaName', getListingChatAuto, true);
router.postS('/message/:listingId/:otaName', addCustomAuto, true);
router.postS('/message/active/:listingId/:otaName', activeAllTemplate, true);
router.postS('/message/active/:listingId/:otaName/:autoId', activeTemplate, true);

module.exports = { router };

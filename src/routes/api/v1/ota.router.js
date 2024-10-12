const mongosee = require('mongoose');
const _ = require('lodash');
const moment = require('moment');

const ThrowReturn = require('@core/throwreturn');
const router = require('@core/router').Router();
const models = require('@models');
const { updateOTAConfig } = require('@controllers/ota_helper');

async function otaList(req, res) {
	const otas = await models.OTAManager.find({ groupIds: { $in: req.decoded.user.groupIds } });

	res.sendData({ otas: otas.groupBy(o => o.account) });
}

async function getAccounts(req, res) {
	const otas = await models.OTAManager.find({ active: true, groupIds: { $in: req.decoded.user.groupIds } }).select(
		'account'
	);
	const accounts = _.uniq(otas.map(o => o.account));

	res.sendData({ accounts });
}

async function addOTA(req, res) {
	const ota = new models.OTAManager({ ...req.body, groupIds: req.decoded.user.groupIds });
	const error = ota.validateSync();
	if (error) {
		throw new ThrowReturn(error);
	}

	// save new ota
	await ota.save();

	updateOTAConfig(ota);

	res.sendData({ ota });
}

async function updateOTA(req, res) {
	const { otaId } = req.params;
	if (!mongosee.Types.ObjectId.isValid(otaId)) {
		throw new ThrowReturn(`Id ${otaId} is invalid`);
	}

	// don't update account
	delete req.body.account;
	delete req.body.groupIds;
	const ota = await models.OTAManager.findOneAndUpdate(
		{ _id: otaId, groupIds: { $in: req.decoded.user.groupIds } },
		req.body,
		{
			new: true,
			runValidators: true,
		}
	);

	updateOTAConfig(ota);

	res.sendData({ ota });
}

async function getDebugerApiOTA(req, res) {
	let { start, limit, from, to, ota, receiving, uniqId } = req.query;
	start = parseInt(start) || 0;
	limit = parseInt(limit) || 10;
	const query = {};

	if (ota) query.from = ota;
	if (uniqId) {
		query['response.uniqId'] = uniqId;
	}

	if (receiving) query.receiving = true;

	if (from && moment(from).isValid()) {
		_.set(query, 'createdAt.$gte', moment(from).toDate());
	}
	if (to && moment(to).isValid()) {
		_.set(query, 'createdAt.$lte', moment(to).toDate());
	}
	const [data, total] = await Promise.all([
		models.APIDebugger.find(_.pickBy(query))
			.select('-headers -response.headers -data.otaConfig')
			.skip(start)
			.limit(limit)
			.sort({ createdAt: -1 })
			.lean(),
		models.APIDebugger.countDocuments(query),
	]);

	res.sendData({ data, total });
}

router.getS('/account', getAccounts, true);
router.getS('/', otaList, true);
router.postS('/', addOTA, true);
router.putS('/:otaId', updateOTA, true);

router.getS('/debugger-api', getDebugerApiOTA, true);

const activity = {
	OTA_CREATE: {
		key: '/',
		method: 'POST',
	},
	OTA_UPDATE: {
		key: '/{id}',
		method: 'PUT',
	},
};

module.exports = { router, activity };

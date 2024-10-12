const _ = require('lodash');
const router = require('@core/router').Router();
const Handeover = require('@controllers/working/handover');

async function checkForHandover(req, res) {
	const data = await Handeover.checkForHandover(req.decoded.user, { ...req.query, ...req.body, ...req.data });
	res.sendData(data);
}

async function acceptHandover(req, res) {
	const data = await Handeover.acceptHandover(req.decoded.user, req.params.id, req.body);
	if (data && data.data && data.data.blockId) {
		_.set(req, ['logData', 'blockId'], data.data.blockId);
	}

	res.sendData(data);
}

async function requestHandover(req, res) {
	const data = await Handeover.requestHandover(req.decoded.user, req.params.id, req.body);
	if (data && data.data && data.data.blockId) {
		_.set(req, ['logData', 'blockId'], data.data.blockId);
	}

	res.sendData(data);
}

async function getHandovers(req, res) {
	const data = await Handeover.getHandovers(req.decoded.user, req.query);
	res.sendData(data);
}

async function getHandover(req, res) {
	const data = await Handeover.getHandover(req.decoded.user, req.params.id);
	res.sendData(data);
}

async function getCashiers(req, res) {
	const data = await Handeover.getCashiers(req.decoded.user, { ...req.query, ...req.data });
	res.sendData(data);
}

async function createCurrencyExchange(req, res) {
	const data = await Handeover.createCurrencyExchange(req.decoded.user, req.body);
	res.sendData(data);
}

async function updateCurrencyExchange(req, res) {
	const data = await Handeover.updateCurrencyExchange(req.decoded.user, req.params.id, req.body);
	res.sendData(data);
}

async function deleteCurrencyExchange(req, res) {
	const data = await Handeover.deleteCurrencyExchange(req.decoded.user, req.params.id);
	res.sendData(data);
}

router.getS('/handover', getHandovers);
router.getS('/handover/:id', getHandover);
router.getS('/cashier', getCashiers);

router.postS('/handover/check', checkForHandover);
router.postS('/handover/:id/start', acceptHandover);
router.postS('/handover/:id/end', requestHandover);

router.postS('/handover/currencyExchange', createCurrencyExchange);
router.putS('/handover/currencyExchange/:id', updateCurrencyExchange);
router.deleteS('/handover/currencyExchange/:id', deleteCurrencyExchange);

const activity = {
	WORKING_HANDOVER_START: {
		key: '/handover/{id}/start',
		exact: true,
		method: 'POST',
	},
	WORKING_HANDOVER_END: {
		key: '/handover/{id}/end',
		exact: true,
		method: 'POST',
	},
	CASHIER_ADD_CURRENCY_EXCHANGE: {
		key: '/handover/currencyExchange',
		method: 'POST',
	},
	CASHIER_EDIT_CURRENCY_EXCHANGE: {
		key: '/handover/currencyExchange/{id}',
		exact: true,
		method: 'PUT',
	},
	CASHIER_REMOVE_CURRENCY_EXCHANGE: {
		key: '/handover/currencyExchange/{id}',
		exact: true,
		method: 'DELETE',
	},
};

module.exports = { router, activity };

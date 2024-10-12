const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const router = require('@core/router').Router();
const models = require('@models');
const restful = require('@routes/restful.base');

// short name only
models.EquipmentWareHouse = models.EquipmentStore.EquipmentWareHouse;
models.EquipmentBlockStore = models.EquipmentStore.EquipmentBlockStore;
models.EquipmentBuy = models.EquipmentStore.EquipmentBuy;

// short name only
models.EquipmentRequestForm = models.EquipmentForm.EquipmentRequestForm;
models.EquipmentBuyForm = models.EquipmentForm.EquipmentBuyForm;
models.EquipmentImportForm = models.EquipmentForm.EquipmentImportForm;
models.EquipmentTransferForm = models.EquipmentForm.EquipmentTransferForm;
models.EquipmentCountingForm = models.EquipmentForm.EquipmentCountingForm;

// sub-routers
const SubRouters = {
	equipment_type: {
		module: {},
		name: 'equipment_type',
		Model: models.EquipmentType,
	},
	store: {
		module: require('./store.subrouter'),
		name: 'store',
		Model: models.EquipmentStore,
	},
	countingform: {
		module: require('./countingform.subrouter'),
		name: 'form',
		Model: models.EquipmentCountingForm,
	},
	buyform: {
		module: require('./buyform.subrouter'),
		name: 'form',
		Model: models.EquipmentBuyForm,
	},
	transferform: {
		module: require('./transferform.subrouter'),
		name: 'form',
		Model: models.EquipmentTransferForm,
	},
	importform: {
		module: require('./importform.subrouter'),
		name: 'form',
		Model: models.EquipmentImportForm,
	},
	requestform: {
		module: require('./requestform.subrouter'),
		name: 'form',
		Model: models.EquipmentRequestForm,
	},
};

async function approve(req, res, cfg) {
	_.set(req.body, [cfg.name, '_id'], req.params.id);

	if (!cfg.module.approve) {
		throw new ThrowReturn('Approved is not implemented');
	}
	return await cfg.module.approve(req, res);
}

const activity = {};

Object.entries(SubRouters).forEach(([key, cfg]) => {
	async function list(req, res) {
		_.set(req.query, 'groupId', req.decoded.user.groupIds);
		await restful.list(req, res, cfg);
	}

	async function create(req, res) {
		_.set(req.body, [cfg.name, 'groupId'], _.head(req.decoded.user.groupIds));
		await restful.create(req, res, cfg);
	}

	router.postS(`/${key}`, create);
	router.getS(`/${key}/:id`, async (req, res) => await restful.view(req, res, cfg));
	router.getS(`/${key}`, list);
	router.putS(`/${key}/:id`, async (req, res) => await restful.modify(req, res, cfg));
	router.deleteS(`/${key}/:id`, async (req, res) => await restful.del(req, res, cfg));
	router.putS(`/${key}/approve/:id`, async (req, res) => await approve(req, res, cfg));

	const pre = `EQUIPMENT_${key.toUpperCase()}`;

	activity[`${pre}_CREATE`] = {
		method: 'POST',
		key: `/${key}`,
	};

	activity[`${pre}_APPROVE`] = {
		method: 'PUT',
		key: `/${key}/approve/{id}`,
	};

	activity[`${pre}_UPDATE`] = {
		method: 'PUT',
		key: `/${key}/{id}`,
	};

	activity[`${pre}_DELETE`] = {
		method: 'DELETE',
		key: `/${key}/{id}`,
	};
});

router.getS('/summary/:month', require('./summary.subrouter'), true);

module.exports = { router, activity };

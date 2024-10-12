// const mongoose = require('mongoose');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

// tạo kho
async function create(req, res) {
	let { name, address, blockId } = req.body.store;
	let store = null;

	// store mới
	if (!blockId) {
		store = await models.EquipmentWareHouse.create({ name, address, equipments: [] });
		return res.sendData({ store });
	}

	// store của hotel
	store = await models.EquipmentBlockStore.findOne({ blockId });
	if (store) {
		throw new ThrowReturn('Block này đã có store');
	}

	store = await models.EquipmentBlockStore.create({ name, address, blockId, equipments: [] });

	return res.sendData({ store });
}

module.exports = { create };

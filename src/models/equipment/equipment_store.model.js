const mongoose = require('mongoose');
const ThrowReturn = require('@core/throwreturn');
const EquipmentSchema = require('./equipment.schema');

const { Schema } = mongoose;
const options = { discriminatorKey: '__t' };

const EquipmentStoreSchema = new Schema(
	{
		name: String,
		address: String,
		lastReported: Date,
		equipments: [EquipmentSchema],
		active: { type: Boolean, default: true },
		groupId: { type: Schema.Types.ObjectId, ref: 'UserGroup' },
	},
	options
);

EquipmentStoreSchema.methods = {
	/**
	 * Find equipment in store
	 * @param {Equipment} equipment
	 */
	findEquipment(equipment) {
		return this.equipments.find(e => e.isSame(equipment));
	},

	/**
	 * Set equipments to store
	 * @param {Array<Equipment>} equipments
	 */
	async setEquipmentsAsync(equipments) {
		this.equipments = equipments;
		this.lastReported = Date.now();
		return this.save();
	},

	/**
	 * check store can substract equipments
	 * @param {Array<Equipment>} equipments
	 */
	substractAvailable(equipments) {
		for (let equipment of equipments) {
			let fromEquipment = this.findEquipment(equipment);
			if (!fromEquipment) {
				throw new ThrowReturn(`Không tìm thấy _id vật tư ${equipment._id}`);
			}
			fromEquipment.substractAvailable(equipment);
		}
	},

	/**
	 * subtract equipment (not save to database)
	 * @param {Equipment} equipment
	 */
	substractEquipment(equipment) {
		let storeEquipment = this.findEquipment(equipment);
		if (!storeEquipment) {
			throw new ThrowReturn(`Không tìm thấy vật tư "${equipment.name}"`);
		}
		storeEquipment.substract(equipment);
		EquipmentSchema.assignInfo(equipment, storeEquipment);
	},

	/**
	 * add equipment (not save to database)
	 * @param {Equipment} equipment
	 */
	addEquipment(equipment) {
		let storeEquipment = this.findEquipment(equipment);
		if (!storeEquipment) {
			// không có thì đẩy vào
			this.equipments.push(equipment);
		} else {
			// có thì thêm số lượng
			storeEquipment.add(equipment);
			// EquipmentSchema.assignInfo(storeEquipment, equipment);
		}
	},

	/**
	 * Substract equipments and save to database.
	 * @param {Array<Equipment>} equipments
	 */
	async substractEquipmentsAsync(equipments) {
		equipments.forEach(e => this.substractEquipment(e));
		this.lastReported = Date.now();
		return await this.save();
	},

	/**
	 * Add equipments and save to database.
	 *
	 * @param {Array<Equipment>} equipments
	 */
	async addEquipmentsAsync(equipments) {
		equipments.forEach(e => this.addEquipment(e));
		this.lastReported = Date.now();
		return await this.save();
	},

	/**
	 * Transfer equipments to other store
	 * @param {Array<Equipment>} equipments
	 * @param {EquipmentStore} toStore other store for tranfering
	 */
	async transferEquipmentsAsync(equipments, toStore) {
		let from = await this.substractEquipmentsAsync(equipments);
		let to = await toStore.addEquipmentsAsync(equipments);
		return { from, to, equipments };
	},
};

// validate `equipments` in store
EquipmentStoreSchema.path('equipments').validate(async equipments => {
	return await EquipmentSchema.validateEquipments(equipments); //
});

const EquipmentStore = mongoose.model('EquipmentStore', EquipmentStoreSchema, 'equipment_store');

Object.assign(EquipmentStore, {
	EquipmentWareHouse: EquipmentStore.discriminator('EquipmentWareHouse', new Schema({}, {}), 'WareHouse'),

	EquipmentBuy: EquipmentStore.discriminator('EquipmentBuy', new Schema({}, {}), 'Buy'),

	EquipmentBlockStore: EquipmentStore.discriminator(
		'EquipmentBlockStore',
		new Schema(
			{
				blockId: { type: Schema.Types.ObjectId, ref: 'Block' },
			},
			{}
		),
		'BlockStore'
	),
});

// virtual store lưu tất cả những sản phẩm mua về mà chưa chuyển vào kho
// Đóng chưa dùng Cái Buy store
// EquipmentStore.EquipmentBlockStore.Instance = async function() {
// 	let store = await EquipmentStore.EquipmentBuy.findOne();
// 	if (!store) {
// 		store = await EquipmentStore.EquipmentBuy.create({
// 			name: 'Kho ảo chứa những cái vừa mới mua chưa nhập kho nào',
// 			address: 'Không có address',
// 		});
// 	}
// 	return store;
// };
// EquipmentStore.getBuyStore = EquipmentStore.EquipmentBlockStore.Instance;
// EquipmentStore.EquipmentBlockStore.Instance();

module.exports = EquipmentStore;

const mongoose = require('mongoose');
const assert = require('assert');
const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');

const { Schema } = mongoose;

const EquipmentSchema = new Schema(
	{
		name: { type: String, required: true },

		unit: { type: String, required: false },
		amount: { type: Number, required: false },

		childUnit: { type: String, required: true },
		childAmount: { type: Number, required: true },

		childMultiply: { type: Number, required: false },

		type: { type: Schema.Types.ObjectId, ref: 'EquipmentType', required: true },

		supplier: String,
		price: Number,
	},
	{
		timestamps: true,
	}
);

/**
 * Assign basic information from second equipment to the first equipment
 * @param {Equipment} first first equipment
 * @param {Equipment} second second equipment
 */
EquipmentSchema.assignInfo = function (first, second) {
	assert(first && second && first.type.toString() === second.type.toString());
	Object.assign(first, {
		name: second.name,
		unit: second.unit,
		childUnit: second.childUnit,
		childMultiply: second.childMultiply,
	});
};

EquipmentSchema.getInvalidEquipments = async function (equipments) {
	let typeIds = equipments.map(e => e.type);
	let types = await mongoose
		.model('EquipmentType')
		.find({ _id: { $in: typeIds } })
		.select('_id');

	return equipments
		.map((e, i) => [e, i]) // for endline only
		.filter(([e]) => types.every(t => t._id.toString() !== e.type.toString()));
};

EquipmentSchema.validateEquipments = async function (equipments) {
	let invalidEquipments = await EquipmentSchema.getInvalidEquipments(equipments);

	if (invalidEquipments && invalidEquipments.length) {
		let [equipment, index] = invalidEquipments[0];
		throw new ThrowReturn(`equipments.${index}.type \`${equipment.type}\` is invalid`);
	}
	return true;
};

EquipmentSchema.add = function (...iterable) {
	let equipments = _.chain(iterable)
		.flattenDepth(1)
		.groupBy('type')
		.values()
		.map(group => group.reduce((equipment, other) => equipment.add(other)))
		.value();
	return equipments;
};

EquipmentSchema.methods = {
	/**
	 * Check two equipments are the same type or not
	 *
	 * @param {Equipment} equipment
	 * @return {Boolean} True if the two equipments are the same
	 */
	isSame(equipment) {
		return (
			equipment && // for endline only
			equipment.type &&
			this.type &&
			this.type.toString() === equipment.type.toString()
		);
	},
	/**
	 * Check the equipment can substract
	 *
	 * @param {Equipment} equipment
	 */
	substractAvailable(equipment) {
		assert(this.isSame(equipment));

		let copy = this.toJSON();

		if (!this.childMultiply) {
			// chỉ có duy nhất đơn vị nhỏ
			if (copy.childAmount < equipment.childAmount) {
				throw new ThrowReturn('Số lượng không đủ');
			}
			copy.childAmount -= equipment.childAmount;
			return copy;
		}

		// có cả hai đơn vị lớn và nhỏ

		if (copy.amount < equipment.amount) {
			throw new ThrowReturn('Số lượng không đủ');
		}

		copy.amount -= equipment.amount;

		if (copy.childAmount >= equipment.childAmount) {
			copy.childAmount -= equipment.childAmount;
			return copy;
		}
		// số lượng child còn thiếu
		let incompleteChild = equipment.childAmount - copy.childAmount;

		// đổi sang số lượng parent
		let incomplete = Math.ceil(incompleteChild / copy.childMultiply);

		if (copy.amount < incomplete) {
			throw new ThrowReturn('Số lượng không đủ');
		}

		// còn lại
		copy.amount -= incomplete;
		copy.childAmount = incomplete * copy.childMultiply - incompleteChild;
		return copy;
	},

	/**
	 * substract equipment
	 *
	 * @param {Equipment} equipment
	 */
	substract(equipment) {
		assert(this.isSame(equipment));
		let copy = this.substractAvailable(equipment);
		Object.assign(
			this,
			_.pickBy({
				amount: copy.amount,
				childAmount: copy.childAmount,
			})
		);
		return this;
	},

	/**
	 * Add equipment
	 *
	 * @param {Equipment} equipment
	 */
	add(equipment) {
		assert(this.isSame(equipment));

		// nếu có đơn vị lớn thì xử lý
		if (this.childMultiply) {
			this.amount += equipment.amount;
		}

		this.childAmount += equipment.childAmount;
		return this;
	},

	/**
	 * assign information from equipment to this
	 * @param {Equipment} equipment
	 */
	assignInfo(equipment) {
		EquipmentSchema.assign(this, equipment);
	},
};

// prettier-ignore
// ghi đè cái equipments có thêm từng `blockId` cho từng equipment
const EquipmentInStoreTypeSchema = EquipmentSchema
	.clone() //
	.add({ storeId: { type: Schema.Types.ObjectId, ref: 'EquipmentStore', required: true } });

EquipmentInStoreTypeSchema.validateEquipments = async function (equipments) {
	assert(_.isArray(equipments));

	const storeIds = [...new Set(equipments.map(e => e.storeId.toString()))];

	// prettier-ignore
	const notFound = await mongoose.model('EquipmentStore')
		.find({_id: { $in: storeIds }})
		.distinct('_id')
		.then(existIds => storeIds.find(bid => !existIds.includes(bid)));

	if (notFound) {
		// get the first index error
		let index = equipments.findIndex(e => e.storeId.equals(notFound));

		throw new ThrowReturn(`equipments.${index}.storeId \`${notFound}\` is invalid`);
	}
	return EquipmentSchema.validateEquipments(equipments);
};

EquipmentSchema.EquipmentInStoreTypeSchema = EquipmentInStoreTypeSchema;
module.exports = EquipmentSchema;

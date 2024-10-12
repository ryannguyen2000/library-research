const _ = require('lodash');
const models = require('@models');
const EquipmentSchema = require('@models/equipment/equipment.schema');

async function getRequestOfMonth(month) {
	// prettier-ignore
	let requests = await models.EquipmentRequestForm
		.find({ forMonth: month })
		.then(forms => forms.filter(f => f.isApproved()));

	return _.chain(requests)
		.map(form => form.equipments)
		.flattenDepth(1) // mixed equipments of all forms
		.groupBy('storeId')
		.value();
}

async function getLastCountingOfMonth(month) {
	// prettier-ignore
	let countings = await models.EquipmentCountingForm
		.find({ forMonth: month })
		.then(forms => forms.filter(f => f.isApproved()))
		.then(forms => forms.reduce((a, c) => {
			c.equipments.forEach(e => { e.createdAt = c.createdAt })
			return [...a, ...c.equipments]
		}, []));

	let lastCounting = _.chain(countings)
		.groupBy('storeId')
		.mapValues(group => _.maxBy(group, 'createAt')) // get the last creatAt
		// .mapValues(counting => counting.equipments)
		.value();
	return lastCounting;
}

async function getImportsOfMonth(month) {
	// prettier-ignore
	let importForms = await models.EquipmentImportForm
		.find({ forMonth: month })
		.then(forms => forms.filter(f => f.isApproved()));

	return _.chain(importForms)
		.map(form => form.equipments)
		.flattenDepth(1) // mixed equipments of all forms
		.groupBy('storeId')
		.value();
}

async function getTransfersOfMonth(month) {
	// prettier-ignore
	let transferforms = await models.EquipmentTransferForm
		.find({ forMonth: month })
		.then(forms =>forms.filter(f => f.isApproved()))

	let from = _.chain(transferforms)
		.groupBy('fromStoreId')
		.mapValues(group =>
			_.chain(group)
				.map(form => form.equipments)
				.flattenDepth(1)
				.value()
		)
		.value();

	let to = _.chain(transferforms)
		.groupBy('toStoreId')
		.mapValues(group =>
			_.chain(group)
				.map(form => form.equipments)
				.flattenDepth(1)
				.value()
		)
		.value();

	return { from, to };
}

async function summary(req, res) {
	let { month } = req.params;
	let request = await getRequestOfMonth(month);
	let lastCounting = await getLastCountingOfMonth(month);
	let imports = await getImportsOfMonth(month);
	let { from, to } = await getTransfersOfMonth(month);

	// các vật tư chuyển đi thì mang dấu trừ
	from = _.mapValues(from, equipments =>
		equipments.map(e =>
			_.assign(_.cloneDeep(e), {
				amount: -e.amount,
				childAmount: -e.childAmount,
			})
		)
	);

	let totalImport = _.chain([..._.entries(imports), ..._.entries(from), ..._.entries(to)])
		.groupBy(([storeId]) => storeId)
		.mapValues(group => EquipmentSchema.add(...group.map(([storeId, equipments]) => equipments)))
		.mapValues(equipments => {
			// đổi sang đơn vị nhỏ nhất cho tiện sử dụng
			return equipments.map(e =>
				_.assign(e, {
					amount: 0,
					childAmount: e.childAmount + e.amount * e.childMultiply,
				})
			);
		})
		.value();
	res.sendData({ request, lastCounting, totalImport });
}

module.exports = summary;

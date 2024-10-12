const _ = require('lodash');

const ThrowReturn = require('@core/throwreturn');
const { AcceleratorOTAs } = require('@utils/const');
const models = require('@models');

async function getAccelerators({ blockId, from, to }) {
	const accelerators = await models.Accelerator.find(
		_.pickBy({
			blockId,
			to: { $gte: from },
			from: { $lte: to },
			deleted: { $ne: true },
		})
	)
		.select('-dataOTAs')
		.populate('blockId', 'info.name info.shortName')
		.lean();

	return {
		accelerators,
		editableFields: ['from', 'to', 'commission', 'otas'],
		otas: [...AcceleratorOTAs],
	};
}

async function createJob(accelerator, from, to) {
	await accelerator.otas.asyncMap(ota =>
		models.JobAccelerator.create({
			ota,
			acceleratorId: accelerator._id,
			from: from || accelerator.from,
			to: to || accelerator.to,
		})
	);
}

async function createAccelerator(user, data) {
	const accelerator = await models.Accelerator.create({ ...data, groupIds: user.groupIds });

	await createJob(accelerator);

	return {
		accelerator,
	};
}

async function updateAccelerator(user, id, data) {
	const accelerator = await models.Accelerator.findOne({ _id: id, deleted: false }).select('-dataOTAs');
	if (!accelerator) {
		throw new ThrowReturn().status(404);
	}

	const oldFrom = accelerator.from;
	const oldTo = accelerator.to;

	_.assign(accelerator, _.pick(data, ['from', 'to', 'commission', 'otas']));
	await accelerator.save();

	await createJob(accelerator, _.min([oldFrom, accelerator.from]), _.max([oldTo, accelerator.to]));

	return {
		accelerator,
	};
}

async function deleteAccelerator(user, id) {
	const accelerator = await models.Accelerator.findOne({ _id: id, deleted: false }).select('-dataOTAs');
	if (!accelerator) {
		throw new ThrowReturn().status(404);
	}

	accelerator.deleted = true;
	accelerator.deletedBy = user._id;

	await accelerator.save();

	await createJob(accelerator);

	return {
		deleted: accelerator.deleted,
	};
}

module.exports = {
	getAccelerators,
	createAccelerator,
	updateAccelerator,
	deleteAccelerator,
};

const _ = require('lodash');
const AsyncLock = require('async-lock');

const { PayoutType, PayoutStates, TaskStatus, PayoutAutoTypes } = require('@utils/const');
const { logger } = require('@utils/logger');
const { eventEmitter, EVENTS } = require('@utils/events');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

const TaskPayoutLock = new AsyncLock();

async function getPayouts({ taskId }) {
	const payouts = await models.Payout.find({ taskId, state: { $ne: PayoutStates.DELETED } })
		.select('-logs')
		.populate('createdBy', 'name');

	return {
		payouts,
	};
}

async function createPayout({ taskId, task, data, user }) {
	task = task || (await models.Task.findById(taskId));
	if (!task) {
		throw new ThrowReturn('Nhiệm vụ không tồn tại!');
	}

	const category = await models.TaskCategory.findByIdAndValidate(task.category);

	const payoutData = {
		categoryId: category.payoutCategory,
		paidAt: task.doneAt || task.time || new Date(),
		...data,
		blockIds: [task.blockId],
		roomIds: task.roomIds,
		taskId: task._id,
		payoutType: PayoutType.PAY,
		createdBy: user && user._id,
	};

	const payout = await models.Payout.create(payoutData);

	await models.Task.updateOne({ _id: task._id }, { $push: { payoutIds: payout._id } });

	return {
		payout,
	};
}

async function updatePayout({ taskId, payoutId, payout, data, user }) {
	payout = payout || (await models.Payout.findOne({ _id: payoutId, taskId }));
	if (!payout) {
		throw new ThrowReturn('Chi phí không tồn tại!');
	}

	if (data.currencyAmount && data.currencyAmount.amount !== payout.currencyAmount.amount && payout.isApproved()) {
		throw new ThrowReturn('Chi phí đã duyệt không thể sửa!');
	}

	await models.Payout.updatePayout(
		payout,
		_.pick(data, ['currencyAmount', 'images', 'buyType', 'description', 'isInternal', 'ignoreReport']),
		user,
		false
	);

	return {
		payout,
	};
}

async function deletePayout({ payoutId, taskId, user }) {
	const payout = await models.Payout.findOne({ _id: payoutId, taskId });
	if (!payout) {
		throw new ThrowReturn('Chi phí không tồn tại!');
	}

	if (payout.isApproved()) {
		throw new ThrowReturn('Chi phí đã duyệt không thể sửa!');
	}

	await models.Payout.deletePayout(payout, user, false);

	await models.Task.updateOne({ _id: taskId }, { $pull: { payoutIds: payout._id } });
}

async function syncTaskFee({ taskId, payoutType }) {
	if (!taskId || payoutType !== PayoutType.PAY) return;

	try {
		const payouts = await models.Payout.find({
			taskId,
			state: { $ne: PayoutStates.DELETED },
			payoutType: PayoutType.PAY,
		})
			.select('currencyAmount')
			.lean();

		if (payouts.length === 1) {
			await models.Task.updateOne(
				{ _id: taskId },
				{
					'fee.amount': payouts[0].currencyAmount.amount,
					'fee.currency': payouts[0].currencyAmount.currency,
					'fee.quantity': payouts[0].currencyAmount.quantity,
					'fee.unitPrice': payouts[0].currencyAmount.unitPrice,
				}
			);
		} else {
			const totalAmount = _.sumBy(payouts, 'currencyAmount.exchangedAmount');

			await models.Task.updateOne(
				{ _id: taskId },
				{
					'fee.amount': totalAmount,
					'fee.unitPrice': totalAmount,
					'fee.quantity': 1,
				}
			);
		}
	} catch (e) {
		logger.error('syncTaskFee', taskId, e);
	}
}

async function onAutoTaskPayoutLock(task) {
	try {
		if (task.status === TaskStatus.Deleted && task.payoutIds && task.payoutIds.length) {
			await task.payoutIds.asyncMap(payoutId => {
				return deletePayout({ taskId: task._id, payoutId }).catch(e => {
					logger.error(e);
				});
			});

			return;
		}

		if (task.status !== TaskStatus.Done || !task.doneAt || !task.workingPoint) return;

		const autoPayout = await models.PayoutAuto.findOne({
			type: PayoutAutoTypes.TASK,
			deleted: false,
			'payouts.taskCategoryId': task.category,
			blockIds: {
				$in: [task.blockId, [], null],
			},
		})
			.sort({ blockIds: -1 })
			.lean();

		if (!autoPayout) return;

		const autoConfig = autoPayout.payouts.find(p => p.taskCategoryId.equals(task.category));

		const currencyAmount = {
			quantity: task.workingPoint,
			unitPrice: autoConfig.amount,
		};

		const payout = await models.Payout.findOne({
			taskId: task._id,
			state: { $ne: PayoutStates.DELETED },
			...(autoPayout.payoutConfig || null),
		});

		const data = {
			...(autoPayout.payoutConfig || null),
			currencyAmount,
			categoryId: autoConfig.categoryId,
			paidAt: task.doneAt,
		};

		if (payout) {
			await updatePayout({
				taskId: task._id,
				payout,
				data,
			});
		} else {
			data.description = autoConfig.description;
			await createPayout({ task, data });
		}
	} catch (e) {
		logger.error('onTaskUpdated', task, e);
	}
}

async function onAutoTaskPayout(task) {
	return await TaskPayoutLock.acquire(`${task._id}`, async () => {
		return await onAutoTaskPayoutLock(task);
	});
}

eventEmitter.on(EVENTS.CREATE_PAYOUT, syncTaskFee);
eventEmitter.on(EVENTS.UPDATE_PAYOUT, syncTaskFee);
eventEmitter.on(EVENTS.TASK_UPDATE_STATUS, onAutoTaskPayout);
eventEmitter.on(EVENTS.TASK_UPDATE_POINT, onAutoTaskPayout);

module.exports = {
	getPayouts,
	createPayout,
	updatePayout,
	deletePayout,
	onAutoTaskPayout,
};

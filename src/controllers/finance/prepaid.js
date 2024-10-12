const _ = require('lodash');

const { PayoutType, PayoutStates, UserRoles } = require('@utils/const');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');
const PayoutGroup = require('@controllers/finance/payoutGroup');

async function getDetail(id, user) {
	const exportData = await PayoutGroup.getPayoutExportDetail(id, user, false);

	return exportData;
}

async function updateDetail(id, data) {
	const { name, description, currencyAmount } = data;

	const exportData = await models.PayoutExport.findById(id);
	if (!exportData) {
		throw new ThrowReturn('Report not found');
	}

	if (!exportData.state) {
		exportData.name = name || exportData.name;
		exportData.description = description || exportData.description;
		exportData.currencyAmount = currencyAmount || exportData.currencyAmount;
		await exportData.save();
	} else {
		throw new ThrowReturn().status(403);
	}
}

async function addPayout(user, reportId, data) {
	const exportData = await models.PayoutExport.findById(reportId);
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	if (exportData.createdBy && !exportData.createdBy.equals(user._id)) {
		throw new ThrowReturn().status(403);
	}

	const payout = await models.Payout.create({
		...data,
		payoutType: PayoutType.PREPAID,
		createdBy: user._id,
	});

	exportData.payouts.push(payout._id);
	await exportData.save();

	return payout;
}

async function updatePayout(user, reportId, payoutId, data) {
	const exportData = await models.PayoutExport.findOne({ _id: reportId, payouts: payoutId });
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	if (exportData.createdBy && !exportData.createdBy.equals(user._id)) {
		throw new ThrowReturn().status(403);
	}

	const payout = await models.Payout.findById(payoutId);
	_.assign(payout, data);
	await payout.save();

	return payout;
}

async function removePayout(user, reportId, payoutId) {
	const exportData = await models.PayoutExport.findOne({ _id: reportId, payouts: payoutId });
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	const payout = await models.Payout.findOne({ _id: payoutId, payoutType: PayoutType.PREPAID });
	if (!payout) {
		throw new ThrowReturn().status(404);
	}

	await models.Payout.deletePayout(payout, user);
}

async function approvePrepaid({ user, reportId, approveIndex }) {
	const exportData = await models.PayoutExport.findOne({
		_id: reportId,
		payoutType: PayoutType.PREPAID,
	});
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}

	const stateConfirms = [
		{
			roles: [UserRoles.LEADER, UserRoles.MARKETING, UserRoles.MANAGER, UserRoles.ADMIN],
			state: PayoutStates.APPROVE,
			indexes: [0, 4],
		},
		{
			roles: [UserRoles.ACCOUNTANT, UserRoles.MANAGER, UserRoles.ADMIN],
			state: PayoutStates.APPROVE,
			indexes: [1, 5],
		},
		{
			roles: [UserRoles.MANAGER, UserRoles.ADMIN],
			state: PayoutStates.APPROVE,
			indexes: [2, 6],
		},
		{
			roles: [UserRoles.ACCOUNTANT, UserRoles.MANAGER, UserRoles.ADMIN],
			state: PayoutStates.APPROVE,
			indexes: [3],
		},
		{
			roles: [UserRoles.ACCOUNTANT, UserRoles.MANAGER, UserRoles.ADMIN],
			state: PayoutStates.CONFIRMED,
			confirm: true,
			indexes: [7],
		},
	];

	const stateConfirm = stateConfirms.find(s => s.indexes.includes(approveIndex));

	if (!stateConfirm || !stateConfirm.roles.includes(user.role)) {
		throw new ThrowReturn().status(403);
	}

	_.range(8).forEach(i => {
		exportData.approved[i] = exportData.approved[i] || { user: null };
	});

	const approvedData = {
		user: user._id,
		state: stateConfirm.state,
		date: new Date(),
	};
	exportData.state = stateConfirm.state;
	exportData.approved[approveIndex] = approvedData;

	await exportData.save();

	if (stateConfirm.confirm) {
		await models.Payout.confirmPayout(user._id, exportData.payouts);
		exportData.confirmedBy = user._id;
		exportData.confirmedDate = new Date();
	}

	return exportData.approved;
}

async function undoApprovedPrepaid({ user, reportId, approveIndex }) {
	const exportData = await models.PayoutExport.findOne({
		_id: reportId,
		payoutType: PayoutType.PREPAID,
	});
	if (!exportData) {
		throw new ThrowReturn().status(404);
	}
	if (exportData.confirmedBy) {
		throw new ThrowReturn('Already confirmed');
	}

	if (exportData.approved.length > 0) {
		approveIndex = _.isNumber(approveIndex) ? approveIndex : exportData.approved.length;
		const approved = exportData.approved[approveIndex];
		if (!approved || !approved.user || approved.user.toString() !== user._id.toString()) {
			throw new ThrowReturn().status(403);
		}
		exportData.approved[approveIndex] = { user: null };
		const dataApproved = _.filter(exportData.approved, a => a && a.user);
		exportData.state = dataApproved.length > 0 ? _.last(dataApproved).state : undefined;
	}

	await exportData.save();
}

module.exports = {
	getDetail,
	updateDetail,
	addPayout,
	updatePayout,
	removePayout,
	approvePrepaid,
	undoApprovedPrepaid,
};

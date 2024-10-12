const _ = require('lodash');

const { PayoutType } = require('@utils/const');
const router = require('@core/router').Router();
const models = require('@models');
const Payout = require('@controllers/finance/payout');
const PayoutGroup = require('@controllers/finance/payoutGroup');
const Prepaid = require('@controllers/finance/prepaid');
const Refund = require('@controllers/finance/refund');
const PayoutAuto = require('@controllers/finance/auto');
const Transaction = require('@controllers/finance/transaction');
const Utils = require('@controllers/finance/utils');
const PayRequest = require('@controllers/finance/pay_request');
const PayRequestBanking = require('@controllers/finance/pay_request/banking');
const PayReconcile = require('@controllers/finance/pay_request/reconcile');

async function getPayments(req, res) {
	const { blocks, rooms } = req.query;

	const payout = await Payout.getPayouts(
		{
			blockIds: blocks,
			roomIds: rooms,
			...req.query,
		},
		req.decoded.user
	);

	res.sendData(payout);
}

async function getPayment(req, res) {
	const payout = await Payout.getPayout(req.params.payoutId, req.decoded.user);

	res.sendData(payout);
}

async function getPaymentLogs(req, res) {
	const data = await Payout.getPayoutLogs(req.params.payoutId, req.language);

	res.sendData(data);
}

async function createPayment(req, res) {
	const { _id } = req.decoded.user;

	req.body.payoutType = PayoutType.PAY;
	req.body.collector = req.body.collector || _id;
	req.body.createdBy = _id;

	const payout = await models.Payout.createPayout(req.body);

	res.sendData({ payout });
}

async function quickCreate(req, res) {
	const { payouts } = await PayoutGroup.quickCreatePayoutExport(req.decoded.user, req.body);

	if (payouts && payouts[0]) {
		_.set(req, ['logData', 'blockId'], payouts[0].blockIds[0]);
	}

	res.sendData();
}

async function updatePayment(req, res) {
	const payout = await models.Payout.findById(req.params.payoutId);
	await models.Payout.updatePayout(payout, req.body, req.decoded.user);

	_.set(req, ['logData', 'blockId'], payout.blockIds[0]);

	res.sendData();
}

async function deletePayment(req, res) {
	const payout = await models.Payout.findById(req.params.payoutId);
	await models.Payout.deletePayout(payout, req.decoded.user);

	res.sendData();
}

async function getPaymentCategory(req, res) {
	const category = await models.PayoutCategory.find().sort({ group: 1, order: 1 });
	res.sendData({ category });
}

async function createCategory(req, res) {
	const category = await models.PayoutCategory.create(req.body);
	res.sendData({ category });
}

async function updateCategory(req, res) {
	const { categoryId } = req.params;
	const category = await models.PayoutCategory.findOneAndUpdate({ _id: categoryId }, req.body, { new: true });
	res.sendData({ category: _.pick(category, _.keys(req.body)) });
}

async function confirmPayoutExport(req, res) {
	const { approveIndex } = req.body;

	const report = await PayoutGroup.confirmPayoutExport({
		approveIndex,
		payoutId: req.params.reportId,
		user: req.decoded.user,
		payoutType: PayoutType.PAY,
	});
	if (report && report.blockIds && report.blockIds[0]) {
		_.set(req, ['logData', 'blockId'], report.blockIds[0]);
	}

	res.sendData();
}

async function getPrepaid(req, res) {
	const { start, limit, ...query } = req.query;

	const prepaids = await models.PayoutExport.list(
		{
			...query,
			start: parseInt(start) || 0,
			limit: parseInt(limit) || 20,
			payoutType: PayoutType.PREPAID,
		},
		req.decoded.user
	);

	res.sendData(prepaids);
}

async function getPrepaidDetail(req, res) {
	const data = await Prepaid.getDetail(req.params.reportId, req.decoded.user);
	res.sendData(data);
}

async function createPrepaid(req, res) {
	const { user } = req.decoded;

	// create export
	const exportData = await models.PayoutExport.createExport({
		payoutType: PayoutType.PREPAID,
		name: req.body.name,
		description: req.body.description,
		createdBy: user._id,
		currencyAmount: req.body.currencyAmount,
		groupIds: user.groupIds,
	});

	res.sendData(exportData);
}

async function updatePrepaidDetail(req, res) {
	const data = await Prepaid.updateDetail(req.params.reportId, req.body);
	res.sendData(data);
}

async function confirmPrepaid(req, res) {
	const data = await Prepaid.approvePrepaid({
		user: req.decoded.user,
		reportId: req.params.reportId,
		approveIndex: req.body.approveIndex,
	});
	res.sendData(data);
}

async function undoPrepaid(req, res) {
	const { reportId } = req.params;
	const { approveIndex } = req.body;

	await Prepaid.undoApprovedPrepaid({ user: req.decoded.user, reportId, approveIndex });
	res.sendData();
}

async function deletePrepaid(req, res) {
	await PayoutGroup.deletePayoutExport(req.params.reportId, req.decoded.user);

	res.sendData();
}

async function undoExport(req, res) {
	const { reportId } = req.params;
	const { approveIndex } = req.body;

	const report = await PayoutGroup.undoExport({ user: req.decoded.user, payoutId: reportId, approveIndex });
	if (report && report.blockIds) {
		_.set(req, ['logData', 'blockId'], report.blockIds[0]);
	}

	res.sendData();
}

async function cloneExport(req, res) {
	const data = await PayoutGroup.cloneExport(req.decoded.user, req.params.reportId);
	res.sendData(data);
}

async function addPrepaidPayout(req, res) {
	const data = await Prepaid.addPayout(req.decoded.user, req.params.reportId, req.body);
	res.sendData(data);
}

async function updatePrepaidPayout(req, res) {
	const data = await Prepaid.updatePayout(req.decoded.user, req.params.reportId, req.params.payoutId, req.body);
	res.sendData(data);
}

async function removePrepaidPayout(req, res) {
	const data = await Prepaid.removePayout(req.decoded.user, req.params.reportId, req.params.payoutId);
	res.sendData(data);
}

async function updatePaymentInvoice(req, res) {
	const data = await Payout.updatePayoutInvoices(req.params.payoutId, req.body);
	res.sendData(data);
}

async function reSendConfirmation(req, res) {
	const data = await Payout.reSendPaymentConfirmation(req.params.payoutId, req.body);
	res.sendData(data);
}

async function checkRefundMethod(req, res) {
	const data = await Refund.checkRefundMethod(req.query, req.decoded.user);
	res.sendData(data);
}

async function getQrRefund(req, res) {
	const data = await Refund.getQrRefund(req.body, req.decoded.user);
	res.sendData(data);
}

async function confirmRefund(req, res) {
	const data = await Refund.confirmRefund(req.body, req.decoded.user);
	res.sendData(data);
}

async function declineRefund(req, res) {
	const data = await Refund.declineRefund(req.body, req.decoded.user);
	res.sendData(data);
}

async function getPaymentAccounts(req, res) {
	const data = await PayRequest.getPaymentAccounts(req.decoded.user, req.query);
	res.sendData(data);
}

async function createPaymentAccount(req, res) {
	const data = await PayRequest.createPaymentAccount(req.decoded.user, req.body);
	res.sendData(data);
}

async function updatePaymentAccount(req, res) {
	const data = await PayRequest.updatePaymentAccount(req.decoded.user, req.params.accountId, req.body);
	res.sendData(data);
}

async function deletePaymentAccount(req, res) {
	const data = await PayRequest.deletePaymentAccount(req.decoded.user, req.params.accountId, req.body);
	res.sendData(data);
}

// async function makeReportPayRequest(req, res) {
// 	const data = await Pay.makeReportPayRequest(req.decoded.user, req.params.reportId, req.body);
// 	res.sendData(data);
// }

async function checkResultPayRequest(req, res) {
	const data = await PayReconcile.checkPayTransactionsResult({ user: req.decoded.user, ...req.body });
	res.sendData(data);
}

async function reconcilePay(req, res) {
	const data = await PayReconcile.reconcile(req.query);
	res.sendData(data);
}

async function getQRPay(req, res) {
	const data = await PayRequest.getPayQR(req.params.payoutId);
	res.sendData(data);
}

async function makeNewPayRequest(req, res) {
	const data = await PayRequestBanking.makeNewPayRequest(req.body, req.decoded.user);
	res.sendData(data);
}

async function updateNewPayRequest(req, res) {
	const data = await PayRequestBanking.makeNewPayRequest(req.body, req.decoded.user, req.params.requestId);
	res.sendData(data);
}

async function approveNewPayRequest(req, res) {
	const data = await PayRequestBanking.approveNewPayRequest({
		user: req.decoded.user,
		requestId: req.params.requestId,
	});
	res.sendData(data);
}

async function deleteNewPayRequest(req, res) {
	const data = await PayRequestBanking.deleteNewPayRequest(req.decoded.user, req.params.requestId);
	res.sendData(data);
}

async function getPayRequests(req, res) {
	const data = await PayRequest.getPayRequests(req.decoded.user, req.query);
	res.sendData(data);
}

async function getPayRequest(req, res) {
	const data = await PayRequest.getPayRequest(req.decoded.user, req.params.requestId);
	res.sendData(data);
}

async function getPayRequestQR(req, res) {
	const data = await PayRequest.getPayRequestQR(req.decoded.user, req.params.requestId);
	res.sendData(data);
}

async function declineNewPayRequest(req, res) {
	const data = await PayRequestBanking.declineNewPayRequest({
		user: req.decoded.user,
		requestId: req.params.requestId,
	});
	res.sendData(data);
}

async function reportErrorPayRequest(req, res) {
	const data = await PayRequest.reportError(req.decoded.user, req.params.requestId, req.body);
	res.sendData(data);
}

async function getPayRequestFileBulk(req, res) {
	const { fileName, fileData, fileType } = await PayRequest.getBulkFile(req.decoded.user, req.params.requestId);

	res.setHeader('content-disposition', `attachment; filename=${fileName}`);
	res.setHeader('Content-Type', fileType);
	res.send(fileData);
}

async function runAutos(req, res) {
	const data = await PayoutAuto.runAutos(req.body, req.decoded.user);
	res.sendData(data);
}

async function getAutos(req, res) {
	const data = await PayoutAuto.getAutos(req.query, req.decoded.user);
	res.sendData(data);
}

async function createAuto(req, res) {
	const data = await PayoutAuto.createAuto(req.body, req.decoded.user);
	res.sendData(data);
}

async function updateAuto(req, res) {
	const data = await PayoutAuto.updateAuto(req.params.autoId, req.body, req.decoded.user);
	res.sendData(data);
}

async function deleteAuto(req, res) {
	const data = await PayoutAuto.deleteAuto(req.params.autoId, req.decoded.user);
	res.sendData(data);
}

async function syncBankTransaction(req, res) {
	const data = await PayRequest.syncBankTransaction(req.params.transId, req.decoded.user);
	res.sendData(data);
}

async function getBankTransactions(req, res) {
	const data = await Transaction.getTransactions(req.decoded.user, req.query);
	res.sendData(data);
}

async function exportBankTransactions(req, res) {
	const { fileName, fileType, fileData } = await Transaction.exportTransactions(req.decoded.user, req.query);

	res.setHeader('content-disposition', `attachment; filename=${fileName}`);
	res.setHeader('Content-Type', fileType);
	res.send(fileData);
}

async function getAccountsConfig(req, res) {
	const data = await PayoutAuto.getAccountConfigs(req.decoded.user, req.query);
	res.sendData(data);
}

async function getStatsPayments(req, res) {
	const data = await Utils.getPayoutStats(req.decoded.user, req.query);
	res.sendData(data);
}

router.getS('/', getPayments, true);
router.postS('/', createPayment, true);
router.postS('/quickCreate', quickCreate, true);

router.getS('/stats', getStatsPayments);

router.getS('/pay/account', getPaymentAccounts, true);
router.postS('/pay/account', createPaymentAccount, true);
router.putS('/pay/account/:accountId', updatePaymentAccount, true);
router.deleteS('/pay/account/:accountId', deletePaymentAccount, true);

router.getS('/pay/request', getPayRequests);
router.getS('/pay/request/:requestId', getPayRequest);
router.getS('/pay/request/:requestId/qr', getPayRequestQR);
router.getS('/pay/request/:requestId/fileBulk', getPayRequestFileBulk);

router.postS('/pay/request', makeNewPayRequest);
router.putS('/pay/request/:requestId', updateNewPayRequest);
router.postS('/pay/request/:requestId/approve', approveNewPayRequest);
router.postS('/pay/request/:requestId/decline', declineNewPayRequest);
router.postS('/pay/request/:requestId/reportError', reportErrorPayRequest);
router.deleteS('/pay/request/:requestId', deleteNewPayRequest);
router.postS('/pay/transaction/check', checkResultPayRequest);
router.postS('/pay/transaction/reconcile', reconcilePay);

router.getS('/transaction/bank', getBankTransactions);
router.getS('/transaction/bank/export', exportBankTransactions);
router.postS('/transaction/bank/:transId', syncBankTransaction);

router.getS('/config/account', getAccountsConfig);
router.getS('/config/auto', getAutos);
router.postS('/config/auto', createAuto);
router.postS('/config/auto/exec', runAutos);
router.putS('/config/auto/:autoId', updateAuto);
router.deleteS('/config/auto/:autoId', deleteAuto);

router.getS('/category', getPaymentCategory, true);
router.postS('/category', createCategory, true);
router.putS('/category/:categoryId', updateCategory, true);

router.getS('/refund/check', checkRefundMethod, true);
router.postS('/refund/qr', getQrRefund, true);
router.postS('/refund/confirm', confirmRefund, true);
router.postS('/refund/decline', declineRefund);

router.getS('/prepaid', getPrepaid, true);
router.postS('/prepaid', createPrepaid, true);
router.getS('/prepaid/:reportId', getPrepaidDetail, true);
router.putS('/prepaid/:reportId', updatePrepaidDetail, true);
router.postS('/prepaid/:reportId/payment', addPrepaidPayout, true);
router.putS('/prepaid/:reportId/payment/:payoutId', updatePrepaidPayout, true);
router.deleteS('/prepaid/:reportId/payment/:payoutId', removePrepaidPayout, true);
router.deleteS('/prepaid/:reportId', deletePrepaid, true);
router.postS('/prepaid/confirmed/:reportId', confirmPrepaid, true);
router.postS('/prepaid/confirmed/:reportId/undo', undoPrepaid, true);

router.postS('/export/confirmed/:reportId', confirmPayoutExport, true);
router.postS('/export/confirmed/:reportId/undo', undoExport, true);
router.postS('/export/:reportId/clone', cloneExport);

router.getS('/:payoutId', getPayment);
router.getS('/:payoutId/qr', getQRPay);
router.getS('/:payoutId/logs', getPaymentLogs);
router.postS('/:payoutId/reSendConfirmation', reSendConfirmation);
router.putS('/:payoutId', updatePayment, true);
router.deleteS('/:payoutId', deletePayment, true);
router.putS('/:payoutId/invoice', updatePaymentInvoice);

const activity = {
	PAYMENT_CREATE_NEW_PAY_REQUEST: {
		key: '/pay/request',
		exact: true,
	},
	PAYMENT_APPROVE_NEW_PAY_REQUEST: {
		key: '/pay/request/{id}/approve',
		exact: true,
	},
	PAYMENT_DECLINE_NEW_PAY_REQUEST: {
		key: '/pay/request/{id}/decline',
		exact: true,
	},
	PAYMENT_REPORT_ERROR_NEW_PAY_REQUEST: {
		key: '/pay/request/{id}/reportError',
		exact: true,
	},
	PAYMENT_DELETE_NEW_PAY_REQUEST: {
		key: '/pay/request/{id}',
		exact: true,
		method: 'DELETE',
	},
	PAYMENT_CATEGORY_CREATE: {
		key: '/category',
		exact: true,
	},
	PAYMENT_CATEGORY_UPDATE: {
		key: '/category/{id}',
		method: 'PUT',
		exact: true,
	},
	PAYMENT_CREDIT_ACCOUNT_CREATE: {
		key: '/pay/account',
		exact: true,
	},
	PAYMENT_CREDIT_ACCOUNT_UPDATE: {
		key: '/pay/account/{id}',
		exact: true,
		method: 'PUT',
	},
	PAYMENT_CREDIT_ACCOUNT_DELETE: {
		key: '/pay/account/{id}',
		exact: true,
		method: 'DELETE',
	},
	PAYMENT_INVOICE_UPDATE: {
		key: '/{id}/invoice',
		method: 'PUT',
		exact: true,
	},
	PAYMENT_QUICK_CREATE: {
		key: '/quickCreate',
		exact: true,
	},
	PAYMENT_PREPAID_CREATE: {
		key: '/prepaid',
		exact: true,
	},
	PAYMENT_PREPAID_UPDATE: {
		key: '/prepaid/{id}',
		method: 'PUT',
		exact: true,
	},
	PAYMENT_PREPAID_DELETE: {
		key: '/prepaid/{id}',
		method: 'DELETE',
		exact: true,
	},
	PAYMENT_PREPAID_CONFIRM: {
		key: '/prepaid/confirmed/{id}',
		exact: true,
	},
	PAYMENT_PREPAID_CONFIRM_UNDO: {
		key: '/prepaid/confirmed/{id}/undo',
		exact: true,
	},
	PAYMENT_EXPORT_CONFIRM: {
		key: '/export/confirmed/{id}',
		exact: true,
	},
	PAYMENT_EXPORT_CONFIRM_UNDO: {
		key: '/export/confirmed/{id}/undo',
		exact: true,
	},
	PAYMENT_EXPORT_CLONE: {
		key: '/export/{id}/clone',
		exact: true,
	},
	PAYMENT_RESEND_CONFIRMATION: {
		key: '/{id}/reSendConfirmation',
	},
	PAYMENT_GET_QR_REFUND: {
		key: '/refund/qr',
		exact: true,
	},
	PAYMENT_CONFIRM_REFUND: {
		key: '/refund/confirm',
		exact: true,
	},
	PAYMENT_CREATE: {
		key: '/',
		exact: true,
	},
	PAYMENT_UPDATE: {
		key: '/{id}',
		method: 'PUT',
		exact: true,
	},
	PAYMENT_DELETE: {
		key: '/{id}',
		method: 'PUT',
		exact: true,
	},
};

module.exports = { router, activity };

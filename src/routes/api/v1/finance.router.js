const _ = require('lodash');
const fileUpload = require('express-fileupload');

const { PayoutType, OTAs, RESOURCE_FILE_TYPE, RESOURCE_FILE_STATUS } = require('@utils/const');
const router = require('@core/router').Router();
const models = require('@models');
const Payout = require('@controllers/finance/payout');
const PayoutGroup = require('@controllers/finance/payoutGroup');
const PayoutUtils = require('@controllers/finance/utils');
const Report = require('@controllers/finance/report');
const GroupImport = require('@controllers/finance/payoutGroupImport');
const GroupExport = require('@controllers/finance/payoutGroupExport');
const PayoutSync = require('@controllers/finance/sync');
const OnlinePayment = require('@controllers/client/payment');
const CashFlow = require('@controllers/finance/flow');
const DCashFlow = require('@controllers/finance/flow/debug');
const PayoutAuto = require('@controllers/finance/payoutGroupAuto');
const VatExport = require('@controllers/finance/vatExport');
const PaymentCollection = require('@controllers/finance/collection');
const { uploadFileData } = require('@controllers/resource/upload');
const PaymentCharge = require('@controllers/finance/payment/api');

function setReqReportData(req, data) {
	if (data && data.blockIds && data.blockIds[0]) {
		_.set(req, ['logData', 'blockId'], data.blockIds[0]);
	}
}

async function getRevenues(req, res) {
	const { blocks, rooms, state, checkInDate, checkOutDate, showSMS, ...query } = req.query;

	const revenues = await Payout.getRevenues(
		{
			roomIds: rooms,
			blockIds: blocks,
			states: state,
			checkInDate: checkInDate === 'true',
			checkOutDate: checkOutDate === 'true',
			includeCanceled: true,
			showIgnoreFinance: true,
			showSMS: showSMS === 'true',
			...query,
		},
		req.decoded.user
	);

	res.sendData(revenues);
}

async function getUnpaid(req, res) {
	const { blocks, rooms, ...query } = req.query;

	const revenues = await Payout.getUnPaid(
		{
			roomIds: rooms,
			blockIds: blocks,
			...query,
		},
		req.decoded.user
	);

	res.sendData(revenues);
}

async function getStats(req, res) {
	const stats = await Payout.getStats(req.query, req.decoded.user);

	res.sendData({ stats });
}

async function analyticReservations(req, res) {
	const stats = await Payout.analyticReservations(req.query, req.decoded.user);

	res.sendData({ stats });
}

async function getReport(req, res) {
	const { period, blockId, ota = OTAs.Booking } = req.query;

	const report = await Payout.getReport(period, blockId, ota);

	res.sendData(report);
}

async function fetchPayout(req, res) {
	const { from, to, ota, blockId } = req.query;
	await PayoutSync.fetchPayout(ota, from && new Date(from), to && new Date(to), blockId);
	res.sendData();
}

async function getOccupancy(req, res) {
	const data = await PayoutUtils.getOccupancy(req.query);
	res.sendData(data);
}

async function getReservations(req, res) {
	const data = await Payout.getReservations(req.decoded.user, req.query);
	res.sendData(data);
}

async function getPayoutExports(req, res) {
	const data = await PayoutGroup.getPayoutExports(req.query, req.decoded.user);
	res.sendData(data);
}

async function createPayoutExport(req, res) {
	const exports = await PayoutGroup.createPayoutExport(req.body, req.decoded.user);

	setReqReportData(req, exports);

	res.sendData({ exports });
}

async function getPayoutExportDetail(req, res) {
	const revenues = await PayoutGroup.getPayoutExportDetail(req.params.id, req.decoded.user);
	res.sendData(revenues);
}

async function updatePayoutExportDetail(req, res) {
	const { id } = req.params;
	const exports = await PayoutGroup.updatePayoutExport(id, req.body, req.decoded.user);

	setReqReportData(req, exports);

	res.sendData({ exports: _.pick(exports, [..._.keys(req.body), 'currencyAmount']) });
}

async function confirmPayoutExport(req, res) {
	const report = await PayoutGroup.confirmPayoutExport({
		user: req.decoded.user,
		payoutId: req.params.id,
		payoutType: PayoutType.RESERVATION,
		undo: req.body.undo,
	});

	setReqReportData(req, report);

	res.sendData();
}

async function deletePayoutExport(req, res) {
	const report = await PayoutGroup.deletePayoutExport(req.params.id, req.decoded.user);

	setReqReportData(req, report);

	res.sendData();
}

async function printBillPayoutExport(req, res) {
	const { id } = req.params;
	const { billNo } = req.body;
	await PayoutGroup.printBill(id, billNo);
	res.sendData();
}

async function reportAll(req, res) {
	const data = await Report.reportAll(req.decoded.user, req.query);

	res.sendData(data);
}

async function getOnlinePayment(req, res) {
	const data = await models.PaymentRef.getReports(req.query, req.decoded.user);
	res.sendData(data);
}

async function getReservationsFee(req, res) {
	const data = await Report.getReservationsFee(req.query, req.decoded.user);

	res.sendData(data);
}

async function importPayoutExport(req, res) {
	const data = await GroupImport.importPayoutGroup(req.decoded.user, req.body, req.files && req.files.file);

	setReqReportData(req, data);

	res.sendData(data);
}

async function getPayoutExportMisaForm(req, res) {
	const { fileName, filePath } = await GroupExport.exportMisaPayoutGroup(req.params.id, req.decoded.user);

	res.setHeader('content-disposition', `attachment; filename=${fileName}`);
	res.sendFile(filePath);
}

async function checkOnlinePayment(req, res) {
	const data = await OnlinePayment.checkTransaction(req.params.id, req.decoded.user, req.language);
	res.sendData(data);
}

async function getCashFlow(req, res) {
	const data = await CashFlow.getCashFlow(req.query, req.decoded.user, req.language);
	res.sendData(data);
}

async function getCashFlowDetail(req, res) {
	const data = await CashFlow.getCashFlowDetail(req.query, req.decoded.user, req.language);
	res.sendData(data);
}

async function getCashFlowDetailv2(req, res) {
	const data = await CashFlow.getCashFlowDetailV2(req.query, req.decoded.user, req.language);
	res.sendData(data);
}

async function debugCashFlow(req, res) {
	const data = await DCashFlow.debugRevCashFlows(req.query, req.decoded.user, req.language);
	res.sendData(data);
}

async function syncAutoBank(req, res) {
	const data = await PayoutAuto.createAutoReports(req.query);
	res.sendData(data);
}

async function confirmAutoReports(req, res) {
	const data = await PayoutAuto.confirmAutoReports(req.query);
	res.sendData(data);
}

async function vatExport(req, res) {
	const { fileName, xlsxBuffer } = await VatExport.export(req.body, req.decoded.user);

	res.setHeader('content-disposition', `attachment; filename=${fileName}`);
	res.setHeader('Content-Type', 'application/vnd.ms-excel');
	res.send(xlsxBuffer);
}

async function confirmAutoReportsWithFile(req, res) {
	const file = req.files && req.files.file;

	let data;

	if (file) {
		const { fileDoc, resource } = await uploadFileData({
			user: req.decoded.user,
			data: file.data,
			mimeType: file.mimetype,
			rootFolder: 'finance',
			resourceName: req.body.source,
			fileName: file.name,
			fileType: RESOURCE_FILE_TYPE.RECONCILIATION,
			fileStatus: RESOURCE_FILE_STATUS.WAITING,
		});

		data = await PayoutAuto.confirmAutoReportsWithFile({
			...req.body,
			user: req.decoded.user,
			fileDoc,
			resource,
		});
	} else if (req.body.fileId) {
		data = await PayoutAuto.autoFiles({
			...req.body,
		});
	}

	res.sendData(data);
}

async function getAwaitingCollections(req, res) {
	const data = await PaymentCollection.getPaymentCollections(req.decoded.user, req.query);

	res.sendData(data);
}

async function getOTACollections(req, res) {
	const data = await PaymentCollection.getSupportOTAs(req.decoded.user, req.query);

	res.sendData(data);
}

async function confirmAwaitingCollections(req, res) {
	const data = await PaymentCollection.confirmAwaitingCollections(req.decoded.user, req.body);

	res.sendData(data);
}

async function updateCollectionCard(req, res) {
	const data = await PaymentCollection.updateCollectionCard(req.params.id, req.body, req.decoded.user);

	res.sendData(data);
}

async function getPayoutCard(req, res) {
	const data = await PayoutGroup.getPayoutExportCard(req.decoded.user, req.params.id);

	res.sendData(data);
}

async function publishInvoices(req, res) {
	const data = await VatExport.publishInvoices(req.decoded.user, req.body);

	res.sendData(data);
}

async function deleteInvoice(req, res) {
	const data = await VatExport.deleteInvoice({ user: req.decoded.user, iKey: req.params.iKey });

	res.sendData(data);
}

async function getBookingCard(req, res) {
	const data = await PaymentCharge.getBookingCard(req.data.booking, req.body, req.decoded.user);

	res.sendData(data);
}

async function createBookingCard(req, res) {
	const data = await PaymentCharge.createBookingCard(req.data.booking, req.body, req.decoded.user);

	res.sendData(data);
}

async function retrieveBookingCard(req, res) {
	const data = await PaymentCharge.retrieveBookingCard(req.data.booking, req.decoded.user);

	res.sendData(data);
}

async function markInvalidBookingCard(req, res) {
	const data = await PaymentCharge.markInvalidCard(req.data.booking, req.decoded.user);

	res.sendData(data);
}

async function chargeBookingCard(req, res) {
	const data = await PaymentCharge.chargeBookingCard(req.data.booking, req.body, req.decoded.user);

	res.sendData(data);
}

async function refundBookingCard(req, res) {
	const data = await PaymentCharge.refundBookingCard(req.data.booking, req.body, req.decoded.user);

	res.sendData(data);
}

async function getBookingCharge(req, res) {
	const data = await PaymentCharge.getChargeBookings(req.query, req.decoded.user);

	res.sendData(data);
}

// async function updateBookingStatus(req, res) {
// 	const data = await PaymentCharge.updateBookingChargeStatus(req.data.booking, req.body, req.decoded.user);

// 	res.sendData(data);
// }

async function getBookingChargePaymentUrl(req, res) {
	const data = await PaymentCharge.getPaymentUrl(req.data.booking, req.query, req.decoded.user);

	res.sendData(data);
}

async function getKovenaPayments(req, res) {
	const data = await PaymentCharge.getPayments(req.query);

	res.sendData(data);
}

async function getKovenaPayment(req, res) {
	const data = await PaymentCharge.getPayment(req.params.id);

	res.sendData(data);
}

async function getKovenaTransactions(req, res) {
	await PaymentCharge.getTransactions(req, res);
}

async function getKovenaTransaction(req, res) {
	const data = await PaymentCharge.getTransaction(req.params.id);

	res.sendData(data);
}

async function getKovenaPayouts(req, res) {
	await PaymentCharge.getPayouts(req, res);
}

router.getS('/flow/cash', getCashFlow);
router.getS('/flow/cash/debug', debugCashFlow);
router.getS('/flow/cash/detail', getCashFlowDetail);
router.getS('/flow/cash/group', getCashFlowDetailv2);
router.getS('/revenue', getRevenues, true);
router.getS('/onlinePayment/report', getOnlinePayment, true);
router.postS('/onlinePayment/:id/check', checkOnlinePayment);
router.getS('/revenue/stats', getStats, true);
router.getS('/revenue/analytic', analyticReservations, true);
router.getS('/revenue/report', getReport, true);
router.getS('/unpaid', getUnpaid, true);
router.getS('/occupancy', getOccupancy, true);
router.getS('/reservations', getReservations, true);
router.postS('/fetch', fetchPayout, true);
router.getS('/export', getPayoutExports, true);
router.postS('/export/vat', vatExport, true);
router.getS('/export/:id', getPayoutExportDetail, true);
router.postS('/export/:id/viewCard', getPayoutCard, true);
router.getS('/export/:id/misa', getPayoutExportMisaForm, true);
router.putS('/export/:id', updatePayoutExportDetail, true);
router.deleteS('/export/:id', deletePayoutExport, true);
router.postS('/export', createPayoutExport, true);
router.postS('/export/confirmed/:id', confirmPayoutExport, true);
router.postS('/export/bill/:id', printBillPayoutExport, true);
router.postS('/export/bankAuto/sync', syncAutoBank, true);
router.postS('/export/bankAuto/confirm', confirmAutoReports, true);
router.postS(
	'/export/bankAuto/file/confirm',
	fileUpload({
		useTempFiles: false,
		abortOnLimit: true,
		createParentPath: true,
		debug: true,
		limits: { fileSize: 5 * 1024 * 1024 },
	}),
	confirmAutoReportsWithFile
);

router.getS('/reportAll', reportAll, true);
router.getS('/reservations/fee', getReservationsFee);
router.postS(
	'/import',
	fileUpload({
		useTempFiles: false,
		abortOnLimit: true,
		createParentPath: true,
		limits: { fileSize: 5 * 1024 * 1024 },
	}),
	importPayoutExport
);

router.getS('/collection/otas', getOTACollections);
router.getS('/collection/awaiting', getAwaitingCollections);
router.postS('/collection/awaiting', confirmAwaitingCollections);
router.putS('/collection/card/:id', updateCollectionCard);

router.postS('/invoice/publish', publishInvoices);
router.deleteS('/invoice/:iKey', deleteInvoice);

router.getS('/booking/charge/list', getBookingCharge);
router.postS('/booking/charge/:bookingId/viewCard', getBookingCard);
router.postS('/booking/charge/:bookingId/addCard', createBookingCard);
router.postS('/booking/charge/:bookingId/retrieveCard', retrieveBookingCard);
router.postS('/booking/charge/:bookingId/markInvalidCard', markInvalidBookingCard);
router.getS('/booking/charge/:bookingId/paymentUrl', getBookingChargePaymentUrl);
router.postS('/booking/charge/:bookingId', chargeBookingCard);
router.postS('/booking/charge/:bookingId/refund', refundBookingCard);
// router.putS('/booking/charge/:bookingId/autoCancel', updateBookingStatus);

router.getS('/booking/charge/report/payments', getKovenaPayments);
router.getS('/booking/charge/report/payments/:id', getKovenaPayment);
router.getS('/booking/charge/report/transactions', getKovenaTransactions);
router.getS('/booking/charge/report/transactions/:id', getKovenaTransaction);
router.getS('/booking/charge/report/payouts', getKovenaPayouts);

const activity = {
	FINANCE_EXPORT_CONFIRM: {
		key: '/export/confirmed/{id}',
		exact: true,
	},
	FINANCE_EXPORT_BILL: {
		key: '/export/bill/{id}',
		exact: true,
	},
	FINANCE_EXPORT_CREATE: {
		key: '/export',
		exact: true,
	},
	FINANCE_EXPORT_UPDATE: {
		key: '/export/{id}',
		method: 'PUT',
		exact: true,
	},
	FINANCE_EXPORT_DELETE: {
		key: '/export/{id}',
		method: 'DELETE',
		exact: true,
	},
	FINANCE_REPORT_IMPORT: {
		key: '/import',
		exact: true,
	},
	FINANCE_PAYMENT_SYNC: {
		key: '/fetch',
		exact: true,
	},
	FINANCE_VIEW_COLLECTION_CARD: {
		key: '/export/{id}/viewCard',
		exact: true,
	},
	FINANCE_CONFIRM_OTA_COLLECTION: {
		key: '/collection/awaiting',
		exact: true,
	},
	FINANCE_UPDATE_COLLECTION_CARD: {
		key: '/collection/card/{id}',
		exact: true,
		method: 'PUT',
	},
	FINANCE_NVOICE_PUBLISH_: {
		key: '/invoice/publish',
		exact: true,
	},
	FINANCE_INVOICE_DELETE: {
		key: '/invoice/{id}',
		method: 'DELETE',
		exact: true,
	},
	FINANCE_BOOKING_CARD_VIEW: {
		key: '/booking/charge/{id}/viewCard',
		exact: true,
	},
	FINANCE_BOOKING_CARD_ADD: {
		key: '/booking/charge/{id}/addCard',
		exact: true,
	},
	FINANCE_BOOKING_CARD_RETRIEVE: {
		key: '/booking/charge/{id}/retrieveCard',
		exact: true,
	},
	FINANCE_BOOKING_CARD_MARK_INVALID: {
		key: '/booking/charge/{id}/markInvalidCard',
		exact: true,
	},
	FINANCE_BOOKING_CARD_CHARGE: {
		key: '/booking/charge/{id}',
		exact: true,
	},
	FINANCE_BOOKING_CARD_REFUND: {
		key: '/booking/charge/{id}/refund',
		exact: true,
	},
};

module.exports = { router, activity };

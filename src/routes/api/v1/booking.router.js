const mongoose = require('mongoose');
const _ = require('lodash');

const { LocalOTA } = require('@utils/const');
const { formatPrice } = require('@utils/func');
const ThrowReturn = require('@core/throwreturn');
const router = require('@core/router').Router();
const models = require('@models');

const BookingAction = require('@controllers/booking/action');
const Booking = require('@controllers/booking');
const Contract = require('@controllers/booking/contract');
const Invoice = require('@controllers/booking/invoice');
const ServiceFee = require('@controllers/booking/service_fee');
const Guide = require('@controllers/booking/guide');
const History = require('@controllers/booking/history');
const Automation = require('@controllers/booking/automation');
const CS = require('@controllers/booking/newcs');
const Problem = require('@controllers/booking/problem');
const Mail = require('@controllers/booking/mail');
const Pricing = require('@controllers/booking/pricing');
const RFIDCard = require('@controllers/lock/RFID');
const PaymentCharge = require('@controllers/finance/payment/api');

async function updateBookingData(req, res) {
	const { booking } = req.data;

	booking.$locals.user = req.decoded.user;

	await booking.updateInfo({ data: req.body, userId: req.decoded.user._id });

	res.sendData({ booking: _.pick(booking, _.keys(req.body)) });
}

async function getBookings(req, res) {
	const data = await Booking.getBookings(req.query, req.decoded.user);

	res.sendData(data);
}

async function updateBookingPrice(req, res) {
	const data = await Pricing.updateBookingPrice({
		...req.body,
		user: req.decoded.user,
		booking: req.data.booking,
	});

	res.sendData(data);
}

async function updateBookingCommission(req, res) {
	const { otaFee } = req.body;
	const { booking } = req.data;

	const data = await Booking.updateBookingCommission({
		user: req.decoded.user,
		otaFee,
		booking,
	});

	res.sendData(data);
}

async function checkin(req, res) {
	const booking = await BookingAction.checkin({
		...req.body,
		booking: req.data.booking,
		user: req.decoded.user,
	});

	res.sendData({ booking: _.pick(booking, ['checkin']) });
}

async function checkinAll(req, res) {
	const { blockId } = req.body;
	const { user } = req.decoded;

	const data = await BookingAction.checkinAll({ user, blockId });

	res.sendData(data);
}

async function checkout(req, res) {
	const booking = await BookingAction.checkout({
		...req.body,
		booking: req.data.booking,
		user: req.decoded.user,
	});

	res.sendData({ booking: _.pick(booking, ['checkout']) });
}

async function getAdminBookingGuide(req, res) {
	const booking = await Guide.getBookingGuide(req.data.booking, req.query.roomId);

	res.sendData({ booking });
}

async function getBookingGuide(req, res) {
	const data = await Guide.getPublicGuide(req.params.bookingId, req.query.roomId);

	res.sendData(data);
}

async function createHistory(req, res) {
	const data = await History.createHistory({
		body: req.body,
		user: req.decoded.user,
		booking: req.data.booking,
	});

	res.sendData(data);
}

async function updateHistory(req, res) {
	const data = await History.updateHistory({
		body: req.body,
		user: req.decoded.user,
		booking: req.data.booking,
		historyId: req.params.historyId,
	});

	res.sendData(data);
}

async function removeHistory(req, res) {
	const data = await History.removeHistory({
		user: req.decoded.user,
		booking: req.data.booking,
		historyId: req.params.historyId,
	});

	res.sendData(data);
}

async function getBooking(req, res) {
	const data = await Booking.getBooking(req.data.booking);

	res.sendData(data);
}

async function disableAuto(req, res) {
	const data = await Automation.changeAutoMessages(req.data.booking, req.body);

	res.sendData(data);
}

async function bookingAutoMessages(req, res) {
	const data = await Automation.getAutoMessages(req.data.booking);

	res.sendData(data);
}

async function createBookingPayout(req, res) {
	const { body, decoded, data } = req;
	const { booking } = data || {};

	if (booking) {
		body.blockIds = [booking.blockId];
		body.otaName = booking.otaName;
		body.otaBookingId = booking.otaBookingId;
		body.bookingId = booking._id;
	} else if (body.blockIds && mongoose.Types.ObjectId.isValid(body.blockIds[0])) {
		_.set(req, ['logData', 'blockId'], body.blockIds[0]);
	}

	body.otaName = body.otaName || LocalOTA;
	const payout = await models.Payout.createBookingPayout(decoded.user, body);

	res.sendData(payout);
}

async function updateBookingPayout(req, res) {
	const {
		body,
		params: { paidId },
	} = req;

	const payout = await models.Payout.findById(paidId);
	const data = await models.Payout.updatePayout(payout, body, req.decoded.user);

	res.sendData(_.pick(data, _.keys(body)));
}

async function deleteBookingPayout(req, res) {
	const payout = await models.Payout.findById(req.params.paidId);
	const data = await models.Payout.deletePayout(payout, req.decoded.user);

	res.sendData(data);
}

async function getNotifications(req, res) {
	const data = await Booking.getNotifications(req.decoded.user);

	res.sendData(data);
}

async function ignoreError(req, res) {
	const { booking } = req.data;

	booking.ignoreError = true;
	await booking.save();

	res.sendData();
}

async function ignoreFinance(req, res) {
	const { booking } = req.data;
	const { ignore } = req.query;

	booking.ignoreFinance = ignore === 'true';
	await booking.save();

	res.sendData();
}

async function getInvoice(req, res) {
	const { bookingId } = req.params;
	const { booking, serviceFees } = await Invoice.getInvoice(bookingId);
	res.sendData({ booking, serviceFees });
}

async function getInvoiceHtml(req, res) {
	const { bookingId } = req.params;
	const rs = await Invoice.getInvoiceHtml(bookingId);
	res.send(rs);
}

async function sendInvoiceMessage(req, res) {
	const { bookingId } = req.params;
	await Invoice.sendInvoiceMessage(bookingId);
	res.sendData();
}

async function checkoutAll(req, res) {
	const { blockId, otas, bookingId, serviceType } = req.body;
	const { user } = req.decoded;

	const data = await BookingAction.checkoutAll({ user, blockId, otas, bookingId, serviceType });
	res.sendData(data);
}

async function markOTA(req, res) {
	const { booking } = req.data;
	const { markOnOTA } = req.body;
	const { user } = req.decoded;

	if (booking.markOnOTA && booking.markOnOTA.time && markOnOTA) {
		throw new ThrowReturn('Đặt phòng đã được đánh dấu trước đó!');
	}

	booking.markOnOTA = markOnOTA
		? {
				time: new Date(),
				by: user._id,
		  }
		: null;

	await booking.save();

	res.sendData({
		markOnOTA:
			booking.markOnOTA && booking.markOnOTA.time
				? {
						...booking.markOnOTA,
						by: _.pick(user, '_id', 'name', 'username'),
				  }
				: null,
	});
}

async function addInvoice(req, res) {
	const { booking } = req.data;
	await Invoice.uploadInvoice(booking, req.body.urls, req.decoded.user);
	res.sendData();
}

async function updateCheckinAndOut(req, res) {
	const { fromHour, toHour } = req.body;
	const { booking } = req.data;
	await Booking.updateCheckinAndOut({ booking, fromHour, toHour, userId: req.decoded.user._id });
	res.sendData();
}

// Contract
async function getContract(req, res) {
	const { booking } = req.data;
	const contract = await models.BookingContract.findOne({ bookingIds: booking._id })
		.populate('histories.by', 'username name')
		.populate({
			path: 'bookingIds',
			select: 'otaBookingId guestId from to price status currency',
			populate: { path: 'guestId', select: 'displayName fullName name tags' },
		});
	res.sendData({ contract });
}

async function updateContractPrice(req, res) {
	const { booking } = req.data;

	await Contract.updatePrice(booking, req.body, req.decoded.user);

	res.sendData();
}

async function updateRange(req, res) {
	const { booking } = req.data;
	await Contract.updateRange(booking, req.body, req.decoded.user);
	res.sendData();
}

async function cancelContract(req, res) {
	const { booking } = req.data;
	await Contract.cancelContract(booking, req.body, req.decoded.user);
	res.sendData();
}

async function changeRoom(req, res) {
	const { booking } = req.data;
	await Contract.changeRoom(booking, req.body, req.decoded.user);
	res.sendData();
}

// Service Fee
async function createServiceFee(req, res) {
	const rs = await ServiceFee.createServiceFee(req.decoded.user, req.body);
	res.sendData(rs);
}

async function getServiceFees(req, res) {
	const { bookingId, includeDeleted } = req.query;
	const serviceFees = await ServiceFee.getServiceFeesByBookingId(bookingId, includeDeleted === 'true');
	res.sendData(serviceFees);
}

async function updateServiceFee(req, res) {
	const rs = await ServiceFee.updateServiceFee(req.decoded.user, req.params.serviceFeeId, req.body);
	res.sendData(rs);
}

async function deleteServiceFee(req, res) {
	const { serviceFee, booking } = await ServiceFee.deleteServiceFee(req.decoded.user, req.params.serviceFeeId);

	_.set(req, ['logData', 'blockId'], serviceFee.blockId);
	_.set(req, ['logData', 'roomId'], serviceFee.roomId);
	_.set(req, ['logData', 'booking'], booking);

	res.sendData();
}

async function setBookingStatus(req, res) {
	const data = await CS.setBookingStatus(req.data.booking, req.body, req.decoded.user);
	res.sendData(data);
}

// Problem
async function createProblem(req, res) {
	const rs = await Problem.create(req.body, req.decoded.user);
	res.sendData(rs);
}

async function getProblems(req, res) {
	const problems = await Problem.getListByBookingId({ bookingId: req.params.bookingId, ...req.query });
	res.sendData(problems);
}

async function updateProblem(req, res) {
	const problem = await Problem.update(req.params.problemId, req.body, req.decoded.user);
	res.sendData({ problem });
}

async function deleteProblem(req, res) {
	await Problem.remove(req.params.problemId, req.decoded.user);
	res.sendData();
}

async function getConfirmationBookingMails(req, res) {
	const { booking } = req.data;
	const { otaBookingId, otaName, status } = booking;
	const mails = await Mail.getConfirmationBookings({ otaBookingId, otaName, status });
	res.sendData({ mails });
}

async function getBookingConfirmationMailHtml(req, res) {
	const { mailId } = req.params;
	const { booking } = req.data;
	const { _id, otaBookingId, otaName, status } = booking;
	const data = await Mail.getBookingConfirmationHtml({
		bookingId: _id,
		otaName,
		otaBookingId,
		status,
		mailId,
	});
	res.sendData(data);
}

async function deleteBookingConfirmationMail(req, res) {
	const { mailId } = req.params;
	const { booking } = req.data;
	await Mail.deleteBookingConfirmation({ otaBookingId: booking.otaBookingId, mailId });
	res.sendData();
}

async function listUpdatedBookings(req, res) {
	const data = await History.listUpdatedBookings(req.query, req.decoded.user);

	res.sendData(data);
}

async function getPreviousQuantity(req, res) {
	const data = await Booking.getPreviousQuantity(req.data.booking, req.query.type);
	res.sendData(data);
}

async function getContractTemplates(req, res) {
	const { booking } = req.data;
	const contractTemplates = await models.BookingContractTemplate.find({
		blockIds: { $in: [booking.blockId] },
	});
	res.sendData({ contractTemplates });
}

async function checkPrice(req, res) {
	const { booking } = req.data;

	const data = await Pricing.checkPrice({
		...req.query,
		user: req.decoded.user,
		booking,
	});

	res.sendData(data);
}

async function getRFIDCardInfo(req, res) {
	const data = await RFIDCard.getCardInfo({ ...req.query, ...req.data }, req.decoded.user);

	res.sendData(data);
}

async function writeRFIDCardInfo(req, res) {
	const data = await RFIDCard.writeCardInfo({ ...req.body, ...req.data }, req.decoded.user);

	res.sendData(data);
}

async function deleteRFIDCardInfo(req, res) {
	const data = await RFIDCard.deleteCardInfo({ ...req.body, ...req.data }, req.decoded.user);

	res.sendData(data);
}

async function chargeBookingCard(req, res) {
	const data = await PaymentCharge.chargeBookingCard(req.data.booking, req.body, req.decoded.user);

	res.sendData(data);
}

async function updateAutoCancelBooking(req, res) {
	const data = await PaymentCharge.updateBookingAutoCancelStatus(req.data.booking, req.body, req.decoded.user);

	res.sendData(data);
}

async function getCanChargeBookingAmount(req, res) {
	const data = await PaymentCharge.getCanChargeBookingAmount(req.data.booking, req.query, req.decoded.user);

	res.sendData(data);
}

async function updateBookingOTAName(req, res) {
	const data = await Booking.updateBookingOTAName({
		booking: req.data.booking,
		otaName: req.body.otaName,
		user: req.decoded.user,
	});

	res.sendData(data);
}

async function updateChargeBookingStatus(req, res) {
	const data = await PaymentCharge.updateBookingChargeStatus(req.data.booking, req.body, req.decoded.user);

	res.sendData(data);
}

router.getS('/service-fee', getServiceFees, true);
router.postS('/service-fee', createServiceFee, true);
router.putS('/service-fee/:serviceFeeId', updateServiceFee, true);
router.deleteS('/service-fee/:serviceFeeId', deleteServiceFee, true);

router.getS('/filter', getBookings, true);
router.getS('/notification', getNotifications, true);

router.postS('/checkin/:bookingId', checkin, true);
router.postS('/checkout/:bookingId', checkout, true);
router.postS('/checkoutAll', checkoutAll, true);
router.postS('/checkinAll', checkinAll, true);

router.getS('/history/updated', listUpdatedBookings, true);
router.postS('/history/:bookingId', createHistory, true);
router.putS('/history/:bookingId/:historyId', updateHistory, true);
router.deleteS('/history/:bookingId/:historyId', removeHistory, true);

router.getS('/adminGuide/:bookingId', getAdminBookingGuide, true);
router.getS('/guide/:bookingId', getBookingGuide, false);

router.postS('/paid/:bookingId', createBookingPayout, true);
router.putS('/paid/:bookingId/:paidId', updateBookingPayout, true);
router.deleteS('/paid/:bookingId/:paidId', deleteBookingPayout, true);

router.putS('/update/:bookingId', updateBookingData, true);
router.putS('/update/:bookingId/price', updateBookingPrice, true);
router.putS('/update/:bookingId/commission', updateBookingCommission);
router.putS('/update/:bookingId/checkinAndOut', updateCheckinAndOut, true);
router.putS('/update/:bookingId/price', updateBookingPrice, true);

router.postS('/problem', createProblem, true);
router.putS('/problem/:problemId', updateProblem, true);
router.deleteS('/problem/:problemId', deleteProblem, true);
router.getS('/:bookingId/problem', getProblems, true);

router.getS('/:bookingId', getBooking, true);
router.getS('/:bookingId/previous-quantity', getPreviousQuantity, true);
router.postS('/:bookingId/ignoreError', ignoreError, true);
router.postS('/:bookingId/ignoreFinance', ignoreFinance, true);
router.getS('/:bookingId/contract', getContract, true);
router.postS('/:bookingId/contract/price', updateContractPrice, true);
router.postS('/:bookingId/contract/range', updateRange, true);
router.postS('/:bookingId/contract/change-room', changeRoom, true);
router.postS('/:bookingId/contract/canceled', cancelContract, true);
router.getS('/:bookingId/contractTemplates', getContractTemplates, true);
router.getS('/:bookingId/contract/download/:id', Booking.downloadBookingContract, true);

router.getS('/:bookingId/mail', getConfirmationBookingMails, true);
router.getS('/:bookingId/mail/:mailId', getBookingConfirmationMailHtml, true);
router.deleteS('/:bookingId/mail/:mailId', deleteBookingConfirmationMail, true);

router.getS('/:bookingId/invoice', getInvoice, true);
router.getS('/:bookingId/invoice/send-message', sendInvoiceMessage, true);
router.getS('/:bookingId/invoice/html', getInvoiceHtml, false);
router.postS('/:bookingId/invoice', addInvoice, true);

router.postS('/:bookingId/mark', markOTA);
router.postS('/:bookingId/status', setBookingStatus);
router.getS('/:bookingId/checkPrice', checkPrice);

router.getS('/:bookingId/RFID/cardInfo', getRFIDCardInfo);
router.postS('/:bookingId/RFID/card', writeRFIDCardInfo);
router.deleteS('/:bookingId/RFID/card', deleteRFIDCardInfo);

router.putS('/:bookingId/otaName', updateBookingOTAName);

router.getS('/:bookingId/auto', bookingAutoMessages, true);
router.postS('/:bookingId/disable_auto', disableAuto, true);

router.getS('/:bookingId/charge/amount', getCanChargeBookingAmount);
router.postS('/:bookingId/charge', chargeBookingCard);
router.postS('/:bookingId/charge/autoCancel', updateAutoCancelBooking);
router.putS('/:bookingId/charge/status', updateChargeBookingStatus);

const activity = {
	BOOKING_UPDATE: {
		exact: true,
		key: '/update/{id}',
		method: 'PUT',
	},
	BOOKING_UPDATE_PRICE: {
		exact: true,
		key: '/update/{id}/price',
		method: 'PUT',
	},
	BOOKING_UPDATE_COMMISSION: {
		exact: true,
		key: '/update/{id}/commission',
		method: 'PUT',
	},
	BOOKING_CHECKIN: {
		key: '/checkin/{id}',
		exact: true,
	},
	BOOKING_CHECKOUT: {
		key: '/checkout/{id}',
		exact: true,
	},
	BOOKING_UPDATE_CHECKIN_AND_CHECKOUT: {
		exact: true,
		key: '/update/{id}/checkinAndOut',
		method: 'PUT',
	},
	BOOKING_ADD_NOTE: {
		key: '/history/{id}',
		exact: true,
	},
	BOOKING_UPDATE_NOTE: {
		key: '/history/{id}/{id}',
		method: 'PUT',
		exact: true,
	},
	BOOKING_DELETE_NOTE: {
		key: '/history/{id}/{id}',
		method: 'DELETE',
		exact: true,
	},
	BOOKING_ADD_PAYOUT: {
		key: '/paid/{id}',
		exact: true,
		raw: async (req, data) => {
			const booking = data.bookingId;
			const otaDoc = data.otaName && (await models.BookingSource.findOne({ name: data.otaName }));

			return {
				rawText: [
					`Tạo thanh toán ${otaDoc ? otaDoc.label : data.otaName || ''}.`,
					`Số tiền ${formatPrice(data.currencyAmount.exchangedAmount)}.`,
					booking && `Mã đặt phòng ${booking.otaBookingId}.`,
				].join(' '),
			};
		},
	},
	BOOKING_UPDATE_PAYOUT: {
		key: '/paid/{id}/{id}',
		method: 'PUT',
		exact: true,
		raw: async (req, data) => {
			const booking = data.bookingId;
			const otaDoc = data.otaName && (await models.BookingSource.findOne({ name: data.otaName }));

			return {
				rawText: [
					`Cập nhật thanh toán ${otaDoc ? otaDoc.label : data.otaName || ''}.`,
					`Số tiền ${formatPrice(data.currencyAmount.exchangedAmount)}.`,
					booking && `Mã đặt phòng ${booking.otaBookingId}.`,
				].join(' '),
			};
		},
	},
	BOOKING_DELETE_PAYOUT: {
		key: '/paid/{id}/{id}',
		method: 'DELETE',
		exact: true,
		raw: async (req, data) => {
			const booking = _.get(req.data, 'booking');
			const otaDoc = data.otaName && (await models.BookingSource.findOne({ name: data.otaName }));

			return {
				rawText: [
					`Xoá thanh toán ${otaDoc ? otaDoc.label : data.otaName || ''}.`,
					`Số tiền ${formatPrice(data.currencyAmount.exchangedAmount)}.`,
					booking && `Mã đặt phòng ${booking.otaBookingId}.`,
				].join(' '),
			};
		},
	},
	BOOKING_IGNORE_FINANCE: {
		key: '/{id}/ignoreFinance',
		exact: true,
		method: 'POST',
	},
	BOOKING_MESSAGE_AUTO: {
		key: '/{id}/disable_auto',
		exact: true,
		method: 'POST',
	},
	CONTRACT_UPDATE: {
		key: '/{id}/contract/price',
		exact: true,
		method: 'POST',
	},
	CONTRACT_UPDATE_RANGE: {
		key: '/{id}/contract/range',
		exact: true,
		method: 'POST',
	},
	CONTRACT_UPDATE_ROOM: {
		key: '/{id}/contract/change-room',
		exact: true,
		method: 'POST',
	},
	CONTRACT_CANCELED: {
		key: '/{id}/contract/canceled',
		exact: true,
		method: 'POST',
	},
	BOOKING_CHECKOUT_ALL: {
		key: '/checkoutAll',
		exact: true,
	},
	BOOKING_CHECKIN_ALL: {
		key: '/checkinAll',
		exact: true,
	},
	BOOKING_MARK: {
		key: '/{id}/mark',
		exact: true,
	},
	BOOKING_ADD_INVOICE: {
		key: '/{id}/invoice',
		exact: true,
	},
	BOOKING_CHANGE_STATUS: {
		key: '/{id}/status',
		exact: true,
	},
	SERVICE_FEE_CREATE: {
		key: '/service-fee',
		exact: true,
	},
	SERVICE_FEE_UPDATE: {
		key: '/service-fee/{id}',
		method: 'PUT',
		exact: true,
	},
	SERVICE_FEE_DELETE: {
		key: '/service-fee/{id}',
		method: 'DELETE',
		exact: true,
		raw: req => {
			const booking = _.get(req.logData, 'booking');
			return {
				rawText: [`Xoá phí dịch vụ dài hạn.`, booking && `Mã đặt phòng ${booking.otaBookingId}.`].join(' '),
			};
		},
	},
	BOOKING_PROBLEM_CREATE: {
		key: '/problem',
		exact: true,
	},
	BOOKING_PROBLEM_UPDATE: {
		key: '/problem/{id}',
		exact: true,
		method: 'PUT',
	},
	BOOKING_PROBLEM_DELETE: {
		key: '/problem/{id}',
		method: 'DELETE',
		exact: true,
	},
	BOOKING_MAIL_DELETE: {
		key: '/{id}/mail/{id}',
		method: 'DELETE',
		exact: true,
	},
	BOOKING_RFID_CARD_WRITE: {
		key: '/{id}/RFID/card',
		exact: true,
	},
	BOOKING_RFID_CARD_DELETE: {
		key: '/{id}/RFID/card',
		method: 'DELETE',
		exact: true,
	},
	BOOKING_CHARGE_PAYMENT: {
		key: '/{id}/charge',
		exact: true,
	},
	BOOKING_UPDATE_AUTO_CANCEL: {
		key: '/{id}/charge/autoCancel',
		exact: true,
	},
	BOOKING_CHARGE_STATUS_UPDATE: {
		key: '/{id}/charge/status',
		method: 'PUT',
		exact: true,
	},
	BOOKING_UPDATE_OTA: {
		key: '/{id}/otaName',
		method: 'PUT',
		exact: true,
	},
};

module.exports = { router, activity };

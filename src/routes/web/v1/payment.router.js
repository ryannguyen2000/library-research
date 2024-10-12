const _ = require('lodash');
const router = require('@core/router').Publish();
const { USER_SYS_NAME } = require('@utils/const');
const payment = require('@controllers/client/payment');
const kovenaPayment = require('@controllers/finance/payment/api');

async function createPayment(req, res) {
	const { data, paymentRef } = await payment.createPayment({
		...req.body,
		ip: req.ip,
		language: req.language,
	});

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', paymentRef.blockId);

	res.sendData(data);
}

async function processIPNVnpay(req, res) {
	const data = await payment.processIPNVnpay(req.query, req.language);
	res.json(data);
}

async function processIPNMomo(req, res) {
	const data = await payment.processIPNMomo(req.body, req.language);
	res.json(data);
}

async function processIPNAppotapay(req, res) {
	const data = await payment.processIPNAppotapay(req.body, req.language);
	res.json(data);
}

async function processIPNKovena(req, res) {
	const data = await payment.processIPNKovena(req.body, req.query, req.language);
	res.json(data);
}

async function processIPNNeopay(req, res) {
	const data = await payment.processIPNNeopay(req.body, req.language);
	res.json(data);
}

async function getPaymentStatus(req, res) {
	const data = await payment.getPaymentStatus(req.query, req.language);
	res.json(data);
}

async function getBankInfo(req, res) {
	const data = await payment.getBankInfo(req.query, req.language);
	res.sendData(data);
}

async function getServiceFee(req, res) {
	const data = await payment.getServiceFee(req.query, req.language);
	res.sendData(data);
}

async function onKovenaTokenize(req, res) {
	const data = await kovenaPayment.onReceivedTokenize(req.body);
	res.sendData(data);
}

router.getS('/bank_info', getBankInfo);
router.getS('/service_fee', getServiceFee);
router.getS('/get_status', getPaymentStatus);
router.postS('/create_payment', createPayment);

router.getS('/vnpay_ipn_return', processIPNVnpay);
router.postS('/momo_ipn_return', processIPNMomo);
router.postS('/appotapay_ipn_return', processIPNAppotapay);
router.postS('/neopay_ipn_return', processIPNNeopay);

router.postS('/kovena_ipn_return', processIPNKovena);
router.getS('/kovena_ipn_return', processIPNKovena);
router.postS('/kovena_tokenize', onKovenaTokenize);

const activity = {
	CLIENT_GUEST_PAYMENT_ONLINE: {
		key: '/create_payment',
	},
};

module.exports = { router, activity };

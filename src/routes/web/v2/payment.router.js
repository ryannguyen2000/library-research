const _ = require('lodash');

const { USER_SYS_NAME } = require('@utils/const');
const router = require('@core/router').Publish();
const payment = require('@controllers/client/payment');

async function getServiceFee(req, res) {
	const data = await payment.getServiceFee(req.query, req.language);
	res.sendData(data);
}

async function getPaymentStatus(req, res) {
	const data = await payment.getPaymentStatus(req.query, req.language);

	res.json(data);
}

async function getBankInfo(req, res) {
	const data = await payment.getBankInfo(req.query, req.language);
	res.sendData(data);
}

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

router.getS('/serviceFee', getServiceFee);
router.getS('/bankInfo', getBankInfo);
router.getS('/status', getPaymentStatus);
router.postS('/', createPayment);

const activity = {
	CLIENT_GUEST_PAYMENT_ONLINE: {
		key: '/',
		exact: true,
	},
};

module.exports = { router, activity };

const _ = require('lodash');
const reservation = require('@controllers/client/reservation');
const router = require('@core/router').Publish();
const { USER_SYS_NAME } = require('@utils/const');

async function inquiry(req, res) {
	const { booking, ...data } = await reservation.inquiry(req.body, req.language);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', _.get(booking, 'blockId'));

	res.sendData(data);
}

async function inquiryDetail(req, res) {
	const { id } = req.params;

	const data = await reservation.inquiryDetail(id, req.language);

	res.sendData(data);
}

async function checkPassport(req, res) {
	const { guest, ...data } = await reservation.checkPassport(req.body, req.language);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', _.get(guest, ['blockIds', 0]));

	res.sendData(data);
}

async function sendCheckinData(req, res) {
	const guest = await reservation.sendCheckinData(req.body, req.language);

	_.set(req, 'logData.username', USER_SYS_NAME.GUEST);
	_.set(req, 'logData.blockId', _.get(guest, ['blockIds', 0]));

	res.sendData();
}

async function searchBookings(req, res) {
	const data = await reservation.searchBookings(req.query, req.language);
	res.sendData(data);
}

router.postS('/inquiry', inquiry);
router.postS('/checkPassport', checkPassport);
router.postS('/giveCheckinData', sendCheckinData);

router.getS('/inquiry/:id', inquiryDetail);
router.getS('/search', searchBookings);

const activity = {
	CLIENT_GUEST_INQUIRY: {
		key: '/inquiry',
	},
	CLIENT_GUEST_CHECK_PP: {
		key: '/checkPassport',
	},
	CLIENT_GUEST_SEND_CHECKIN_INFO: {
		key: '/giveCheckinData',
	},
};

module.exports = { router, activity };

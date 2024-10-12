const router = require('@core/router').Router();

const Auth = require('@controllers/user/auth');
const CallCenter = require('@controllers/user/call_center');

async function authenticate(req, res) {
	const data = await Auth.authenticate(req.body);

	res.sendData(data);
}

async function getMenus(req, res) {
	const data = await Auth.getMenus(req.decoded.user);

	res.sendData(data);
}

async function changePassword(req, res) {
	const data = await Auth.changePassword(req.decoded.user, req.body);

	res.sendData(data);
}

async function updateNotiKey(req, res) {
	const data = await Auth.updateNotificationKey(req.decoded.user, req.query);

	res.sendData(data);
}

async function getUserInfo(req, res) {
	const data = await Auth.getUserInfo(req.decoded.user);

	res.sendData(data);
}

async function updateUserInfo(req, res) {
	const data = await Auth.updateUserInfo(req.decoded.user, req.body);

	res.sendData(data);
}

async function getUsers(req, res) {
	const data = await Auth.getUsers(req.decoded.user, req.query);

	res.sendData(data);
}

async function getCCUsers(req, res) {
	const data = await CallCenter.getCCUsers(req.decoded.user, req.query);

	res.sendData(data);
}

async function orderCCUsers(req, res) {
	const data = await CallCenter.orderCCUsers(req.body);

	res.sendData(data);
}

async function updateCalling(req, res) {
	const data = await CallCenter.updateCCUser(req.params.userId, req.body);

	res.sendData(data);
}

async function getDepartments(req, res) {
	const data = await Auth.getDepartments(req.decoded.user);

	res.sendData(data);
}

router.getS('/', getUserInfo, true);
router.getS('/tabs', getMenus, true);
router.putS('/', updateUserInfo, true);

router.getS('/getManageUser', getUsers, true);
router.getS('/department', getDepartments, true);

router.putS('/noti', updateNotiKey, true);
router.postS('/auth', authenticate, false);
router.postS('/changePassword', changePassword, true);

router.getS('/calling', getCCUsers, true);
router.postS('/calling/order', orderCCUsers, true);
router.putS('/calling/:userId', updateCalling, true);

const activity = {
	USER_CHANGE_PASSWORD: {
		key: 'changePassword',
	},
	USER_UPDATE_INFO: {
		key: '/',
		exact: true,
		method: 'PUT',
	},
	USER_UPDATE_CALL_LIST: {
		key: '/calling',
		method: 'PUT',
	},
};

module.exports = { router, activity };

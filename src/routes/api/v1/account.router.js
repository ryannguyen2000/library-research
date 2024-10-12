const router = require('@core/router').Router();
const AccountManage = require('@controllers/user/manage');
const Activity = require('@controllers/user/activity');

async function addAccount(req, res) {
	const data = await AccountManage.createAccount(req.decoded.user, req.body);

	res.sendData(data);
}

async function changeRole(req, res) {
	const data = await AccountManage.changeAccountRole(req.decoded.user, req.data.user, req.body);

	res.sendData(data);
}

async function resetPassword(req, res) {
	const newPassword = await req.data.user.changePassword();

	res.sendData({ newPassword });
}

async function lockAccount(req, res) {
	const data = await AccountManage.lockAccount(req.params.userId, req.body);

	res.sendData(data);
}

async function getUserActivities(req, res) {
	const data = await Activity.getUserActivities(req.decoded.user, req.query);

	res.sendData(data);
}

async function getWorkSchedule(req, res) {
	const data = await AccountManage.getWorkingSchedules(req.query);

	res.sendData(data);
}

async function updateWorkSchedule(req, res) {
	const data = await AccountManage.updateWorkingSchedule(req.params.userId, req.body);

	res.sendData(data);
}

async function getActivitiyStatistics(req, res) {
	const data = await Activity.getActivitiyStatistics(req.decoded.user, req.query);
	res.sendData(data);
}

async function getDetailedActivitiyStatistic(req, res) {
	const data = await Activity.getDetailedActivitiyStatistic(req.decoded.user, req.query);
	res.sendData(data);
}

async function getWorkLog(req, res) {
	const data = await Activity.getWorkLog(req.decoded.user, req.query);
	res.sendData(data);
}

async function getWorkLogHistory(req, res) {
	const data = await Activity.getWorkLogHistory(req.query, req.decoded.user);
	res.sendData(data);
}

router.getS('/getActivity', getUserActivities, true);

router.putS('/', addAccount, true);
router.putS('/changRole/:userId', changeRole, true);
router.postS('/resetPassword/:userId', resetPassword, true);
router.postS('/lock/:userId', lockAccount, true);

router.getS('/workSchedule', getWorkSchedule);
router.getS('/workLog', getWorkLog);
router.getS('/workLogHistory', getWorkLogHistory);
router.getS('/activity-statistics', getActivitiyStatistics, true);
router.getS('/activity-statistics/detail', getDetailedActivitiyStatistic, true);
router.putS('/workSchedule/:userId', updateWorkSchedule);

const activity = {
	ACCOUNT_CREATE: {
		key: '/',
		exact: true,
		method: 'PUT',
	},
	ACCOUNT_CHANGE_ROLE: {
		key: 'changRole',
		method: 'PUT',
	},
	ACCOUNT_RESET_PASSWORD: {
		key: 'resetPassword',
	},
	ACCOUNT_LOCK: {
		key: 'lock',
	},
	WORK_SCHEDULE_UPDATE: {
		key: 'workSchedule',
		method: 'PUT',
	},
};

module.exports = { router, activity };

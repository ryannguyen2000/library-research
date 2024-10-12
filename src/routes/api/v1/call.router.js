const router = require('@core/router').Router();

const { access, getOnlineUsers } = require('@controllers/callCenter/agent');
const { getCallLogs, getCallLog, syncLogs, updateLogStatus } = require('@controllers/callCenter/log');
const models = require('@models');

async function sync(req, res) {
	const projects = await models.CallProject.find();

	await projects.asyncMap(project => syncLogs(project, req.body.fromStartTime));

	res.sendData();
}

router.getS('/access', access);
router.getS('/log', getCallLogs);
router.putS('/log/:id', updateLogStatus);
router.getS('/log/:id', getCallLog);
router.getS('/user/online', getOnlineUsers);
router.postS('/log/sync', sync);

module.exports = { router };

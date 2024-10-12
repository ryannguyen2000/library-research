// const crypto = require('crypto');
const router = require('express').Router();

// const { logger } = require('@utils/logger');
const { getAnswerUrl, getListAgents, getRecorded, processEventData } = require('@controllers/callCenter');
// const { apiKeySecret } = require('@services/stringee/const');

function onStringeeEvent(req, res) {
	// logger.info('onStringeeEvent -> req.body', req.body);

	processEventData(req.body);

	res.json({});
}

// function verifyRequestSignature(req, res, next) {
// 	try {
// 		const signature = req.get('X-STRINGEE-SIGNATURE') || req.get('HTTP_X_STRINGEE_SIGNATURE');
// 		if (!signature) {
// 			throw new Error('missing stringee request signature.');
// 		}
// 		const data = req.method === 'GET' ? req.originalUrl : req.rawBody;

// 		const expectedHash = crypto.createHmac('sha1', apiKeySecret).update(data).digest('base64');

// 		if (signature !== expectedHash) {
// 			logger.error(req.method, { data, expectedHash, signature });
// 			throw new Error("Couldn't validate the stringee request signature.");
// 		}

// 		next();
// 	} catch (e) {
// 		logger.error(e.toString());
// 		res.sendStatus(500);
// 	}
// }

router.get('/answer_url', getAnswerUrl);
router.post('/project_event_url', onStringeeEvent);
router.post('/list_agents', getListAgents);
router.get('/recorded/:id', getRecorded);

module.exports = { router };

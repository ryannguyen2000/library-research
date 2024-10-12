const express = require('express');
const crypto = require('crypto');
const _ = require('lodash');

const { FB_CONFIG } = require('@config/setting');
const ThrowReturn = require('@core/throwreturn');
const { logger } = require('@utils/logger');
const { getPage } = require('@services/facebook/messager');

const router = express.Router();

function verifyRequestSignature(req, res, next) {
	try {
		const signature = req.get('x-hub-signature');
		if (!signature) {
			throw new ThrowReturn('missing fb request signature.');
		}

		const [method, signatureHash] = signature.split('=');
		const expectedHash = crypto.createHmac('sha1', FB_CONFIG.WEBHOOK.APP_SECRET).update(req.rawBody).digest('hex');
		if (signatureHash !== expectedHash) {
			logger.error({ signatureHash, expectedHash });
			throw new ThrowReturn("Couldn't validate the fb request signature.");
		}

		next();
	} catch (e) {
		logger.error(e);
		res.sendStatus(500);
	}
}

function getWebhook(req, res) {
	if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === FB_CONFIG.WEBHOOK.VALIDATION_TOKEN) {
		res.status(200).send(req.query['hub.challenge']);
	} else {
		logger.error('Failed validation. Make sure the validation tokens match.');
		res.sendStatus(403);
	}
}

async function postWebhook(req, res) {
	try {
		const data = req.body;
		// logger.info('receive fb-webhook', typeof data === 'object' ? JSON.stringify(data, '', 4) : data);

		// Make sure this is a page subscription
		if (data.object === 'page') {
			// Iterate over each entry
			// There may be multiple if batched
			if (_.isArray(data.entry)) {
				await data.entry.asyncMap(pageEntry => {
					const page = getPage(pageEntry.id);
					if (page) {
						return page.onMessage(pageEntry);
					}
				});
			}

			// Assume all went well.
			// You must send back a 200, within 20 seconds, to let us know you've
			// successfully received the callback. Otherwise, the request will time out.
		}

		res.sendStatus(200);
	} catch (e) {
		logger.info(req.rawBody);
		logger.error(e);

		res.sendStatus(500);
	}
}

router.get('/', verifyRequestSignature, getWebhook);
router.post('/', verifyRequestSignature, postWebhook);

module.exports = { router };

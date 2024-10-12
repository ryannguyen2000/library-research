const express = require('express');

const { logger } = require('@utils/logger');
const { sha256 } = require('@utils/func');
const { onReceiveWebHook, onReceiveOauth } = require('@services/zalo/OA');
const models = require('@models');

const router = express.Router();

async function verifyRequestSignature(req, res, next) {
	try {
		const signature = req.get('x-zevent-signature');
		if (!signature) {
			throw new Error('not found signature');
		}

		const query = { zalo_oa: true };
		if (req.body.app_id) {
			query['zalo_oaInfo.appId'] = req.body.app_id;
		} else if (req.body.oa_id) {
			query['zalo_oaInfo.oaId'] = req.body.oa_id;
		}

		const config = await models.Ott.findOne(query);
		if (!config) {
			throw new Error('not found appId');
		}

		req.zaloOAConfig = config;

		if (global.isDev) return next();

		const { appId, oaSecretKey } = config.zalo_oaInfo;
		const [method, signatureHash] = signature.split('=');
		const hashText = `${appId}${req.rawBody}${req.body.timestamp}${oaSecretKey}`;
		const expectedHash = sha256(hashText);

		if (signatureHash !== expectedHash) {
			logger.error({ signatureHash, expectedHash, hashText });
			throw new Error("Couldn't validate the request signature.");
		}

		next();
	} catch (e) {
		logger.error("Couldn't validate the signature.", e, req.body);
		res.sendStatus(500);
	}
}

async function postWebhook(req, res) {
	try {
		await onReceiveWebHook(req.zaloOAConfig, req.body);
		res.sendStatus(200);
	} catch (e) {
		logger.error(e);
		res.sendStatus(500);
	}
}

async function verifyOauth(req, res) {
	try {
		const { oa_id, state } = req.query;

		const currentOA = await models.Ott.findOne({
			'zalo_oaInfo.oaId': oa_id,
			'zalo_oaInfo.oauthState': state,
		});
		if (!currentOA) {
			throw new Error(`Not found OA ${oa_id} ${state}`);
		}

		await onReceiveOauth(currentOA, req.query);

		res.sendStatus(200);
	} catch (e) {
		logger.error(e);
		res.status(500).send(e);
	}
}

router.post('/', verifyRequestSignature, postWebhook);
router.get('/oauth', verifyOauth);

module.exports = { router };

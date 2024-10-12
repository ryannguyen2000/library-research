const express = require('express');
const { middleware } = require('@line/bot-sdk');

const { logger } = require('@utils/logger');
const API = require('@services/line/api');
const models = require('@models');

const router = express.Router();

async function postWebhook(req, res) {
	Promise.all(req.body.events.map(handleEvent))
		.then(() => res.sendStatus(200))
		.catch(err => {
			logger.error(err);
			res.sendStatus(500);
		});
}

async function handleEvent(event) {
	const ott = await models.Ott.findOne({
		line: true,
	});
	const api = new API(ott.lineInfo);
	return api.getLineEvent(event);
}

async function checkMiddleWare(req, res, next) {
	try {
		const ott = await models.Ott.findOne({
			line: true,
		});
		middleware(ott.lineInfo)(req, res, next);
	} catch (error) {
		res.sendStatus(500);
	}
}

router.post('/', checkMiddleWare, postWebhook);

module.exports = { router };

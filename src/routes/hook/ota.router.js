/* eslint-disable prefer-template */
const express = require('express');

const _ = require('lodash');
const moment = require('moment');
const bodyParser = require('body-parser');
require('body-parser-xml')(bodyParser);
const models = require('@models');

const { logger } = require('@utils/logger');
const { OTAs } = require('@utils/const');
const { onReceivedBooking } = require('@controllers/ota_api/crawler_reservations/tiket');
const ctripReservation = require('@src/controllers/ota_api/crawler_reservations/cm_api/ctrip');
const { getXMLResponeError } = require('@src/controllers/ota_api/utils');

const { CTRIP_APPENDIX } = require('@src/controllers/ota_api/const');

const router = express.Router();

async function verifyRequestSignature(req, res, next) {
	try {
		const auth = req.get('Authorization');
		if (!auth) {
			return res.json({
				OTA_HotelResNotifRS: {
					_Version: req.body.OTA_HotelResNotifRQ._Version,
					_TimeStamp: req.body.OTA_HotelResNotifRQ._TimeStamp,
					_EchoToken: req.body.OTA_HotelResNotifRQ._EchoToken,
					Errors: {
						Error: [
							{
								_Type: '4',
								_Code: '6',
								_Value: 'Provided credentials are invalid',
							},
						],
					},
				},
			});
		}

		const key = auth.replace('Basic', '').trim();
		const decoded = Buffer.from(key, 'base64').toString('utf-8');

		const [user, pass] = decoded.split(':');

		const otaConfig = await models.OTAManager.findOne({
			active: true,
			name: OTAs.Tiket,
			'other.hookUsername': user,
			'other.hookPassword': pass,
		});

		if (!otaConfig) {
			return res.json({
				OTA_HotelResNotifRS: {
					_Version: req.body.OTA_HotelResNotifRQ._Version,
					_TimeStamp: req.body.OTA_HotelResNotifRQ._TimeStamp,
					_EchoToken: req.body.OTA_HotelResNotifRQ._EchoToken,
					Errors: {
						Error: [
							{
								_Type: '4',
								_Code: '6',
								_Value: 'Provided credentials are invalid',
							},
						],
					},
				},
			});
		}

		req.body.otaConfig = otaConfig;

		next();
	} catch (e) {
		logger.error(e);
		res.json(500);
	}
}

async function postWebhook(req, res) {
	try {
		const data = req.body;
		logger.info('tiket.com webhook');
		logger.info(typeof data === 'object' ? JSON.stringify(data, '', 4) : data);

		const rs = await onReceivedBooking(data);

		models.APIDebugger.create({
			from: 'tiket.com',
			data,
			headers: req.headers,
			response: rs,
		}).catch(e => {
			logger.error(e);
		});

		logger.info('tiket.com webhook respone');
		logger.info(JSON.stringify(rs, '', 4));

		res.json(rs);
	} catch (e) {
		logger.error(e);
		res.sendStatus(500);
	}
}

async function getRawBody(req, res, next) {
	req.rawBody = req.body;
	next();
}

async function ctripVerify(req, res, next) {
	res.set('Content-Type', 'text/xml');
	try {
		const data = req.body;
		const requestType = _.keys(data);

		const requestorId = _.get(data, [requestType[0], 'pos', 'source', 'requestorid']);
		const user = _.get(requestorId, ['$', 'ID']);

		const pass = _.get(requestorId, ['$', 'MessagePassword']);

		const otaConfig = await models.OTAManager.findOne({
			active: true,
			name: OTAs.Ctrip,
			'other.hookUserName': user,
			'other.hookPassword': pass,
		});
		if (!otaConfig) {
			const responseMessage = getXMLResponeError(data, [
				{
					type: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.TYPE.Authentication.code,
					code: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.CODE.AuthorizationError.codeValue,
					shortText: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.CODE.AuthorizationError.codeName,
				},
			]);

			models.APIDebugger.create({
				from: OTAs.Ctrip,
				data: req.rawBody,
				headers: req.headers,
				response: {
					responseMessage,
					timeStamp: moment().toISOString(),
				},
				receiving: true,
			}).catch(e => {
				logger.error(e);
			});

			return res.send(responseMessage);
		}

		next();
	} catch (e) {
		logger.error(e);
		res.sendStatus(500);
	}
}

async function ctripReservationWebhook(req, res) {
	res.set('Content-Type', 'text/xml');
	let responseMessage = '';

	try {
		responseMessage = await ctripReservation.onReceivedBooking(req, res);
		res.send(responseMessage);
	} catch (e) {
		responseMessage = getXMLResponeError(req.body, [
			{
				type: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.TYPE.BizRule.code,
				code: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.CODE.UnableToProcess.codeValue,
				shortText: CTRIP_APPENDIX.RESERVATION.ERROR_AND_WARNING.CODE.UnableToProcess.codeName,
			},
		]);
		logger.error('Reservation Fail: ', e.message);
		res.status(200).type('text/xml').send(responseMessage);
	}
	const regex = /<UniqueID\s[^>]*ID="(\d+)"\s?\/>/;
	const match = responseMessage.match(regex);
	const uniqId = match ? match[1] : undefined;

	models.APIDebugger.create({
		from: OTAs.Ctrip,
		data: req.rawBody,
		headers: req.headers,
		response: {
			responseMessage,
			timeStamp: moment().toISOString(),
			uniqId,
		},
		receiving: true,
	}).catch(e => {
		logger.error('ctripReservationWebhook', req.rawBody, e);
	});
}

router.post('/ticket.com', verifyRequestSignature, postWebhook);
router.post('/tiket.com', verifyRequestSignature, postWebhook);
router.post(
	'/ctrip/reservations',
	bodyParser.text({ type: '*/*' }),
	getRawBody,
	bodyParser.xml({
		xmlParseOptions: {
			normalize: true, // Trim whitespace inside text nodes
			normalizeTags: true, // Transform tags to lowercase
			explicitArray: false, // Only put nodes in array if >1
		},
	}),
	ctripVerify,
	ctripReservationWebhook
);

module.exports = { router };

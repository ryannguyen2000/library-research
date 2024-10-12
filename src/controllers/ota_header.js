// const _ = require('lodash');
const mongoose = require('mongoose');

const { logger } = require('@utils/logger');
const { responseData, eventEmitter, EVENTS } = require('@services/webExtension');

// const OTP_TIMEOUT = 120 * 1000;

async function getPinCode({ account, otaName, email, time }) {
	if (!email) {
		logger.error('getPinCode error', email, account, otaName);
		return {};
	}

	const pin = await mongoose.model('Passcode').findOTP({
		otaName,
		email,
		time,
	});

	// const t1 = Date.now() + OTP_TIMEOUT;
	// const to = new RegExp(_.escapeRegExp(email), 'i');
	// let pin;

	// while (!pin) {
	// 	const passcode = await mongoose
	// 		.model('Passcode')
	// 		.findOne({ to, createdAt: { $gte: time } })
	// 		.sort({ $natural: -1 });
	// 	pin = passcode && passcode.code;

	// 	if (pin) {
	// 		break;
	// 	}

	// 	if (Date.now() > t1) {
	// 		return null;
	// 	}

	// 	await Promise.delay(500);
	// }

	return { pin };
}

async function responseHeader(req, res) {
	const { account, otaName, ota } = req.query;

	logger.info('responseHeader', req.query);

	await responseData(account, otaName || ota, req.body);

	res.sendData();
}

const Users = new Map();

async function getHeaderCommand(req, res) {
	res.set({
		'Cache-Control': 'no-cache',
		'Content-Type': 'text/event-stream',
		Connection: 'keep-alive',
		'X-Accel-Buffering': 'no',
	});
	res.flushHeaders();

	Users.set(req, res);

	res.on('close', () => {
		Users.delete(req);
		res.end();
	});
}

setInterval(() => {
	eventEmitter.emit(EVENTS.HEADER_REQUEST, { event: 'ping' });
}, 13 * 1000);

eventEmitter.on(EVENTS.HEADER_REQUEST, data => {
	try {
		Users.forEach((res, req) => {
			if (data.event !== 'ping' && data.account !== req.query.account) return;

			const response = `data: ${JSON.stringify(data)}\n\n`;

			res.write(response);
			res.flush();
		});
	} catch (e) {
		logger.error(e);
	}
});

module.exports = {
	responseHeader,
	getHeaderCommand,
	getPinCode,
};

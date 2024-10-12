const _ = require('lodash');
const events = require('events');
const { v4: uuid } = require('uuid');

const { logger } = require('@utils/logger');
const { OTAs } = require('@utils/const');
const { SYS_EVENTS, sysEventEmitter } = require('@utils/events');
const { TYPES } = require('./const');

const eventEmitter = new events.EventEmitter();

const EVENTS = {
	HEADER_REQUEST: 'HEADER_REQUEST',
};

const OTA_TYPES = Object.freeze({
	[OTAs.Booking]: 'BOOKING_GET_HEADERS',
	[OTAs.Airbnb]: 'AIRBNB_GET_HEADERS',
	// [OTAs.Vrbo]: 'VRBO_GET_HEADERS',
	// [OTAs.Vntrip]: 'VNTRIP_GET_HEADERS',
	[OTAs.Agoda]: 'AGODA_GET_HEADERS',
	// [OTAs.Luxstay]: 'LUXSTAY_GET_HEADERS',
	[OTAs.Expedia]: 'EXPEDIA_GET_HEADERS',
	[OTAs.Traveloka]: 'TRAVELOKA_GET_HEADERS',
	[OTAs.Ctrip]: 'CTRIP_GET_HEADERS',
	// [OTAs.Tripi]: 'TRIPI_GET_HEADERS',
	// [OTAs.Grabhotel]: 'GRABHOTEL_GET_HEADERS',
});

const HEADER_TIMEOUT = 60 * 1000 * 2;
const REQUEST_TIMEOUT = 15 * 1000;

const cmdHeaderQueue = [];
const cmdRequestQueue = [];

async function getHeader(accountData) {
	const { name: otaName, username, password, other = {} } = accountData;

	const account = accountData.refAccount || accountData.account;

	logger.info('HEADER: getHeader from ext -> ', otaName, account, username);

	const type = OTA_TYPES[otaName];
	if (!type) {
		throw new Error(`Not found type correspond to ${otaName}`);
	}

	const command = cmdHeaderQueue.find(q => q.otaName === otaName && q.account === account);
	if (command) {
		return command.response;
	}

	const newCommand = {
		otaName,
		account,
		type,
		data: {
			...other,
			email: username,
			password,
		},
	};
	cmdHeaderQueue.push(newCommand);

	eventEmitter.emit(EVENTS.HEADER_REQUEST, _.cloneDeep(newCommand));

	newCommand.response = new Promise((res, rej) => {
		const timer = setTimeout(() => {
			newCommand.doing = false;
			const idx = cmdHeaderQueue.findIndex(c => c === newCommand);
			if (idx >= 0) cmdHeaderQueue.splice(idx, 1);

			rej(new Error(`Get Header Timeout ${otaName} ${account}`));
		}, HEADER_TIMEOUT);

		newCommand.responseFunc = rs => {
			clearTimeout(timer);
			res(rs);
		};
		newCommand.rejectFunc = e => {
			clearTimeout(timer);
			rej(e);
		};
	});

	return newCommand.response;
}

async function responseData(account, otaName, data) {
	if (data.type === OTA_TYPES[otaName]) {
		logger.info('Extension: responseData -> headers', account, otaName, data);

		const commandIdx = cmdHeaderQueue.findIndex(q => q.otaName === otaName && q.account === account);
		if (commandIdx === -1) {
			logger.warn(`Not found command for ${account} ${otaName}`);
			return;
		}

		const command = cmdHeaderQueue[commandIdx];
		command.responseFunc(data);
		cmdHeaderQueue.splice(commandIdx, 1);

		return;
	}

	const commandIdx = cmdRequestQueue.findIndex(q => q.data.requestId === data.data.requestId);
	if (commandIdx === -1) {
		logger.warn(`Not found command for ${account} ${otaName}`, data);
		return;
	}

	const command = cmdRequestQueue[commandIdx];
	command.responseFunc(data.data.result);
	cmdRequestQueue.splice(commandIdx, 1);
}

function sendExtRequest(accountData, url, options) {
	const otaName = accountData.name;
	const account = accountData.refAccount || accountData.account;

	const type = 'SEND_REQUEST';

	// const type = REQUEST_TYPES[otaName];
	// if (!type) {
	// 	throw new Error(`Not found sendExtRequest ${otaName}`);
	// }

	const timeout = _.get(options, 'timeout') || REQUEST_TIMEOUT;
	_.unset(options, 'timeout');

	const newCommand = {
		otaName,
		account,
		type,
		data: {
			url,
			options,
			requestId: uuid(),
		},
	};
	cmdRequestQueue.push(newCommand);

	eventEmitter.emit(EVENTS.HEADER_REQUEST, _.cloneDeep(newCommand));

	newCommand.response = new Promise((res, rej) => {
		const timer = setTimeout(() => {
			newCommand.doing = false;
			const idx = cmdRequestQueue.findIndex(c => c === newCommand);
			if (idx >= 0) cmdRequestQueue.splice(idx, 1);

			rej(new Error(`sendExtRequest throw ext timeout ${otaName} ${account}`));
		}, timeout);

		newCommand.responseFunc = rs => {
			clearTimeout(timer);
			res(rs);
		};
		newCommand.rejectFunc = e => {
			clearTimeout(timer);
			rej(e);
		};
	});

	return newCommand.response;
}

async function processWorkerEvent(worker, message) {
	if (
		message.type !== TYPES.WEBEXT_GET_HEADER &&
		message.type !== TYPES.WEBEXT_SEND_REQUEST &&
		message.type !== TYPES.WEBEXT_SEND_CUSTOM_REQUEST
	)
		return;

	const rs = { id: message.id, type: `${message.type}_POSTBACK` };

	try {
		if (message.type === TYPES.WEBEXT_GET_HEADER) {
			rs.data = await getHeader(message.data);
		} else if (message.type === TYPES.WEBEXT_SEND_REQUEST) {
			rs.data = await sendExtRequest(message.data.accountData, message.data.url, message.data.options);
		} else if (message.type === TYPES.WEBEXT_SEND_CUSTOM_REQUEST) {
			rs.data = await sendCustomRequest(message.data);
		}
	} catch (e) {
		rs.error = e;
	}

	worker.postMessage(rs);
}

async function sendCustomRequest({ accountData, type, data, timeout = REQUEST_TIMEOUT }) {
	const { name: otaName, username } = accountData;

	const account = accountData.refAccount || accountData.account;

	logger.info('sendExtCustomRequest -> ', otaName, account, username);

	const requestId = uuid();

	const newCommand = {
		otaName,
		account,
		type,
		data: {
			...data,
			requestId,
		},
	};

	cmdRequestQueue.push(newCommand);

	eventEmitter.emit(EVENTS.HEADER_REQUEST, _.cloneDeep(newCommand));

	newCommand.response = new Promise((res, rej) => {
		const timer = setTimeout(() => {
			newCommand.doing = false;
			const idx = cmdRequestQueue.findIndex(c => c === newCommand);
			if (idx >= 0) cmdRequestQueue.splice(idx, 1);

			rej(new Error(`sendExtRequest throw ext timeout ${otaName} ${account}`));
		}, timeout);

		newCommand.responseFunc = rs => {
			clearTimeout(timer);
			res(rs);
		};
		newCommand.rejectFunc = e => {
			clearTimeout(timer);
			rej(e);
		};
	});

	return newCommand.response;
}

sysEventEmitter.on(SYS_EVENTS.WORKER_SENT_MESSAGE, processWorkerEvent);

module.exports = {
	getHeader,
	sendExtRequest,
	responseData,
	sendCustomRequest,
	eventEmitter,
	EVENTS,
};

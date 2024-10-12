const { v4: uuid } = require('uuid');
const { parentPort } = require('worker_threads');
const { TYPES } = require('./const');

const cmdQueue = new Map();

parentPort.on('message', message => {
	const cmd = cmdQueue.get(message.id);
	if (!cmd) return;

	if (message.error) {
		cmd.reject(message.error);
	} else {
		cmd.response(message.data);
	}

	cmdQueue.delete(message.id);
});

function sendRequestToMainThread(type, data) {
	return new Promise((response, reject) => {
		const id = uuid();
		parentPort.postMessage({ id, type, data });
		cmdQueue.set(id, { response, reject });
	});
}

function getHeader(accountData) {
	return sendRequestToMainThread(TYPES.WEBEXT_GET_HEADER, accountData.toJSON ? accountData.toJSON() : accountData);
}

function sendExtRequest(accountData, url, options) {
	return sendRequestToMainThread(TYPES.WEBEXT_SEND_REQUEST, {
		accountData: accountData.toJSON ? accountData.toJSON() : accountData,
		url,
		options,
	});
}

function sendCustomRequest(data) {
	return sendRequestToMainThread(TYPES.WEBEXT_SEND_CUSTOM_REQUEST, data);
}

module.exports = {
	getHeader,
	sendExtRequest,
	sendCustomRequest,
};

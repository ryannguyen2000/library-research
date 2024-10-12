const _ = require('lodash');
const { v4: uuid } = require('uuid');
const AsyncLock = require('async-lock');

// const { logger } = require('@utils/logger');
const Uri = require('@utils/uri');
const { eventEmitter, EVENTS } = require('@utils/events');
const { SSE } = require('@utils/SSE');
const ThrowReturn = require('@core/throwreturn');
const models = require('@models');

const TIME_OUT = 10000;
const sse = new SSE();
const lock = new AsyncLock({ timeout: TIME_OUT });

eventEmitter.on(EVENTS.SEND_LOCKER_COMMAND, data => {
	sse.addEvent(data);
});

function getEvents(req, res) {
	sse.addUser(req, res);
}

function clientCallback(req, res) {
	eventEmitter.emit(EVENTS.SEND_LOCKER_CALLBACK, req.body);
	res.sendData();
}

function sendCommand(command) {
	if (!sse.getUsers()) {
		throw new ThrowReturn('There are no Locker server running!');
	}

	const requestId = uuid();

	eventEmitter.emit(EVENTS.SEND_LOCKER_COMMAND, {
		command,
		requestId,
	});

	return new Promise((resolve, reject) => {
		const timmer = setTimeout(() => reject(new ThrowReturn('Timeout!')), TIME_OUT);
		eventEmitter.on(EVENTS.SEND_LOCKER_CALLBACK, data => {
			if (
				_.get(data, 'data.requestId') === requestId
				// && _.get(data, 'response.data.status') === 200
			) {
				clearTimeout(timmer);
				resolve(_.get(data, 'response.data'));
			}
		});
	});
}

async function getRoomData(roomId) {
	const room = await models.Room.findById(roomId);
	if (!room) throw new ThrowReturn('Room not found!');
	if (!_.get(room, 'roomLock.deviceId')) throw new ThrowReturn('Room not config deviceId!');

	return room;
}

function validateBody(body) {
	if (!body.command) {
		throw new ThrowReturn('command not found!');
	}

	return body;
}

async function createCommand(req, res) {
	const { roomId } = req.params;
	const { command, ...params } = validateBody(req.body);

	const room = await getRoomData(roomId);

	const cmd = Uri(command, {
		devid: room.roomLock.deviceId,
		...params,
	});

	const response = await lock.acquire(cmd, async () => await sendCommand(cmd));
	res.sendData(response);
}

async function getUsers(req, res) {
	res.sendData(sse.getUsers());
}

module.exports = {
	createCommand,
	getEvents,
	getUsers,
	clientCallback,
};

const _ = require('lodash');
const WebSocket = require('ws');
const qs = require('qs');
const jwt = require('jsonwebtoken');
// const { parse } = require('url');

const { JWT_CONFIG, SERVER_CONFIG } = require('@config/setting');
const { eventEmitter, EVENTS } = require('@utils/events');
const { InboxType, RolePermissons } = require('@utils/const');
const { logger } = require('@utils/logger');
const UserModel = require('@models/user.model');
const notification = require('@services/notification');

const maxConnectionSSEPerUser = 5;
const throttleTime = 1000;
const pingTime = 14000;
const usersList = {};
let wss;

const interval = setInterval(function ping() {
	if (!wss) return;

	wss.clients.forEach(function each(ws) {
		if (ws.isAlive === false) return ws.terminate();
		ws.isAlive = false;
	});
}, 30000);

function initWS() {
	wss = new WebSocket.Server({
		// noServer: true,
		port: SERVER_CONFIG.WS_PORT,
		verifyClient,
	});

	wss.on('error', function (e) {
		logger.error('Server ws error', e);
	});
	wss.on('connection', onWebsocketConnection);
	wss.on('close', function close() {
		clearInterval(interval);
	});

	logger.info('Server ws opened');
}

function verifyClient({ req }, callback) {
	try {
		const { token } = qs.parse(req.url.split('?')[1]);
		const decoded = jwt.verify(token, JWT_CONFIG.SECRET_KEY);
		req.user = decoded.user;
		callback(true);
	} catch (e) {
		callback(false);
	}
}

function onReceivedMessage() {
	// logger.info('received ws', data);
	this.isAlive = true;
}

function onClosed(e) {
	removeWs(this.req.user._id, this.req);
}

function onError(e) {
	logger.info('error ws', e);
	removeWs(this.req.user._id, this.req);
}

function onWebsocketConnection(ws, req) {
	const userId = req.user._id;
	if (!usersList[userId]) usersList[userId] = new Map();
	usersList[userId].set(req, ws);

	ws.req = req;
	ws.on('message', onReceivedMessage);
	ws.on('close', onClosed);
	ws.on('error', onError);

	ws.send(JSON.stringify({ event: 'CONNECT', message: 'connected' }));
}

function removeWs(userId, req) {
	usersList[userId].delete(req);
	if (!usersList[userId].size) {
		delete usersList[userId];
	}
}

const pushNotify = notification.pushToUsers;

function initOnEvent(func) {
	return _.throttle(func, throttleTime);
}

function sendEvent({ users, data, event }) {
	const acceptUsers = _.keyBy(users);
	const jsonStr = JSON.stringify({ data, event });

	_.forEach(usersList, (responses, userId) => {
		if (users && !acceptUsers[userId]) return;

		responses.forEach(resOrWs => {
			if (resOrWs instanceof WebSocket) {
				resOrWs.send(jsonStr);
			} else {
				resOrWs.write(`data: ${jsonStr}\n\n`);
				resOrWs.flush();
			}
		});
	});
}

function init() {
	setInterval(() => {
		sendEvent({ event: 'ping' });
	}, pingTime);

	eventEmitter.on(
		EVENTS.CAMERA_RECOGNITION,
		initOnEvent(async data => {
			const users = await UserModel.findByPermission({
				permissions: [RolePermissons.CAMERA],
				groupId: data.groupId,
			});
			sendEvent({
				data,
				users,
				event: EVENTS.CAMERA_RECOGNITION,
			});
		})
	);

	eventEmitter.on(
		EVENTS.BANKING_SMS,
		initOnEvent(async ({ account }) => {
			const users = await UserModel.findByPermission({ permissions: [RolePermissons.SMS], ottPhone: account });
			pushNotify({
				title: 'New Banking SMS',
				data: {
					inboxType: InboxType.SMS,
				},
				users,
			});
			sendEvent({
				users,
				event: EVENTS.BANKING_SMS,
			});
		})
	);

	eventEmitter.on(
		EVENTS.RESERVATION_ERROR,
		initOnEvent(async data => {
			const users = await UserModel.findByPermission({
				permissions: [RolePermissons.RESERVATION, RolePermissons.BOOKING],
				blockId: data.blockId,
			});
			pushNotify({
				users,
				title: 'Reservation Error',
				data: {
					inboxType: InboxType.RESERVATION_ERROR,
					bookingId: data._id.toString(),
				},
			});
			sendEvent({
				users,
				data,
				event: EVENTS.RESERVATION_ERROR,
			});
		})
	);

	eventEmitter.on(
		EVENTS.MESSAGE_SEND,
		initOnEvent(async data => {
			if (data.mthread && data.mthread.notification === false) {
				return;
			}
			const users = await UserModel.findByPermission({
				permissions: [RolePermissons.INBOX],
				groupId: data.groupIds,
			});
			sendEvent({
				users,
				data,
				event: EVENTS.MESSAGE_SEND,
			});
		})
	);

	eventEmitter.on(
		EVENTS.MESSAGE_RECEIVE,
		initOnEvent(async data => {
			if (data.mthread && data.mthread.notification === false) {
				return;
			}
			const users = await UserModel.findByPermission({
				permissions: [RolePermissons.INBOX],
				groupId: data.groupIds,
			});
			sendEvent({
				users,
				data,
				event: EVENTS.MESSAGE_RECEIVE,
			});
		})
	);

	eventEmitter.on(
		EVENTS.MESSAGE_TYPING,
		initOnEvent(async ({ mthread, messageId, user }) => {
			if (mthread && mthread.notification === false) {
				return;
			}
			const users = await UserModel.findByPermission({
				permissions: [RolePermissons.INBOX],
				groupId: user.groupIds,
			});
			sendEvent({
				users: users.filter(id => !id.equals(user._id)),
				data: {
					messageId,
					sender: _.pick(user, ['_id', 'name', 'username', 'avatar']),
				},
				event: EVENTS.MESSAGE_TYPING,
			});
		})
	);

	eventEmitter.on(
		EVENTS.TASK_UPDATE_STATUS,
		initOnEvent(async task => {
			const users = await UserModel.findByPermission({
				permissions: [RolePermissons.TASK],
				blockId: task.blockId,
			});
			sendEvent({
				users,
				data: {
					taskId: task._id,
					status: task.status,
					bookingId: task.bookingId,
					messageId: task.messageId,
				},
				event: EVENTS.TASK_UPDATE_STATUS,
			});
		})
	);

	eventEmitter.on(EVENTS.BOOKING_BSTATUS_UPDATED, async (data, statusList) => {
		const users = await UserModel.findByPermission({
			permissions: [RolePermissons.INBOX],
			blockId: data.blockId,
		});
		const arr = _.isArray(statusList) ? statusList : [statusList];

		arr.forEach(bStatusData => {
			sendEvent({
				users,
				data: {
					bookingId: data.bookingId,
					otaName: data.otaName,
					otaBookingId: data.otaBookingId,
					...bStatusData,
				},
				event: EVENTS.BOOKING_BSTATUS_UPDATED,
			});
		});
	});
}

async function getEvents(req, res) {
	const userId = req.decoded.user._id;

	res.set({
		'Cache-Control': 'no-cache',
		'Content-Type': 'text/event-stream',
		Connection: 'keep-alive',
		'X-Accel-Buffering': 'no',
	});
	res.flushHeaders();

	if (_.get(usersList, [userId, 'size']) >= maxConnectionSSEPerUser) {
		return res.end();
	}

	if (!usersList[userId]) usersList[userId] = new Map();
	usersList[userId].set(req, res);

	res.on('close', () => {
		removeWs(userId, req);
		res.end();
	});
}

init();

module.exports = {
	getEvents,
	initWS,
};

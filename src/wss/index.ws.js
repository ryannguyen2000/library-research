const _ = require('lodash');

const { eventEmitter, EVENTS } = require('@utils/events');
const { RolePermissons, UserRoles } = require('@utils/const');
const { logger } = require('@utils/logger');
const UserModel = require('@models/user.model');

const ref = {};

async function onWebsocketConnection(ws, wss) {
	try {
		const dUser = ws.req.decoded.user;

		if (!ref.wss) {
			ref.wss = wss;
		}

		const sameWsUser = Array.from(wss.clients).find(
			({ req }) =>
				req.user && req.user._id.toString() === dUser._id.toString() && req.user.revokeKey === dUser.revokeKey
		);
		if (sameWsUser) {
			ws.req.user = _.cloneDeep(sameWsUser.req.user);
		} else {
			const user = await UserModel.findOne({ _id: dUser._id, enable: true, revokeKey: dUser.revokeKey }).select(
				'role groupIds'
			);
			if (user) {
				ws.req.user = {
					...user.toObject(),
					permissions: await user.getPermissions(),
					blockIds: await user.getBlockIds(),
					ottPhones: await user.getOttPhones(),
				};
			}
		}

		if (!ws.req.user) {
			return ws.terminate();
		}
	} catch (e) {
		logger.error('onWebsocketConnection', e);
	}
}

function isUserMatch(user, { permissions, groupIds, ottPhone, blockId, ignoreUsers }) {
	let isValid = true;

	if (groupIds) {
		isValid = user.groupIds.some(groupId => groupIds.some(grid => _.toString(grid) === _.toString(groupId)));
	}
	if (isValid && permissions) {
		isValid = user.role === UserRoles.ADMIN || permissions.some(permission => user.permissions[permission]);
	}
	if (isValid && blockId) {
		isValid = user.role === UserRoles.ADMIN || user.blockIds.some(blId => _.toString(blId) === _.toString(blockId));
	}
	if (isValid && ottPhone) {
		isValid = user.ottPhones.includes(ottPhone);
	}
	if (isValid && ignoreUsers) {
		isValid = !ignoreUsers[user._id];
	}

	return isValid;
}

function sendEvent({ data, event, ...opts }) {
	if (!ref.wss) return;

	const jsonStr = JSON.stringify({ data, event });
	const matchUsers = {};

	ref.wss.clients.forEach(ws => {
		const { user } = ws.req;

		if (!user) return;

		if (matchUsers[user._id] === undefined) {
			matchUsers[user._id] = isUserMatch(user, opts);
		}

		if (matchUsers[user._id]) {
			ws.send(jsonStr);
		}
	});
}

function init() {
	eventEmitter.on(EVENTS.CAMERA_RECOGNITION, data => {
		sendEvent({
			event: EVENTS.CAMERA_RECOGNITION,
			permissions: [RolePermissons.CAMERA],
			groupIds: data.groupIds,
			data,
		});
	});

	eventEmitter.on(EVENTS.BANKING_SMS, ({ account }) => {
		sendEvent({
			event: EVENTS.BANKING_SMS,
			permissions: [RolePermissons.SMS],
			ottPhone: account,
		});
	});

	eventEmitter.on(EVENTS.RESERVATION_ERROR, data => {
		sendEvent({
			event: EVENTS.RESERVATION_ERROR,
			permissions: [RolePermissons.RESERVATION, RolePermissons.BOOKING],
			blockId: data.blockId,
			data,
		});
	});

	eventEmitter.on(EVENTS.MESSAGE_SEND, data => {
		if (data.mthread && data.mthread.notification === false) {
			return;
		}
		sendEvent({
			event: EVENTS.MESSAGE_SEND,
			permissions: [RolePermissons.INBOX],
			groupIds: data.groupIds,
			data,
		});
	});

	eventEmitter.on(EVENTS.MESSAGE_RECEIVE, async data => {
		if (data.mthread && data.mthread.notification === false) {
			return;
		}
		sendEvent({
			event: EVENTS.MESSAGE_RECEIVE,
			permissions: [RolePermissons.INBOX],
			groupIds: data.groupIds,
			data,
		});
	});

	eventEmitter.on(EVENTS.MESSAGE_TYPING, ({ mthread, messageId, user }) => {
		if (mthread && mthread.notification === false) {
			return;
		}
		sendEvent({
			event: EVENTS.MESSAGE_TYPING,
			permissions: [RolePermissons.INBOX],
			groupIds: user.groupIds,
			ignoreUsers: { [user._id]: true },
			data: {
				messageId,
				sender: _.pick(user, ['_id', 'name', 'username', 'avatar']),
			},
		});
	});

	eventEmitter.on(EVENTS.TASK_UPDATE_STATUS, task => {
		sendEvent({
			event: EVENTS.TASK_UPDATE_STATUS,
			permissions: [RolePermissons.TASK],
			blockId: task.blockId,
			data: {
				taskId: task._id,
				status: task.status,
				bookingId: task.bookingId,
				messageId: task.messageId,
			},
		});
	});

	eventEmitter.on(EVENTS.BOOKING_BSTATUS_UPDATED, (data, statusList) => {
		const arr = _.isArray(statusList) ? statusList : [statusList];

		arr.forEach(bStatusData => {
			sendEvent({
				event: EVENTS.BOOKING_BSTATUS_UPDATED,
				permissions: [RolePermissons.INBOX],
				blockId: data.blockId,
				data: {
					bookingId: data.bookingId,
					otaName: data.otaName,
					otaBookingId: data.otaBookingId,
					...bStatusData,
				},
			});
		});
	});

	eventEmitter.on(EVENTS.BOOKING_CHARGED_STATUS_UPDATE, data => {
		sendEvent({
			event: EVENTS.BOOKING_CHARGED_STATUS_UPDATE,
			permissions: [RolePermissons.FINANCE],
			blockId: data.blockId,
			data,
		});
	});
}

init();

module.exports = {
	onWebsocketConnection,
	path: '/',
};
